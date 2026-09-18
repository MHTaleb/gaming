# Privacy policy — Packet Defense

**Last updated: 18 September 2026**

Host this text at a public URL and paste that URL into **Play Console → App
content → Privacy policy**. Play requires the URL to be reachable by anyone,
without login, for the whole life of the listing.

---

## What this game stores on your device

Packet Defense stores your campaign progress, stars, credits, unlocks, audio
settings and difficulty choice in your device's local app storage.

**This data never leaves your device.** It is not uploaded anywhere, not backed up
to a server, and not shared with anyone. It is included in your device's own
system backup only if you have system backup enabled, in which case it is
encrypted and handled by your device's operating system, not by us. Uninstalling
the app deletes it.

## What is collected by the advertising SDK

This game shows advertising supplied by **Google AdMob**. When ads are shown,
Google and its partners may collect and process:

- your device's **advertising identifier** (Google Advertising ID)
- device type, operating system version, and general location derived from IP
  address (country/region level)
- how you interact with an ad — whether it was shown, clicked, or completed

This is used to serve and measure advertising. Google's handling of it is
described in the Google Privacy Policy: <https://policies.google.com/privacy>

**Consent.** Where required by law (the EEA, the UK and Switzerland), the game
asks for your consent before initialising the ad SDK and before any ad is
requested. You may decline. Declining does not restrict gameplay; you will simply
be shown non-personalised or no advertising.

**Opting out.** You can reset or delete your advertising ID, and opt out of
personalised advertising, in your device settings (Android: *Settings → Privacy →
Ads*). On Android, opting out of personalisation means ads are not based on your
advertising ID.

## If you buy something

Purchases are processed by **Google Play Billing**. We never see or store your
name, card number, or any payment details — Google handles the whole transaction
and pays us as the merchant of record.

To confirm that a purchase is genuine before unlocking anything, the game sends
your purchase token (a receipt identifier issued by Google) together with the
product identifier to our own validation server, which checks it against Google's
servers. That server records the token only to prevent the same receipt being
replayed, and does not store any personal information.

## Children

This game is not directed at children under 13. We do not knowingly collect
personal information from children. The advertising SDK is configured to serve
non-personalised ads where consent has not been given.

## Analytics

There are **no** analytics, crash-reporting or tracking SDKs in this game. The
only third parties involved are Google AdMob (advertising) and Google Play
(billing and distribution).

## Your rights

Because the game stores nothing about you on our systems, there is no personal
data for us to export or delete on request. To exercise rights over data held by
Google in connection with advertising or billing, use Google's own controls at
<https://myaccount.google.com> and <https://adssettings.google.com>.

## Changes

If this policy changes, the date at the top changes with it.

## Contact

Replace this line with a real contact address before publishing — Play requires
one, and a policy with no way to make contact is a policy review failure.

---

## Data safety answers (for the Play Console form)

The Data safety form must match this policy. Suggested answers:

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Data type: *Device or other IDs* | Collected, **not** shared by us — but see note below |
| Is this data collected, shared, or both? | Collected by the advertising SDK; shared with Google for advertising |
| Is this data processed ephemerally? | No |
| Is data collection optional? | Yes — the advertising ID is only used once the user consents where consent is required |
| Purpose | Advertising or marketing; App functionality (billing) |
| Data type: *Purchase history* | Collected — the purchase token is sent to our validator to confirm a transaction |
| Purpose | App functionality |
| Is the data encrypted in transit? | **Yes** — all endpoints are HTTPS, and the app blocks cleartext traffic (`usesCleartextTraffic=false` plus a network security config) |
| Do you provide a way for users to request data deletion? | Not applicable — no account, and no personal data is stored on our systems |
| Does your app contain ads? | **Yes** — declare this in App content → Ads |
