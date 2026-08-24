export const DEPLOYMENTS = [
  {
    id: "zero-copy",
    title: "Zero-copy rendering",
    mark: "Z",
    binding: "ZERO_COPY",
    upstreamOrigin: "https://zero-copy-prd.seeb.workers.dev",
  },
  {
    id: "frame-pacing",
    title: "FramePacing",
    mark: "F",
    binding: "FRAME_PACING",
    upstreamOrigin: "https://frame-pacing.seeb.workers.dev",
  },
  {
    id: "actions",
    title: "Jewel shortcuts",
    mark: "J",
    binding: "ACTIONS",
    upstreamOrigin: "https://jewel-shortcuts-review.seeb.workers.dev",
  },
  {
    id: "pioneer-profile-file-design",
    title: "Pioneer profiles",
    mark: "P",
    binding: "PIONEER_PROFILE_FILE_DESIGN",
    upstreamOrigin: "https://pioneer-profile-file-design.seeb.workers.dev",
  },
  {
    id: "punaro-indirect-internet-architecture",
    title: "Punaro",
    mark: "P",
    binding: "PUNARO_INDIRECT_INTERNET_ARCHITECTURE",
    upstreamOrigin: "https://punaro-indirect-internet-architecture.seeb.workers.dev",
  },
  {
    id: "compose-stack-traces",
    title: "Compose diagnostics",
    mark: "C",
    binding: "COMPOSE_STACK_TRACES",
    upstreamOrigin: "https://compose-stack-traces.seeb.workers.dev",
  },
];

const URL_ATTRIBUTES = ["href", "src", "action", "poster"];

export const matchDeployment = (pathname) =>
  DEPLOYMENTS.find(({ id }) => pathname === `/${id}` || pathname.startsWith(`/${id}/`));

export const rewriteUrlValue = (value, deployment) => {
  if (!value || value.startsWith("#") || value.startsWith("//")) return value;

  if (value.startsWith("/")) return `/${deployment.id}${value}`;

  try {
    const url = new URL(value);
    if (url.origin !== deployment.upstreamOrigin) return value;
    return `/${deployment.id}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
};

export const rewriteLocation = (location, deployment) => rewriteUrlValue(location, deployment);

export const createUpstreamRequest = (request, deployment) => {
  const publicUrl = new URL(request.url);
  const upstreamUrl = new URL(deployment.upstreamOrigin);
  const prefix = `/${deployment.id}`;

  upstreamUrl.pathname = publicUrl.pathname.slice(prefix.length) || "/";
  upstreamUrl.search = publicUrl.search;
  return new Request(upstreamUrl, request);
};

class AttributeRewriter {
  constructor(deployment) {
    this.deployment = deployment;
  }

  element(element) {
    for (const attribute of URL_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null) element.setAttribute(attribute, rewriteUrlValue(value, this.deployment));
    }
  }
}

export const houseStyleClassName = (deployment) =>
  `spec-house spec-house--${deployment.id}`;

export const usesEmbeddedHouseStyle = (deployment) =>
  deployment.id === "actions" || deployment.id === "zero-copy" || deployment.id === "compose-stack-traces";

export const createHouseStyleHeader = (deployment) => `
  <header class="spec-house-header">
    <nav class="spec-house-nav" aria-label="Specs">
      <a class="spec-house-brand" href="https://specs.sebastiano.dev/">
        <span class="spec-house-mark" aria-hidden="true">${deployment.mark}</span>
        <span>${deployment.title}</span>
      </a>
      <div class="spec-house-links">
        <a href="https://specs.sebastiano.dev/">All specs</a>
        <a href="https://specs.sebastiano.dev/actions/">House style</a>
      </div>
    </nav>
  </header>`;

class HouseStyleHeadRewriter {
  element(element) {
    element.append(
      '<link rel="stylesheet" href="https://specs.sebastiano.dev/house-style.css">',
      { html: true },
    );
  }
}

class HouseStyleBodyRewriter {
  constructor(deployment) {
    this.deployment = deployment;
  }

  element(element) {
    const existingClass = element.getAttribute("class");
    element.setAttribute(
      "class",
      [existingClass, houseStyleClassName(this.deployment)].filter(Boolean).join(" "),
    );
    element.prepend(createHouseStyleHeader(this.deployment), { html: true });
  }
}

const proxy = async (request, env, deployment) => {
  const service = env[deployment.binding];
  if (!service) return new Response("Spec service binding is unavailable.", { status: 502 });

  const upstreamResponse = await service.fetch(createUpstreamRequest(request, deployment));
  const headers = new Headers(upstreamResponse.headers);
  const location = headers.get("location");
  if (location) headers.set("location", rewriteLocation(location, deployment));

  const response = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });

  if (!headers.get("content-type")?.includes("text/html")) return response;

  const rewriter = new HTMLRewriter().on("*", new AttributeRewriter(deployment));

  if (usesEmbeddedHouseStyle(deployment)) return rewriter.transform(response);

  return rewriter
    .on("head", new HouseStyleHeadRewriter())
    .on("body", new HouseStyleBodyRewriter(deployment))
    .transform(response);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const deployment = matchDeployment(url.pathname);

    if (!deployment) return env.ASSETS.fetch(request);

    if (url.pathname === `/${deployment.id}`) {
      url.pathname += "/";
      return Response.redirect(url, 308);
    }

    return proxy(request, env, deployment);
  },
};
