# Security

This is a threat model, not a guarantee. It says what is defended, how, and
what is deliberately left open.

## What is worth attacking

| Asset | Why it matters | Where it lives |
|---|---|---|
| The **remove-ads entitlement** | It is the revenue. Unlock it for free and the product has no income. | Store purchase history, cached in `localStorage` |
| **Coins** | Cosmetic currency. Cheating it only spoils your own game. | `localStorage` |
| **The save file** | Progress, stars, unlocks. | `localStorage` |
| **Your accounts** | AdMob, Play, the validator's service account. | Nowhere near the client, by design |

## Trust boundaries

1. **The device belongs to the player.** Anything shipped in the bundle can be
   read, and anything in memory can be changed. No client-side check is a
   security control; client code is a *speed bump*, and is described as such
   below.
2. **The network is hostile.** Responses are signed, so an attacker in the
   middle cannot invent a successful purchase.
3. **Google Play is the source of truth** for purchases. Our validator asks the
   store's server API, never the client.

## Controls, honestly rated

| Control | Implemented in | Strength |
|---|---|---|
| Entitlements re-derived from the store on every launch; `localStorage` is only an offline cache | `www/js/purchases.js` | **Strong** - editing the cache is corrected on the next launch that can reach the store |
| Purchase verified server-side against the Play Developer API before anything is granted | `server/validator/` | **Strong** - the only reason an entitlement is granted |
| Verdicts are Ed25519-signed; the client pins the public key | `purchases.js` + `sign.js` | **Strong** - a hostile proxy or DNS cannot forge a "yes" |
| Nonce echo + token ledger | `purchases.js` + `validator/index.js` | **Strong** for replay of a verdict; the token ledger is in-memory, so a multi-instance deploy should move it to shared storage |
| Acknowledge/consume calls | `validator/google.js` | **Required by Google** - unacknowledged purchases are auto-refunded after 3 days |
| Strict CSP (`script-src 'self'`, no `unsafe-inline`, no `unsafe-eval`) | `www/index.html` | **Strong** against injected script; also blocks any origin you did not list in `connect-src` |
| Store-supplied strings rendered as text, never as markup | `main.js` (`renderShop`) | **Strong** - product names cannot inject HTML |
| `allowBackup=false`, `fullBackupContent=false`, `dataExtractionRules` | `tools/harden-android.js` | **Strong** - `adb backup` cannot lift the WebView data |
| Cleartext traffic denied, network security config | `tools/harden-android.js` | **Strong** |
| WebView remote debugging off in release | `tools/harden-android.js` | **Moderate** - debug builds stay inspectable, by design |
| Purchase buttons require `event.isTrusted` | `main.js` | **Moderate** - stops injected script from driving the shop; Play's own confirm dialog is the real gate |
| Signed save + tamper flag | `progress.js` | **Weak, and labelled as such** - it detects a hand-edited save, it does not prevent one. The key is in the bundle. |
| R8/minification (opt-in, `--minify`) | `tools/harden-android.js` | **Deterrence only** - obfuscation is not security |
| Zero runtime dependencies in the game | `www/js/*` | **Supply chain** - nothing to compromise. The billing plugin is the one exception. |

## What is not defended

- **A rooted or patched device.** Someone who repackages the APK with the shop
  ripped out gets the game for free. Nothing running on that device can stop it.
  The correct answer is the [Play Integrity API](https://developer.android.com/google/play/integrity),
  which attests the app and device *to a server* - and its verdict is only worth
  as much as your server's treatment of it. It is not wired up here.
- **A determined user reading the bundle.** The signing key for saves, the
  validator URL and the public key are all public information.
- **Denial of service.** A hostile proxy can block verification requests, which
  means a legitimate buyer does not get their entitlement until it retries. They
  are not charged for nothing; the purchase is retried from the pending queue.
- **iOS.** The validation service is Android-only (see `server/validator/README.md`).
  Shipping on iOS without extending it means iOS purchases are trusted locally,
  which is the thing this whole design exists to avoid.

## Production checklist

- [ ] `validator.url`, `validator.publicKey` and `validator.required: true` set in `www/js/config.js`
- [ ] Add the validator origin to `connect-src` in `www/index.html`
- [ ] Real AdMob unit ids in `www/js/config.js` (the committed ones are Google's test ids and earn nothing)
- [ ] Products created in Play Console with exactly the ids in `config.js`
- [ ] `SIGNING_KEY` and `GOOGLE_SERVICE_ACCOUNT` set as server secrets, never committed
- [ ] Service account invited in Play Console with *Manage orders and subscriptions*
- [ ] Upload keystore in CI secrets; `.gitignore` covers `*.keystore`, `*.jks`, `google-services.json`
- [ ] `node tools/harden-android.js` runs in the build (the CI workflow does this)
- [ ] Test one real purchase, one cancel, one refund, and one restore on a device with a closed-testing build

## Reporting

If you find a hole in any of this, the useful ones are: a way to obtain the
remove-ads entitlement without paying, a way to forge a validator verdict, or a
way to get code execution in the WebView. Open an issue, or contact the
maintainer privately if you would rather not publish it.
