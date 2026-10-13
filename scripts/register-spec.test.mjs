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
      ["1.0", "2026-10-02", ["First, fixed"]],
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
