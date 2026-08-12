const catalog = document.querySelector("#catalog");
const catalogMeta = document.querySelector("#catalog-meta");

const formatDate = (value) => {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
};

const latestDate = (project) =>
  project.specs.reduce((latest, spec) => Math.max(latest, Date.parse(spec.date)), 0);

const renderSpec = (spec) => {
  const link = document.createElement("a");
  link.className = "spec-link";
  link.href = spec.url;
  link.target = "_blank";
  link.rel = "noreferrer";

  const date = document.createElement("time");
  date.className = "spec-date";
  date.dateTime = spec.date;
  date.textContent = formatDate(spec.date);

  const copy = document.createElement("span");
  copy.className = "spec-copy";
  const title = document.createElement("span");
  title.className = "spec-title";
  title.textContent = spec.title;
  copy.append(title);

  if (spec.description) {
    const description = document.createElement("p");
    description.className = "spec-description";
    description.textContent = spec.description;
    copy.append(description);
  }

  const kind = document.createElement("span");
  kind.className = "spec-kind";
  kind.textContent = spec.kind || "spec";
  link.append(date, copy, kind);
  return link;
};

const renderProject = (project) => {
  const section = document.createElement("section");
  section.className = "project";
  const heading = document.createElement("div");
  heading.className = "project-heading";
  const title = document.createElement("h2");
  title.textContent = project.name;
  const count = document.createElement("span");
  count.className = "spec-kind";
  count.textContent = `${project.specs.length} ${project.specs.length === 1 ? "spec" : "specs"}`;
  heading.append(title, count);
  section.append(heading);

  if (project.description) {
    const description = document.createElement("p");
    description.className = "project-description";
    description.textContent = project.description;
    section.append(description);
  }

  const list = document.createElement("div");
  list.className = "spec-list";
  [...project.specs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((spec) => list.append(renderSpec(spec)));
  section.append(list);
  return section;
};

fetch("specs.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    const projects = [...data.projects].sort((a, b) => latestDate(b) - latestDate(a));
    const total = projects.reduce((sum, project) => sum + project.specs.length, 0);
    catalogMeta.textContent = `${total} ${total === 1 ? "spec" : "specs"} across ${projects.length} ${projects.length === 1 ? "project" : "projects"} · newest first`;
    catalog.replaceChildren(...projects.map(renderProject));
  })
  .catch((error) => {
    catalogMeta.textContent = "The index is temporarily unavailable.";
    const message = document.createElement("p");
    message.className = "error";
    message.textContent = error.message;
    catalog.replaceChildren(message);
  });
