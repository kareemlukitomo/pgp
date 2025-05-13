# 🌐 Caddyfile Configuration

This folder contains the [`Caddyfile`](./Caddyfile) configuration used to serve WKD (Web Key Directory) endpoints for:

- `https://kareem.one`
- `https://openpgpkey.kareem.one`

It hosts the `.well-known/openpgpkey/` structure publicly for OpenPGP clients to discover and verify keys associated with `shaquille@kareem.one`.

---

## ✅ Test Your WKD Setup

Use the public validator:

> 🔗 [https://wkd.chimbosonic.com/api/shaquille@kareem.one](https://wkd.chimbosonic.com/api/shaquille@kareem.one)

You should receive a JSON response like:

```json
{
  "user_id": "shaquille@kareem.one",
  "direct_method": {
    "uri": "https://kareem.one/.well-known/openpgpkey/hu/1quwiwju5h6jdsqfj1tc6kzekjkniwwr?l=shaquille",
    "key": {
      "fingerprint": "1318540F267F1FF556A007CC6953A5B69805CDF8",
      "revocation_status": "Not as far as we know"
    },
    "errors": []
  },
  "advanced_method": {
    "uri": "https://openpgpkey.kareem.one/.well-known/openpgpkey/kareem.one/hu/1quwiwju5h6jdsqfj1tc6kzekjkniwwr?l=shaquille",
    "key": {
      "fingerprint": "1318540F267F1FF556A007CC6953A5B69805CDF8",
      "revocation_status": "Not as far as we know"
    },
    "errors": []
  }
}
```

