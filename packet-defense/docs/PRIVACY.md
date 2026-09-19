# Privacy policy — Packet Defense

**Last updated: 19 September 2026**

Host this text at a public URL and paste that URL into **Play Console → App
content → Privacy policy**. Play requires the URL to be reachable by anyone,
without login, for the whole life of the listing.

---

## Short version

Playing **solo** makes no network calls at all. Playing **co-op** connects to our
relay, which carries your chosen display name and the state of the room, keeps
them in memory, and forgets them. There are no accounts and no analytics either
way.

## What this game stores on your device

Packet Defense stores your campaign progress, stars, credits, unlocks, audio
settings and difficulty choice in your device's local app storage.

**This data never leaves your device.** It is not uploaded anywhere, not backed up
to a server, and not shared with anyone. It is included in your device's own
system backup only if you have system backup enabled, in which case it is
encrypted and handled by your device's operating system, not by us. Uninstalling
the app deletes it.

## Co-op, which is the one thing that does use the network

Co-op is opt-in. It only happens if you open the co-op screen and create or join
a room, and it stops when you leave. Nothing about your solo progress is ever sent
to us.

**What you give it.** A display name. The game offers a short randomly generated
one, and you may type your own instead. Whatever is in that field is what the
other people in your room see. It is not checked, filtered, or stored by us
beyond the life of the room — so please do not put anything there you would not
put on a name badge.

**What the relay receives.**

- **The room code, your display name and your seat number** (host, or player 2 to
  4). This is what puts you in the right room and labels you in the roster.
- **The state of the battle**, roughly ten times a second. That is what co-op
  *is*: the host broadcasts the positions of towers and threats, and the other
  players send back the towers they buy. It contains nothing about you — it is a
  list of coordinates, health values and identifiers.
- **Your IP address**, as any server you connect to necessarily does. We use it
  only to send the connection back to you. We do not log it, and we do not build
  anything from it.

**What the relay keeps, and for how long.** Rooms live in memory and nowhere else.
There is no database and nothing is written to disk. To let a player who drops
out reconnect without losing the battle, a room holds the last 64 messages and
replays them to whoever comes back. When the last player disconnects, the room
keeps its code reserved for **fifteen minutes** and is then discarded along with
everything in it. A room holds at most four players.

**Who else sees it.** The other players in your room see your display name and the
battle state, because that is the point of playing together. Nobody else does.

**Leaving.** Leaving a room, closing the app, or being disconnected removes you
from it immediately.

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
(billing and distribution). The co-op relay is ours, and it counts nothing: it
has no identifier for a player, keeps no logs of who joined what, and cannot tell
one session from another once a room is gone.

## Your rights

Solo play stores nothing about you on our systems, so there is no personal data
to export or delete. In co-op the only thing attributable to you is a display name
of your choosing, and it is discarded with the room it was used in - fifteen
minutes after the last player leaves. If you would rather not part with a name at
all, leave the generated one.

To exercise rights over data held by Google in connection with advertising or
billing, use Google's own controls at <https://myaccount.google.com> and
<https://adssettings.google.com>.

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
| Do you provide a way for users to request data deletion? | Not applicable — no account, and nothing on our systems outlives the room it was used in |
| Does your app contain ads? | **Yes** — declare this in App content → Ads |

### The co-op row, which is easy to miss

The form asks about data your app transmits. Co-op transmits a display name and
the state of a battle to a server we run, so the honest answer to *Device or other
IDs* includes it — a room code is not an identifier for a person, but a display
name typed by a player could be, and the form is answered for the least careful
case rather than the most.

| Question | Answer |
|---|---|
| Co-op: what is transmitted | A display name, a seat number and battle state, to a relay we operate |
| Is it shared with third parties? | **No** — it reaches the other players in your room and nobody else |
| Is it optional? | **Yes** — it only happens if the player opens the co-op screen and creates or joins a room |
| Is it processed ephemerally? | **Yes** — in memory only, no database, nothing written to disk, discarded fifteen minutes after the last player leaves |
| Purpose | App functionality — it is the multiplayer mode
