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

## Making it playable: what the UI does and does not do yet

The lobby exists: create a room, get a four-character code, share it, join with
it, see who is in each seat, and start. Towers carry their owner's colour as a
ring around the pad — only in co-op, because in solo every tower is yours and the
ring is noise. The HUD labels the purse with the local player's name and shows
the others' balances right-aligned, dropping them if the column is too narrow to
fit them (the column's width is decided by the palette, and a number that
overlaps a tap target is worse than a number that is missing).

Still owed:

1. **Speed and pause are the host's.** A peer tapping them is told so rather than
   silently ignored. A peer cannot drive a clock it does not have.
2. **Your towers are yours.** Upgrade and sell are refused on a team-mate's
   tower, and the rule is enforced in both places: `remoteIntent` on the host,
   and the input layer for the host's own pointer, so the host cannot do
   something no other player can.
3. **The other seats' towers are only distinguishable by ring colour.** At four
   players on a crowded board that may not be enough; something like a small
   initial on hover is the likely answer.

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

## What is built and what the measurement proved

The rules, the relay, the client transport, the snapshot codec and the lobby all
exist. Two real clients, one real relay, a real twenty-wave battle:

```
                            host                     peer
wave / waves              2 / 20                   2 / 20
status                     wave                     wave
uptime                       90                       90
kills / leaks             5 / 3                    5 / 3
towers         firewall@0,1 owner 0       firewall@0,1 owner 0
               waf@0,2      owner 1       waf@0,2      owner 1
               firewall@0,3 owner 0       firewall@0,3 owner 0
purses                 5019 / 5029              5018 / 5028
```

Both ends agree on everything, and the peer's purses are one unit behind because
it renders deliberately 150ms in the past. The three assertions that matter most
were checked directly rather than inferred:

| Assertion | Evidence |
|---|---|
| The tile is shared but the purse is not | The peer's `waf@0,2` landed on the host's board as `owner 1`, the **host's purse did not move** (5076), and the peer paid (5136 → 5026) |
| A peer cannot spend the host's money | The same build: only seat 1's purse changed |
| A peer cannot forge state | The relay refuses `snapshot` from any seat but 0 (relay self-test, 20/20) |

A peer also never simulates: `Engine.step` returns after advancing a render clock
when `state.net.mode === 'peer'`, so the world it draws is the host's and nothing
else.

### Three bugs the two-client test found, that no unit test would have

1. **Interpolating between the newest and the oldest snapshot.** When the render
   clock ran past every buffered snapshot — normal after any hitch, and always in
   the first moment of a battle — `b` defaulted to `buf[0]` and the peer rendered
   a stale frame. It looked *plausible*, so it read as "towers not syncing"
   rather than as an index error.
2. **A music lookup aborted the battle start.** A co-op battle has no ticket id,
   and `trackForLevel(undefined)` threw, which killed the rest of `startBattle` —
   so `Engine.run()` never ran and the host broadcast *nothing*. A thrown
   exception in a startup path is a silent failure of everything after it.
3. **An infinite retry loop on a dead room.** `EventSource` cannot see a 404, so
   a player whose host left reconnected every few seconds forever with no error.
   The relay now answers `GET /room/<code>` and the client checks it before
   retrying.

None of these are visible from a single client, which is why the two-client test
is the one that matters.

## What is not built yet

1. **Snapshot serialisation is one-way.** Threats, towers, purses and the wave
   counter are sent; effects, shots and the chat feed are not, so a peer sees the
   battle but not the sparks. Cheap to add, and the game is legible without it.
2. **A boss finale.** `coopLevel` composes twenty waves with no Zero-Day. The
   campaign puts one on every act finale, and it is the set piece that makes a
   ticket feel finished; a co-op battle should end with one. Note that a boss
   forces the Antivirus bill, which is a *coordination* problem in co-op — worth
   designing deliberately rather than inheriting.
3. **Theme selection wants to be seat-aware.** `coopLevel` takes a theme, and the
   measurement says theme matters more than anything else: mid-campaign themes
   land at 0–2% slack, theme 1 at 12–46%, and theme 240 cannot usefully host
   three seats. The lobby should offer themes that suit the seat count rather
   than letting players find the broken combinations themselves.
4. **Splitting the budget fairly is not enough on a small map.** With ~73
   buildable tiles, a third seat's share has nowhere to go at late-game themes.
   The options are a larger co-op map, seat-scaled tile counts, or (likely best)
   capping co-op at two seats until the map can carry more. This needs a decision
   before matchmaking ships, because it is the difference between a mode and a
   demo.
5. **Public matchmaking with strangers** — needs a lobby service, a queue, region
   selection, backfill and moderation. Room codes are what "play with a friend"
   actually needs; this is a different product.
6. **Rejoin into an in-progress battle from a cold start.** The relay replays
   missed events on reconnect, which covers a brief drop. A player who closes the
   app and comes back needs a snapshot, and the `resync` path exists but is only
   exercised by a reconnect, not by a relaunch.

---

## How to verify

```bash
node server/relay/index.js --test                # 20 assertions, no dependencies
```

```bash
# Two clients, one relay, no second machine needed.
node server/relay/index.js &                     # relay on 127.0.0.1:8081
RELAY=http://127.0.0.1:8081 node tools/serve.js  # game + /coop proxy on :8080
# then open two windows, host in one, join with the code in the other
```

The dev server **proxies** `/coop/*` to the relay rather than pointing the game at
a second origin. That is deliberate: the CSP is `connect-src 'self'`, and putting
a second origin in the policy would mean the development build and the shipped
build have different security policies — and the one exercised least is the one
that ships. The deploy's nginx does the same with a `location /coop/`.

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
