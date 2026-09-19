# Co-op: one map, twenty waves, separate purses

The design as specified:

- **Matchmaking** — players are brought into the same battle
- **One map**, and every player is free to build anywhere on the road
- **Every player has their own money**
- **Survive 20 waves** together, on one shared integrity bar

This file is the design and the protocol. The rules are implemented; the network
is not yet, and the last section says exactly what is missing.

---

## What is already true, and why it matters

A battle is a **pure function of (ticket, tier, actions)**. That is asserted, not
assumed: `node tools/balance.js --replay-check` records a run, rebuilds the battle
with no bot, and compares the outcomes exactly. It currently passes on 15 of 15
tickets including the heaviest battle in the game.

That property is what makes co-op tractable at all. It means the *only* thing two
devices need to agree on is the list of things players did, and it means a battle
is reproducible for debugging, spectating and anti-cheat.

## Rules implemented

| Rule | Where | Notes |
|---|---|---|
| Shared map, free placement | `towers.js` `canPlace` | Occupancy is checked against the whole board, so two players contend for the same corner — that contention is the strategy |
| Separate purses | `engine.js` `state.seats` | `state.purse(id)`, `state.debit`, `state.credit`, `state.refund`. The team's budget is **divided** between seats, not multiplied by them — see below |
| Tower ownership | `towers.js` `tower.owner` | Builds, upgrades and sells all debit the **owner's** purse, so you cannot spend a team-mate's money and a sale refunds whoever paid |
| Shared income | `threats.js` | Every seat banks an equal share of each bounty — see below |
| 20 waves, one ramp | `campaign.js` `coopLevel` | Themed on an act so the threat mix is coherent, ramping across the twenty |
| Shared integrity | unchanged | `state.uptime` was already global, which is exactly right here |
| Replayable | `engine.js` `record` / `replayOf` | Builds log **who paid**, so a co-op battle replays exactly like a solo one |

### Why income is shared and purses are not

Crediting the killing blow is the obvious rule and it is the wrong one: **three of
the seven tower types deal no damage at all**. A Honeypot, a Patch Queue or a Rate
Limiter earns nothing under kill-credit, so the player who builds what the team
needs would fall further behind every wave while the player with the Firewalls
compounds. Shared income keeps every build viable; separate purses keep the
spending decision personal, which is the part the design actually asked for.

It is one branch in `threats.js` if you would rather have kill-credit, and the
symptom to watch for is support players being unable to afford anything by wave 10.

---

## Two things measurement caught that reasoning did not

Both of these were invisible until the numbers came back, and both would have
shipped as "co-op feels wrong" with no obvious cause.

**1. A per-seat budget makes co-op easier the more people join.** The obvious
reading of "every player has their own money" is that each player is handed a
full budget. On a map with a fixed number of buildable tiles that is backwards:
one player already saturates the board, so extra purses have nothing to buy.
Measured at three seats, the team spent 13,286 of 34,038 and finished with **156%
slack** — three quarters of the mode's money was decoration. The team's budget is
now held roughly constant and *divided* between seats, which also makes "wasting
your share" cost the team, and that is the decision the mode is about.

**2. A per-wave ramp multiplier saturates the count caps.** The first version read
`coopOpen 0.30 → coopClose 2.4` as per-wave power. The generator's ramp is a
**battle** total distributed across the waves, so this made the battle about
twenty-four times a ticket's total. Every count cap saturated and the surplus
spilled into health, which meant extra seats were paid for with **tankier enemies
rather than more of them** — theme 240 went from 1,545 threats at one seat to
1,610 at three while its power nearly doubled. That is precisely the failure the
campaign's tier work exists to prevent, and it is the same trap in a new place.
The ramp is now a battle total (`coopTotal`), and the seat dial produces real
bodies again: theme 240 measures 450 → 751 → 1,061 threats at one, two and three
seats.

---

## Difficulty: how it is calibrated and what it measures

`tools/balance.js --coop` plays a co-op battle with N independent bot seats on one
map, each with its own purse, and reports the shared outcome plus what each seat
spent. `--seats 1` is the control.

The metric that matters is **slack** — the gap between the money the team was
given and the cost of the defence that actually won. Slack is what makes a level
feel easy: if the answer costs a third of the money, the player never has to
choose anything. This is the same conclusion the insane tier was rebuilt around,
and it is the reason "the bot survived" is not evidence of anything.

Current tuning, tier normal, three-theme sample:

