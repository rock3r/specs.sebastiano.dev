const catalog = document.querySelector("#catalog");
const catalogMeta = document.querySelector("#catalog-meta");
const retryButton = document.querySelector("#catalog-retry");
const catalogViews = {
  loading: document.querySelector("#catalog-loading"),
  projects: document.querySelector("#catalog-projects"),
  empty: document.querySelector("#catalog-empty"),
  error: document.querySelector("#catalog-error"),
};

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
  kind.textContent = spec.version ? `${spec.kind || "spec"} · v${spec.version}` : spec.kind || "spec";
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

function showCatalog(state, status) {
  catalog.setAttribute("aria-busy", String(state === "loading"));
  for (const [name, view] of Object.entries(catalogViews)) {
    view.hidden = name !== state;
  }
  catalogMeta.textContent = status;
}

async function loadCatalog({ retry = false } = {}) {
  if (retry) catalogMeta.focus();
  showCatalog("loading", "Loading the index…");

  try {
    const response = await fetch("specs.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Catalog unavailable");
    const data = await response.json();
    const projects = data.projects
      .filter((project) => project.specs.length > 0)
      .sort((a, b) => latestDate(b) - latestDate(a));
    const total = projects.reduce((sum, project) => sum + project.specs.length, 0);

    if (total === 0) {
      showCatalog("empty", "0 specs");
      return;
    }

    catalogViews.projects.replaceChildren(...projects.map(renderProject));
    showCatalog("projects", `${total} ${total === 1 ? "spec" : "specs"} across ${projects.length} ${projects.length === 1 ? "project" : "projects"} · newest first`);
  } catch {
    showCatalog("error", "Couldn’t load the specs catalog.");
    if (retry) retryButton.focus();
  }
}

retryButton.addEventListener("click", () => loadCatalog({ retry: true }));
loadCatalog();
