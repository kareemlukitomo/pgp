# pgp

Public repository for Kareem's OpenPGP identity material and WKD assets.
This repo is the source of truth for the published key, WKD files, and transition notes, and it is meant to stay mirrorable and auditable.

Mirrors:

- https://git.kareem.one/pgp
- https://github.com/kareemlukitomo/pgp

## Serving Model

Everything is now published through the Cloudflare Worker in [`worker/`](./worker) backed by Cloudflare KV.

- `https://pgp.kareem.one/` serves [`public-masterkey.asc`](./public-masterkey.asc)
- `https://kareem.one/.well-known/openpgpkey/...` serves the direct WKD endpoints
- `https://openpgpkey.kareem.one/.well-known/openpgpkey/...` serves the advanced WKD endpoints

The worker reads from KV first, falls back to the GitHub mirror on cache misses, and the refresh workflow keeps KV synchronized after changes to key material or worker code.

## Repository Layout

- [`public-masterkey.asc`](./public-masterkey.asc): root ASCII-armored public key
- [`.well-known/openpgpkey/`](./.well-known/openpgpkey): canonical WKD source files
- [`transitions/`](./transitions): key transition and revocation notes
- [`revoked/`](./revoked): older revoked material kept for reference
- [`worker/`](./worker): Cloudflare Worker, KV sync scripts, and deployment config

See [`worker/README.md`](./worker/README.md) for bootstrap, manifest generation, and deployment details.

## Verify WKD

Use the public validator:

https://wkd.dp42.dev/api/lookup?email=shaquille@kareem.one

A successful response should show both direct and advanced methods resolving to the same fingerprint with no errors. A trimmed example:

```json
{
  "user_id": "shaquille@kareem.one",
  "methods": [
    {
      "uri": "https://kareem.one/.well-known/openpgpkey/hu/1quwiwju5h6jdsqfj1tc6kzekjkniwwr?l=shaquille",
      "method_type": "Direct",
      "key": {
        "fingerprint": "1318540F267F1FF556A007CC6953A5B69805CDF8",
        "revocation_status": "Not as far as we know",
        "expiry": "Expires on 2027-02-05 20:38:42 UTC",
        "algorithm": "EdDSALegacy"
      },
      "errors": [],
      "successes": [
        "HTTP Head Method",
        "No Index found",
        "Policy File Found",
        "Content-Type: application/octet-stream",
        "Access-Control-Allow: *"
      ],
      "timestamp": "2026-03-07T18:21:00.955284030Z"
    },
    {
      "uri": "https://openpgpkey.kareem.one/.well-known/openpgpkey/kareem.one/hu/1quwiwju5h6jdsqfj1tc6kzekjkniwwr?l=shaquille",
      "method_type": "Advanced",
      "key": {
        "fingerprint": "1318540F267F1FF556A007CC6953A5B69805CDF8",
        "revocation_status": "Not as far as we know",
        "expiry": "Expires on 2027-02-05 20:38:42 UTC",
        "algorithm": "EdDSALegacy"
      },
      "errors": [],
      "successes": [
        "HTTP Head Method",
        "No Index found",
        "Policy File Found",
        "Content-Type: application/octet-stream",
        "Access-Control-Allow: *"
      ],
      "timestamp": "2026-03-07T18:21:01.079569909Z"
    }
  ]
}
```