| theme | seats | threats | invested | given | slack |
|---|---|---|---|---|---|
| 1 | 1 | 49 | 345 | 387 | 12% |
| 1 | 3 | 121 | 315 | 460 | 46% |
| 100 | 1 | 729 | 11,079 | 11,110 | 0% |
| 100 | 3 | 1,651 | 12,082 | 12,275 | 2% |
| 240 | 1 | 450 | 17,301 | 17,767 | 3% |
| 240 | 3 | 1,061 | 13,286 | 19,237 | 45% |

Mid-campaign themes sit at **0–2% slack**, which is tighter than insane's early
tickets (13%) — the setting the player described as "really hard, I had to try
three or four times". Theme 1 is deliberately loose because it is the gentlest
theme. The 45% at theme 240 / three seats is a real finding, not a rounding
artefact: the board is full at ~73 towers, so past a point a third seat's share
cannot be spent. That is the tile ceiling again, and it says theme 240 is a poor
host for a three-player battle rather than that the dial is wrong — see the open
list below.

A caveat that applies to every number here, and it is the one this project has
already been burned by: **the bot is a lower bound.** It maximises road coverage
per tile, which is exactly the skill the game teaches, so a human who spends
badly will find co-op considerably harder than these figures suggest.

## Making it playable: what the UI still owes

The rules work; the screens do not exist. Specifically:

1. **Opponent towers must be legible.** Each seat has a colour (`SEAT_COLOURS` in
   `engine.js`). Tower bases should be drawn in the owner's colour, or a
   three-player board is an unreadable pile.
2. **One purse per player in the HUD.** `state.bandwidth` currently exposes the
   *active* seat, which is right for a local hot-seat and wrong for a networked
   game; the HUD needs a row per player.
3. **The palette must show what *you* can afford**, not the team. In a networked
   game the local seat is fixed, so this falls out of `state.purse(localSeat)`.
4. **A lobby.** Room code create/join, and the seat count that feeds
   `coopLevel(theme, tier, seats)`.

---

## Authority model: host-authoritative, NOT lockstep

**Do not use lockstep.** Determinism makes it tempting, and it is a trap: lockstep
requires bit-identical floating point across devices, and `Math.pow`, `Math.exp`
and `Math.sin` are not guaranteed to agree across JS engines. A 20-wave battle is
minutes of simulation, and one ulp of divergence compounds into a desync — which
on mobile means two players watching different battles and only finding out at the
end.

Instead:

```
        peer                          host                          peer
   intent(build 9,4 firewall) ──▶  simulate  ──▶  snapshot ──▶  render
   intent(wave)                 ──▶            ──▶  snapshot ──▶
```

- The **host** runs the only simulation. It is authoritative over money, kills,
  integrity and win/lose.
- **Peers send intents** — what the player tried to do — and never simulate.
- The host broadcasts **snapshots** at a fixed 10 Hz, plus immediate confirmation
  of accepted or rejected intents so the UI does not have to wait for a snapshot
  to feel responsive.

At ~500 entities a snapshot is roughly 2–4 KB, so 10 Hz is **20–40 KB/s** — fine
for a phone on mobile data. A peer dropping out is survivable because the host
keeps simulating; the battle simply continues with their towers standing.

### Messages

```jsonc
// peer -> host
{ "t": "join",   "room": "7KQ2M", "name": "Priya" }
{ "t": "intent", "seq": 41, "p": 1, "a": { "t": "build", "c": 9, "r": 4, "type": "firewall" } }
{ "t": "intent", "seq": 42, "p": 1, "a": { "t": "wave" } }

// host -> peers
{ "t": "welcome",  "seat": 1, "seats": [...], "level": { "theme": 40, "tier": "normal" } }
{ "t": "accepted", "seq": 41, "at": 12.35 }        // applied at sim time
{ "t": "rejected", "seq": 41, "reason": "not enough bandwidth" }
{ "t": "snapshot", "time": 12.4, "uptime": 96, "wave": 7,
  "seats": [ { "id": 0, "bandwidth": 340 }, { "id": 1, "bandwidth": 122 } ],
  "towers": [ { "c": 9, "r": 4, "type": "firewall", "lv": 2, "p": 0 } ],
  "threats": [ { "t": "smell", "d": 812.4, "hp": 44 } ] }
{ "t": "over", "won": true, "uptime": 71 }
```

`at` in `accepted` matters: the action log already stamps every action with the
simulation time it happened at, so a late intent is applied at the host's current
time and the log stays replayable. **The host is the only clock.**

