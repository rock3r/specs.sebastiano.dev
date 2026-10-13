import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const script = new URL("./register-spec.mjs", import.meta.url).pathname;

const register = async (catalog, ...extra) =>
  run(process.execPath, [script, "--catalog", catalog, "--project", "cav", "--project-id", "cav", ...extra]);

const fresh = async () => {
  const dir = await mkdtemp(join(tmpdir(), "register-spec-"));
  const catalog = join(dir, "specs.json");
  await writeFile(catalog, JSON.stringify({ projects: [] }));
  return catalog;
};

const specs = async (catalog) => JSON.parse(await readFile(catalog, "utf8")).projects[0].specs;

test("a second deployment adds a spec to the project", async () => {
  const catalog = await fresh();
  await register(catalog, "--title", "Tools", "--date", "2026-10-08", "--url", "https://specs.sebastiano.dev/tools/");
  await register(catalog, "--title", "Flow", "--date", "2026-10-13", "--url", "https://specs.sebastiano.dev/flow/");
  assert.deepEqual((await specs(catalog)).map((s) => s.title), ["Flow", "Tools"]);
});

test("the same deployment replaces its own row", async () => {
  const catalog = await fresh();
  await register(catalog, "--title", "Tools", "--date", "2026-10-08", "--url", "https://specs.sebastiano.dev/tools/");
  await register(catalog, "--title", "Tools v2", "--date", "2026-10-09", "--url", "https://specs.sebastiano.dev/tools/");
  assert.deepEqual((await specs(catalog)).map((s) => s.title), ["Tools v2"]);
});

const tools = ["--title", "Tools", "--id", "tools", "--url", "https://specs.sebastiano.dev/tools/"];

test("the first versioned publish keeps the unversioned state as a dated revision", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-09-01");
  assert.equal((await specs(catalog))[0].history, undefined);

  await register(catalog, ...tools, "--date", "2026-10-01", "--version", "2.0", "--change", "Added iOS", "--change", "Dropped v1 API");
  const [spec] = await specs(catalog);
  assert.equal(spec.version, "2.0");
  assert.deepEqual(spec.history, [
    { version: "2.0", date: "2026-10-01", changes: ["Added iOS", "Dropped v1 API"] },
    { date: "2026-09-01", changes: [] },
  ]);
});

test("the same version replaces its revision and a new version goes first", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-10-01", "--version", "1.0", "--change", "First");
  await register(catalog, ...tools, "--date", "2026-10-02", "--version", "1.0", "--change", "First, fixed");
  await register(catalog, ...tools, "--date", "2026-10-05", "--version", "1.1", "--change", "More");
  const [spec] = await specs(catalog);
  assert.equal(spec.version, "1.1");
  assert.deepEqual(
    spec.history.map((revision) => [revision.version, revision.date, revision.changes]),
    [
      ["1.1", "2026-10-05", ["More"]],
      ["1.0", "2026-10-01", ["First, fixed"]],
    ],
  );
});

test("a publish without --version keeps the history", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-10-01", "--version", "1.0", "--change", "First");
  await register(catalog, ...tools, "--date", "2026-10-03", "--description", "Reworded");
  const [spec] = await specs(catalog);
  assert.equal(spec.version, "1.0");
  assert.equal(spec.history.length, 1);
  assert.equal(spec.description, "Reworded");
});

test("bad versions and changes without a version are rejected", async () => {
  const catalog = await fresh();
  await assert.rejects(register(catalog, ...tools, "--date", "2026-10-01", "--version", "v1"), /--version must look like/);
  await assert.rejects(register(catalog, ...tools, "--date", "2026-10-01", "--change", "Orphan"), /--change needs --version/);
});

