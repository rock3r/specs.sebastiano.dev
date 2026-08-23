import assert from "node:assert/strict";
import test from "node:test";

import {
  createUpstreamRequest,
  matchDeployment,
  rewriteLocation,
  rewriteUrlValue,
} from "./index.mjs";

const framePacing = matchDeployment("/frame-pacing/");
const actions = matchDeployment("/actions/diff-walkthrough.html");
const pioneer = matchDeployment("/pioneer-profile-file-design/");
const punaro = matchDeployment("/punaro-indirect-internet-architecture/");
const zeroCopy = matchDeployment("/zero-copy/");

test("matches only deployment path boundaries", () => {
  assert.equal(framePacing?.binding, "FRAME_PACING");
  assert.equal(actions?.binding, "ACTIONS");
  assert.equal(pioneer?.binding, "PIONEER_PROFILE_FILE_DESIGN");
  assert.equal(punaro?.binding, "PUNARO_INDIRECT_INTERNET_ARCHITECTURE");
  assert.equal(zeroCopy?.binding, "ZERO_COPY");
  assert.equal(matchDeployment("/action"), undefined);
  assert.equal(matchDeployment("/actions-extra"), undefined);
  assert.equal(matchDeployment("/punaro-indirect-internet-architecture-extra"), undefined);
  assert.equal(matchDeployment("/zero-copy-extra"), undefined);
});

test("maps the zero-copy public root and assets to its Worker", () => {
  const request = new Request("https://specs.sebastiano.dev/zero-copy/styles.css");
  const upstream = createUpstreamRequest(request, zeroCopy);

  assert.equal(upstream.url, "https://zero-copy-prd.seeb.workers.dev/styles.css");
  assert.equal(rewriteUrlValue("/app.js", zeroCopy), "/zero-copy/app.js");
});

test("maps the Pioneer public root to its Worker", () => {
  const request = new Request("https://specs.sebastiano.dev/pioneer-profile-file-design/");
  const upstream = createUpstreamRequest(request, pioneer);

  assert.equal(upstream.url, "https://pioneer-profile-file-design.seeb.workers.dev/");
});

test("maps the Punaro public root to its Worker", () => {
  const request = new Request("https://specs.sebastiano.dev/punaro-indirect-internet-architecture/");
  const upstream = createUpstreamRequest(request, punaro);

  assert.equal(upstream.url, "https://punaro-indirect-internet-architecture.seeb.workers.dev/");
});

test("maps public paths to the service request", () => {
  const request = new Request("https://specs.sebastiano.dev/actions/media/demo.mp4?v=2");
  const upstream = createUpstreamRequest(request, actions);

  assert.equal(upstream.url, "https://jewel-shortcuts-review.seeb.workers.dev/media/demo.mp4?v=2");
});

test("prefixes root-relative and upstream absolute links", () => {
  assert.equal(rewriteUrlValue("/prd.html#api", framePacing), "/frame-pacing/prd.html#api");
  assert.equal(
    rewriteUrlValue("https://frame-pacing.seeb.workers.dev/prd.html", framePacing),
    "/frame-pacing/prd.html",
  );
  assert.equal(rewriteUrlValue("styles.css", actions), "styles.css");
  assert.equal(rewriteUrlValue("#decision", actions), "#decision");
  assert.equal(rewriteUrlValue("https://github.com/", actions), "https://github.com/");
});

test("rewrites upstream redirects into the public namespace", () => {
  assert.equal(rewriteLocation("/diff-walkthrough.html", actions), "/actions/diff-walkthrough.html");
});
