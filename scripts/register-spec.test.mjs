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
