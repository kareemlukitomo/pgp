# PGP Worker

Cloudflare Worker for `pgp.kareem.one` that serves the public key material and WKD endpoints from a durable KV cache with an automatic GitHub fallback.

## Overview

- Serves static PGP assets (e.g. `/shaquille.asc`, `/.well-known/openpgpkey/...`) with CORS and WKD-friendly headers.
- Reads from the `PGP_ASSETS` KV namespace first; on a miss it fetches from the public GitHub mirror and writes the response back to KV.
- Keeps assets in KV for 30 days by default — rotation workflows refresh the content ahead of key changes.
- Requests to `/` are rewritten to the asset defined by `ROOT_OBJECT` (defaults to `/public-masterkey.asc`) and returned with `text/plain` so the root URL streams the ASCII-armored key directly.

## Setup

1. Install dependencies:
   ```bash
   cd worker
   npm install
   ```

2. Create the KV namespaces (production + preview):
   ```bash
   wrangler kv namespace create pgp-assets
   wrangler kv namespace create pgp-assets-preview --preview
   ```
   Copy the resulting IDs into `wrangler.toml` (`id` for production, `preview_id` for preview).

3. (Optional but recommended) Restrict traffic to the intended hostnames by editing `ALLOWED_HOSTS` in `wrangler.toml`.
4. Point DNS (`pgp CNAME pgp-worker.<account>.workers.dev`) and ensure the route in `wrangler.toml` covers `pgp.kareem.one/*`.

## Syncing Assets

Generate a KV bulk upload manifest from the repository contents:

```bash
cd worker
npm run kv:sync -- --out dist/kv-assets.json
```

Then push to KV (remote namespaces):

```bash
wrangler kv bulk put dist/kv-assets.json --binding=PGP_ASSETS --remote --preview=false
wrangler kv bulk put dist/kv-assets.json --binding=PGP_ASSETS --remote --preview
```

The worker will now serve content directly from KV. When new keys or WKD files land in the repo, re-run the sync workflow so updates are available instantly without waiting on the GitHub fallback.

> The sync script skips files that are absent (e.g. `shaquille.asc`), so it is safe to run before every rotation.

## Developing & Deploying

- `npm run dev` – local development (requires `wrangler` authentication).
- `npm run deploy` – publish the worker once all bindings are configured.

The worker mirrors from `https://raw.githubusercontent.com/kareemlukitomo/pgp/main` by default. Override `GITHUB_MIRROR_BASE` in `wrangler.toml` if you prefer another mirror (e.g. a Forgejo origin).

## TODO

- Add an automated sync hook (GitHub Action / cron-triggered worker) that refreshes KV from the repo whenever `public-masterkey.asc` or WKD assets change.
