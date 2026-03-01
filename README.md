# pgp

This is the public-facing repository containing my cryptographic identity metadata. It acts as a mirrorable and auditable source of public keys.

Also accessible at https://git.kareem.one/pgp and https://github.com/kareemlukitomo/pgp

## Cloudflare Worker

The `worker/` directory contains the Cloudflare Worker that powers `pgp.kareem.one`. It reads from the KV cache first and falls back to the GitHub mirror if a requested key is missing. See `worker/README.md` for bootstrap, KV seeding, and deployment notes.

WKD assets under `/.well-known/openpgpkey/` are also mirrored into KV, including generated `hu/<hash>` aliases for direct and advanced WKD URL compatibility.