### Matchmaking

Two stages, and the cheap one first:

1. **Room codes** — the host creates a battle and gets a five-character code;
   others join with it. No accounts, no lobby service, no moderation, and it is
   what "ask a friend" actually needs on a phone (share the code, or a link).
2. **Public matchmaking** — random strangers. This needs a lobby service, a
   queue, region selection, backfill for drop-outs and abuse handling. Worth it
   only once room codes show people want to play together.

Room codes can be served by a **tiny relay on the existing `openclaw` host** —
nginx and systemd are already there and the staging deploy is configured, so the
infrastructure cost is effectively zero. The relay should forward messages and
hold a small amount of room state; it must never simulate.

---

## What is not built yet

1. **The relay** — a WebSocket service (rooms, join, forward, host migration on
   host drop).
2. **Snapshot serialisation** — `engine.js` has no serialise/restore for threats.
   The action log makes this *avoidable for correctness*, but the peer still needs
   something to render, so a compact view-state codec is required.
3. **The co-op UI** — see "Making it playable" above.
4. **Matchmaking screen** — room code create/join, and the lobby.
5. **A boss finale.** `coopLevel` composes twenty waves with no Zero-Day. The
   campaign puts one on every act finale and it is the set piece that makes a
   ticket feel finished; a co-op battle should end with one too. Note that a boss
   forces the Antivirus bill, which is a *coordination* problem in co-op — worth
   designing deliberately rather than inheriting.
6. **Theme selection.** `coopLevel` takes a theme, and the measurement says theme
   matters more than anything else: mid-campaign themes land at 0–2% slack, theme
   1 at 12–46%, and theme 240 cannot usefully host three seats. The lobby should
   pick a theme that suits the seat count rather than letting players find the
   broken combinations themselves.
7. **Splitting the budget fairly is not enough on a small map.** With ~73
   buildable tiles, a third seat's share has nowhere to go at late-game themes.
   The options are a larger co-op map, seat-scaled tile counts, or (likely best)
   capping co-op at two seats until the map can carry more. This needs a decision
   before matchmaking ships, because it is the difference between a mode and a
   demo.

---

## How to verify

```bash
node tools/balance.js --coop                      # seat counts 1,2,3 across four themes
node tools/balance.js --coop --seats 1,2 --detail  # plus a per-seat ledger
node tools/balance.js --coop --tier insane        # co-op on a harder tier
```

The `--detail` ledger is the one that catches a purse leak: per-seat spend and
investment must sum to the battle totals, and **every seat must end with towers**.
A seat that spent nothing while the team won means the shared income never reached
it, which is exactly the failure the shared-payout rule exists to prevent.

Single-player is the regression gate for every change here. `state.bandwidth` is
an accessor onto the active seat specifically so the released solo game did not go
through this refactor, and it is verified rather than assumed:

```bash
node tools/balance.js > /tmp/after.txt            # must match the pre-co-op run exactly
node tools/balance.js --replay-check --levels 1-5
node tools/balance.js --replay-check --levels 239-240 --tier insane
```

The first is a byte-comparison against a saved baseline. It caught nothing when
this work landed, which is the point — it is the only reason the accessor approach
was safe to take on a shipped game.

---

## Google Play and policy consequences

**This is not a detail to handle later.** Co-op makes three existing statements
false, and each is a compliance obligation rather than a bug:

| Claim today | Where | Must become |
|---|---|---|
| "No network calls during play" | Settings screen, and `docs/PRIVACY.md` | "No network calls in solo play; co-op connects to a relay" |
| Data safety: nothing leaves the device | Play Console form | Declare the relay connection, and what it carries (a display name, a room code, in-battle intents). No accounts, no personal data, nothing stored after the battle |
| Privacy policy: no data collection | `docs/PRIVACY.md` | Disclose the connection and its lifetime |

Also worth knowing before building it:

- **No new Android permissions.** `INTERNET` is already declared, and a WebSocket
  needs nothing else.
- **Mobile networks drop.** A 20-wave battle is minutes long, so reconnect and
  host-migration are required for a shippable feature, not polish. Decide the
  rule now: I would keep simulating and let a dropped player rejoin into their own
  towers, because losing a 15-minute run to a tunnel is the kind of thing that
  gets an app uninstalled.
- **Cheat exposure is low** while there are no stakes, because the host is
  authoritative and there is nothing to win from lying. If co-op ever feeds a
  shared leaderboard or rewards, that changes and the host can no longer be
  trusted with scoring.