test("correcting an older version keeps the newer version current", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-10-01", "--version", "1.0", "--change", "First");
  await register(catalog, ...tools, "--date", "2026-10-05", "--version", "1.1", "--change", "More");
  await register(catalog, ...tools, "--date", "2026-10-06", "--version", "1.0", "--change", "First, fixed");
  const [spec] = await specs(catalog);
  assert.equal(spec.version, "1.1");
  assert.deepEqual(
    spec.history.map((revision) => [revision.version, revision.changes]),
    [
      ["1.1", ["More"]],
      ["1.0", ["First, fixed"]],
    ],
  );
});

test("backfilling an older version keeps the newest version first", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-09-01");
  await register(catalog, ...tools, "--date", "2026-10-05", "--version", "1.10", "--change", "Ten");
  await register(catalog, ...tools, "--date", "2026-10-06", "--version", "1.2", "--change", "Two");
  await register(catalog, ...tools, "--date", "2026-10-07", "--version", "1.10.1-rc1", "--change", "RC");
  const [spec] = await specs(catalog);
  assert.equal(spec.version, "1.10.1-rc1");
  assert.deepEqual(
    spec.history.map((revision) => revision.version ?? revision.date),
    ["1.10.1-rc1", "1.10", "1.2", "2026-09-01"],
  );
});

test("a second spelling of an existing version is rejected", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-10-01", "--version", "2.1", "--change", "First");
  await assert.rejects(
    register(catalog, ...tools, "--date", "2026-10-02", "--version", "2.1.0", "--change", "Again"),
    /--version 2\.1\.0 is the same version as 2\.1\. Use 2\.1\./,
  );
  assert.equal((await specs(catalog))[0].version, "2.1");
});

test("pre-release numbers compare numerically and backfills keep the current date", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-10-01", "--version", "1.0-rc9", "--change", "Nine");
  await register(catalog, ...tools, "--date", "2026-10-02", "--version", "1.0-rc10", "--change", "Ten");
  await register(catalog, ...tools, "--date", "2026-09-01", "--version", "0.9", "--change", "Old");
  const [spec] = await specs(catalog);
  assert.equal(spec.version, "1.0-rc10");
  assert.equal(spec.date, "2026-10-02");
  assert.deepEqual(spec.history.map((revision) => revision.version), ["1.0-rc10", "1.0-rc9", "0.9"]);
});

test("an option without a value and a version without a change are rejected", async () => {
  const catalog = await fresh();
  await assert.rejects(register(catalog, ...tools, "--date", "2026-10-01", "--version"), /--version needs a value/);
  await assert.rejects(register(catalog, ...tools, "--date", "2026-10-01", "--version", "1.0"), /needs at least one --change/);
});

test("pre-release suffixes order like semver, with no locale involved", async () => {
  const catalog = await fresh();
  for (const version of ["1.0-rc.10", "1.0-alpha", "1.0-rc.2", "1.0-beta.1", "1.0-rc"]) {
    await register(catalog, ...tools, "--date", "2026-10-01", "--version", version, "--change", version);
  }
  const [spec] = await specs(catalog);
  assert.deepEqual(
    spec.history.map((revision) => revision.version),
    ["1.0-rc.10", "1.0-rc.2", "1.0-rc", "1.0-beta.1", "1.0-alpha"],
  );
});

test("a date that does not apply is reported", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-10-01", "--version", "1.0", "--change", "First");
  const { stderr } = await register(catalog, ...tools, "--date", "2026-10-09", "--description", "Reworded");
  assert.match(stderr, /keeps 2026-10-01, the date of v1\.0/);
  assert.equal((await specs(catalog))[0].date, "2026-10-01");
});

test("numbers beyond the safe integer range stay distinct", async () => {
  const catalog = await fresh();
  await register(catalog, ...tools, "--date", "2026-10-01", "--version", "1.0-rc9007199254740992", "--change", "A");
  await register(catalog, ...tools, "--date", "2026-10-02", "--version", "1.0-rc9007199254740993", "--change", "B");
  assert.equal((await specs(catalog))[0].version, "1.0-rc9007199254740993");
});
