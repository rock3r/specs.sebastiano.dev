# specs.sebastiano.dev

A small catalog and path gateway for design documents published as Cloudflare Workers.

Each deployment has one catalog entry and one public root, such as
`https://specs.sebastiano.dev/actions/`. Supporting pages remain discoverable through the
spec's own navigation and are proxied under the same prefix.

## Local preview

```bash
python3 -m http.server 8787
open http://127.0.0.1:8787
```

## Register a spec

The publishing skill uses the helper below to update `specs.json` without hand-editing the page:

```bash
node scripts/register-spec.mjs \
  --project "Jewel shortcuts" \
  --project-id jewel-shortcuts \
  --title "Actions and shortcuts review" \
  --date 2026-08-11 \
  --url https://specs.sebastiano.dev/actions/ \
  --description "The living design document and proof matrix."
```

The helper replaces the project's canonical entry. Before registering a new deployment,
add its Worker service binding to `wrangler.jsonc` and its path mapping to `src/index.mjs`.

## Deploy

```bash
CLOUDFLARE_ACCOUNT_ID=bde5200bb4a2da7c163c14e88348f5e2 \
npx wrangler@latest deploy
```

Set `CLOUDFLARE_API_TOKEN` in the shell before deploying. The Worker is configured for the custom domain `specs.sebastiano.dev` and the main Cloudflare account. Credential retrieval and the reusable publishing workflow are maintained separately from this public repository.
