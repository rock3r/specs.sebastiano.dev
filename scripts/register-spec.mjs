#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalogPath = resolve(new URL("..", import.meta.url).pathname, "specs.json");
const args = process.argv.slice(2);
const options = {};

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (!argument.startsWith("--")) continue;
  const key = argument.slice(2);
  options[key] = args[index + 1]?.startsWith("--") ? true : args[++index];
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

const spec = {
  id: options.id || slugify(options.title),
  title: options.title,
  date: options.date,
  url: options.url,
  ...(options.description ? { description: options.description } : {}),
  ...(options.kind ? { kind: options.kind } : {}),
};

const replacedExisting = project.specs.length > 0;
project.specs = [spec];

for (const entry of catalog.projects) entry.specs.sort((a, b) => b.date.localeCompare(a.date));
catalog.projects.sort((a, b) => (b.specs[0]?.date || "").localeCompare(a.specs[0]?.date || ""));
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`${replacedExisting ? "Updated" : "Registered"} ${spec.title} under ${project.name}`);
