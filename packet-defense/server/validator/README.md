# Purchase validator

The client cannot be trusted. It runs on a device the player controls, so it must
never be the thing that decides whether money changed hands. This service is that
decision, and it is the only part of the system that talks to Google.

```
game (phone)                 this service                    Google
   |  productId + token + nonce    |                             |
   |----------------------------->|  OAuth (service account)     |
   |                              |----------------------------->|
   |                              |  purchases.products.get      |
   |                              |<-----------------------------|
   |   Ed25519-signed verdict     |  acknowledge / consume       |
   |<-----------------------------|----------------------------->|
```

The client verifies the signature against `validator.publicKey` in
`www/js/config.js`, so a hostile network or proxy cannot answer "ok" on its own.

Zero npm dependencies: fewer packages, no supply chain, nothing to audit.

## 1. Create a Google service account

1. [Google Cloud Console](https://console.cloud.google.com) → new project (or reuse yours).
2. **APIs & Services → Library** → enable **Google Play Android Developer API**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
4. On the new account: **Keys → Add key → Create new key → JSON**. Download it.
5. **Play Console → Users and permissions → Invite new users**, paste the service
   account's `client_email`, and grant it:
   - *View app information and download bulk reports*
   - *Manage orders and subscriptions*  ← needed for acknowledge/consume

   Without that second permission the validator can read purchases but the
   acknowledge call fails, and Play refunds your users after three days.

## 2. Generate a signing key

```bash
node server/validator/sign.js --generate
```

It prints two things:

- `SIGNING_KEY=...` → put it in the server's environment
- a base64url public key → paste into `www/js/config.js` under `validator.publicKey`

## 3. Run it

```bash
cd server/validator
cp .env.example .env      # fill it in
set -a && . ./.env && set +a
node index.js
curl localhost:8787/health
```

There is no build step and no install step.

## 4. Point the game at it

```js
// www/js/config.js
validator: {
  url: 'https://your-validator.example.com/verify',
  publicKey: '<paste from step 2>',
  required: true,        // refuse anything the server has not verified
  timeoutMs: 8000,
}
```

Also add the origin to `connect-src` in the CSP meta tag in `www/index.html` —
the strict policy there allows no outbound requests by default.

## 5. Deploy

Anywhere that runs Node 18+:

- **Cloudflare Workers / Vercel**: this is a single small function; the cold-start
  profile is fine.
- **Fly.io / Railway / Render**: `node server/validator/index.js`, expose `PORT`.
- **A box of your own**: put it behind Caddy or nginx for TLS. Terminate HTTPS
  properly - the client refuses plain HTTP unless it is `localhost`.

Set `APP_ID`, `PACKAGE_NAME`, `GOOGLE_SERVICE_ACCOUNT`, `SIGNING_KEY` as secrets.
Never bake them into the game bundle.

## What it defends against, and what it does not

| Threat | Handled |
|---|---|
| Client-side entitlement flipping | Yes - verdicts come from here, not from the save file |
| Forged "purchase successful" response | Yes - the verdict is Ed25519-signed |
| Replaying a verification request | Yes - nonce echo + an in-memory token ledger |
| Brute-forcing tokens | Partly - rate limited per IP; use a WAF for real volumes |
| A refunded or cancelled purchase staying unlocked | Partly - re-verification on launch catches it; add a scheduled job for certainty |
| A rooted device patching the game to skip the shop | No - nothing client-side can stop that. Play Integrity is the tool for this, and it needs a server round trip of its own |

## Testing without Google

```bash
node tools/mock-validator.js        # prints its public key, signs fake verdicts
```

Point `validator.url` at it, reload the game and buy something: the whole chain
runs for real, only the Google call is stubbed. Dev and test only — never deploy it.

## iOS

Not implemented. The App Store Server API needs its own key (an In-App Purchase
key from App Store Connect, not a service account) and a different JWS response
format. The client already sends `platform: 'ios'`, so the server can branch on it
without any client change.
