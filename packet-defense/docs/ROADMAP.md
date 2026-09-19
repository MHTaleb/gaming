# Roadmap

What to do next, in what order, and why that order.

This is a *view* of [`backlog/backlog.json`](../backlog/backlog.json), not a second
source of truth. Item ids are the reference; if these two ever disagree, the JSON
is right and this file is stale. Ordered with `node tools/backlog.js --ready`.

---

## The situation in one paragraph

The game is finished and good enough to play for hours, and it cannot be published
yet. The blocker is a compliance deadline that passed three weeks ago: Play
requires API 36 and the app targets 35, so an upload today is rejected
(**PD-101**). Everything else on this roadmap is either a prerequisite for that
upload, something that makes the shipped game meaningfully better, or a debt that
will be much more expensive later. Of 79 tracked items, 24 are done and 13 are
ready to start.

---

## Now — get to a submittable build

Nothing else can reach a store listing until this block is finished.

| # | Item | Why it is first |
|---|---|---|
| 1 | **PD-302** Make a crash visible instead of silent | Highest value-to-cost item on the board. A thrown exception in a startup path recently killed the render loop and broadcast nothing, and it was found only by reading a console log during a manual test. This is the difference between a player reporting "it's broken" and nobody knowing at all. |
| 2 | **PD-102** Fix the stale `targetSdk` claim | A doc that is confidently wrong is the reason nobody checked. Small, and it stops the next person making the same mistake. |
| 3 | **PD-101** Upgrade to Capacitor 8 → API 36 | The blocker. Large and touches the Android build. Node 22 is already installed for it. |
| 4 | **PD-103 / PD-404** Store icon and feature graphic | Required by Play; the icon is already drawn and only the format was wrong. **Done** - `tools/store-assets.js`. |
| 5 | **PD-105** Screenshots from the real game | The first two screenshots decide the install. Marketing that happens to be a build step. |
| 6 | **PD-114 / PD-113** Signed AAB, Play App Signing | The whole path from a fresh clone to a signed bundle has never been exercised. Losing the upload key locks the app out of updates, so it is a one-way door. |
| 7 | **PD-106 / PD-107 / PD-110 / PD-111** Policy and console declarations | Co-op made three existing claims false. These must be consistent with each other and with the app's actual behaviour. |
| 8 | **PD-109** Store copy, avoiding the trademark | Free to get right before review. |

**PD-112** (confirm the pre-production testing requirement) is blocked on Play
Console access and should be answered *first* if the answer might be "weeks",
because it sets the launch date.

---

## Next — make it a game that can be launched with a straight face

| # | Item | Why |
|---|---|---|
| 1 | **PD-303** CI running the verification we already have | The most likely way this project regresses is somebody changing one dial and not noticing that 240 measured tickets moved. That is a machine's job, and every check already exists as one command. |
| 2 | **PD-304** Automate the two-client co-op test | Co-op's worst bugs - a stale-snapshot interpolation error, the silent startup failure, an infinite reconnect loop - were all found by a second client and none of them are covered by anything that runs now. |
| 3 | **PD-601** Real AdMob ids | Every ad unit is Google's public test id. The game currently has ads that earn exactly $0. |
| 4 | **PD-602** Deploy the purchase validator | `validator.url` is empty, so a purchase is trusted from a locally-editable receipt. The one place being wrong costs real money. |
| 5 | **PD-208** Decide the co-op seat ceiling | The board holds ~73 towers and one player fills it. At three seats on a late-game theme the team finished with 45% of its money unspent. Shipping a mode where a third player is decoration is worse than shipping a two-player mode that works. |
| 6 | **PD-804** Play it on a real Android device | It is a Capacitor app whose Android path has never been run end to end: not the manifest hardening, not the AdMob id injection, not the purchase flow, not touch under a real finger. |

---

## Then — the case for the game's depth

The one finding from the genre research that is a genuine gap rather than a
polish item.

**PD-201 · Mazing.** Every notable title in this genre lets the player *shape* the
path - Desktop Tower Defense and Flash Element TD are built on it, and it is the
source of the genre's deepest play. Our roads are fixed and generated. That is a
defensible choice, and it is also the reason a player who has learned the towers
has learned most of what the game has to teach.

It is the largest item on the board by a distance: it invalidates the entire
difficulty calibration, which means 240 re-measured tickets and every document that
quotes those numbers. It must start as a spike, and the honest outcome may be a
*second mode* rather than a replacement for the campaign.

Behind it, in rough order of value for effort:

* **PD-202** Threats that ignore the road. Creates a second axis of tower value
  without adding a tower.
* **PD-203** Targeting modes. Multiplies the seven towers that exist instead of
  adding an eighth, which matters because the palette holds seven.
* **PD-401** Damage numbers, hit feedback and death animations. The cheapest
  available improvement to how the game feels, and it needs no asset pipeline
  because everything is already drawn in code.
* **PD-606** Tell the player when a ticket is a deliberate gate. Three insane
  tickets are unwinnable by design; an intentional wall that looks like a bug
  generates support requests and one-star reviews, and the fix is a sentence.
* **PD-607 / PD-608** The campaign's opening and act 7's double spike. Both are
  real and both are deferred for the same honest reason: they invalidate every
  measurement. They should be done together, once, after CI exists to catch the
  fallout.

---

## Later — retention and reach

The campaign ends. Ticket 240 is the last thing the game has to say, and a player
who reaches it has no reason to open the app again.

* **PD-206** Daily challenge. The cheapest honest retention mechanic there is: the
  seed is the date, so it needs no backend, and it gives a lapsed player one
  specific reason to return. The sibling project already has a daily module.
* **PD-205** Endless mode and a survival leaderboard. The genre's durable mobile
  titles pair a campaign with a mode that has no ceiling.
* **PD-207** A co-op boss finale. Twenty waves that simply stop is an anticlimax,
  and a boss is the moment co-op's central question - who is paying for the
  antivirus - becomes a conversation.
* **PD-604** Play Games Services, as a single decision covering achievements,
  leaderboards and cloud save, with the Data safety consequences stated for each.
* **PD-605** Analytics that would survive a privacy review - or a written decision
  not to collect anything. The biggest blind spot in this project is real player
  behaviour; every balance decision so far has been made with a bot that is
  explicitly a lower bound.

---

## Deliberately not doing

**PD-213 · Public matchmaking with strangers.** Room codes are what playing with a
friend actually requires. Random matchmaking needs a lobby service, a queue,
region selection, backfill and abuse handling, and it is a different product with a
different support burden. Recorded in the backlog as `dropped` so it is not
re-proposed as though it were free.

---

## How this list is ordered

Items carry a value (1-5), a risk (1-5) and a priority. The board sorts within a
column by:

```
rank = value × 2 − risk × 1.5 + priorityBonus(P0 +9, P1 +5, P2 +2, P3 0)
```

Value counts double because the point is to build the thing worth playing. Risk is
subtracted because an item likely to go wrong costs more than its size suggests.
The priority bonus is large enough to outrank almost any value difference, because
a P0 blocker is not a preference.

It is a conversation starter, not a verdict. The two items at the top of "Now" are
there because they are cheap and they prevent the failure mode this project has
already been bitten by, not because the formula said so.
