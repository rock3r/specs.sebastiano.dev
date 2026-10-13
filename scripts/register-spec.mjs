#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const options = {};
// `--change` can repeat: one changelog line per flag.
const changes = [];

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (!argument.startsWith("--")) continue;
  const key = argument.slice(2);
  const value = args[index + 1]?.startsWith("--") ? true : args[++index];
  if (key === "change") changes.push(value);
  else options[key] = value;
}

const required = ["project", "title", "url", "date"];
const missing = required.filter((key) => !options[key]);
if (missing.length > 0) {
  console.error(`Missing required options: ${missing.map((key) => `--${key}`).join(", ")}`);
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
  console.error("--date must use YYYY-MM-DD");
  process.exit(1);
}

if (options.version !== undefined && !/^\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?$/.test(options.version)) {
  console.error("--version must look like 2, 2.1 or 2.1.3, with an optional -suffix");
  process.exit(1);
}

if (changes.some((change) => typeof change !== "string" || !change.trim())) {
  console.error("--change needs a text value");
  process.exit(1);
}

if (changes.length > 0 && !options.version) {
  console.error("--change needs --version: a changelog belongs to a version");
  process.exit(1);
}

let publicUrl;
try {
  publicUrl = new URL(options.url);
} catch {
  console.error("--url must be an absolute URL");
  process.exit(1);
}

if (
  publicUrl.origin !== "https://specs.sebastiano.dev" ||
  !/^\/[a-z0-9-]+\/$/.test(publicUrl.pathname) ||
  publicUrl.search ||
  publicUrl.hash
) {
  console.error("--url must be a canonical https://specs.sebastiano.dev/[id]/ deployment root");
  process.exit(1);
}

const catalogPath = options.catalog
  ? resolve(options.catalog)
  : resolve(new URL("..", import.meta.url).pathname, "specs.json");
const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const projectId = options["project-id"] || slugify(options.project);
let project = catalog.projects.find((entry) => entry.id === projectId);

if (!project) {
  project = {
    id: projectId,
    name: options.project,
    description: options["project-description"] || "",
    specs: [],
  };
  catalog.projects.push(project);
} else if (options["project-description"]) {
  project.description = options["project-description"];
}

// Orders versions like 2.1.0 > 2.1 > 2.1.0-rc1 > 2.0. A suffix marks a pre-release.
const compareVersions = (a, b) => {
  const [coreA, suffixA = ""] = a.split(/-(.*)/s);
  const [coreB, suffixB = ""] = b.split(/-(.*)/s);
  const partsA = coreA.split(".").map(Number);
  const partsB = coreB.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (suffixA === suffixB) return 0;
  if (!suffixA) return 1;
  if (!suffixB) return -1;
  return suffixA.localeCompare(suffixB, "en", { numeric: true });
};

const id = options.id || slugify(options.title);
// One deployment gets one row: replace the spec with the same URL or id, keep the others.
const existing = project.specs.findIndex((entry) => entry.url === options.url || entry.id === id);
const replacedExisting = existing >= 0;
const previous = replacedExisting ? project.specs[existing] : undefined;

// The history is the spec's changelog, newest first. The sebastiano.dev feed turns each
// revision into one entry, so a revision's version (or date, when it has none) must never be reused
// for different content.
let history = previous?.history ? [...previous.history] : [];
if (options.version) {
  if (previous && !previous.history?.length) {
    // The first versioned publish keeps the unversioned state as a dated revision, so the
    // feed entry it already produced stays in place.
    history.push({ date: previous.date, changes: [] });
  }
  const revision = { version: options.version, date: options.date, changes: changes.map((change) => change.trim()) };
  // Correcting an existing version keeps its place. A new version goes in version order, so
  // backfilling an older one never displaces the newest. Dated revisions without a version
  // predate versioning and stay last.
  const twin = history.find(
    (entry) => entry.version && entry.version !== options.version && compareVersions(entry.version, options.version) === 0,
  );
  if (twin) {
    console.error(`--version ${options.version} is the same version as ${twin.version}. Use ${twin.version}.`);
    process.exit(1);
  }
  const index = history.findIndex((entry) => entry.version === options.version);
  if (index >= 0) {
    history[index] = revision;
  } else {
    const before = history.findIndex(
      (entry) => !entry.version || compareVersions(entry.version, options.version) < 0,
    );
    history.splice(before >= 0 ? before : history.length, 0, revision);
  }
}

const spec = {
  id,
  title: options.title,
  // A versioned spec shows the date of its current revision, even when an older one was just added.
  date: history[0]?.version ? history[0].date : options.date,
  url: options.url,
  ...(options.description ? { description: options.description } : {}),
  ...(options.kind ? { kind: options.kind } : {}),
  ...(history[0]?.version ? { version: history[0].version } : {}),
  ...(history.length > 0 ? { history } : {}),
};

if (replacedExisting) project.specs[existing] = spec;
else project.specs.push(spec);

for (const entry of catalog.projects) entry.specs.sort((a, b) => b.date.localeCompare(a.date));
catalog.projects.sort((a, b) => (b.specs[0]?.date || "").localeCompare(a.specs[0]?.date || ""));
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `${replacedExisting ? "Updated" : "Registered"} ${spec.title}${spec.version ? ` v${spec.version}` : ""} under ${project.name}`,
);
