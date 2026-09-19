# Packet Defense

A tower defense game about holding a production server against everything the
internet throws at it. Twelve acts, 240 tickets, five difficulty tiers, seven
buildable towers, a base research tree, generated music, and a co-op mode where
two players defend one map with separate wallets.

**Vanilla JavaScript. No build step. No bundler. No bundled assets.** Every piece
of art and every note of audio is generated at runtime from code. The whole game
is about 15,000 lines across 22 modules, and the APK contains no images and no
sound files.

Target platform: Android through Capacitor, distributed on Google Play.

---

## Where things stand

The game is **playable start to finish and live on a staging host**. It is not on
Google Play yet, and the reason is a compliance deadline that has already passed
(see below).

| | |
|---|---|
| Release | 1.0.0, tagged `v1.0.0` |
| Campaign | 240 tickets across 12 acts, all winnable on easy, normal and hard |
| Co-op | Playable between two real clients over a real relay, via room codes |
| Verification | 54 in-page checks, 20 relay assertions, a full-campaign balance sweep, replay determinism |
| Blocking Play | The app must target API 36. It targets 35. See **PD-101**. |

The authoritative list of what is done, in progress and planned is
[`backlog/backlog.json`](../backlog/backlog.json). Open the board with
`node tools/serve.js` and visit `/backlog/`.

---

## Quick start

```bash
# Play it
node tools/serve.js                    # then open http://localhost:8080

# Play co-op locally (two browser windows)
node server/relay/index.js &           # relay on 127.0.0.1:8081
RELAY=http://127.0.0.1:8081 node tools/serve.js
# host in one window, share the four-character code, join in the other

# Verify
node tools/verify.js                           # 12 seconds, eight gates
node tools/verify.js --full                    # adds the 240-ticket campaign
node tools/balance.js --levels 1-40            # is the campaign still sound?
node tools/coop-test.js                        # two clients against a real relay
node tools/screenshots.js                      # regenerate the store screenshots
node tools/balance.js --minimal --levels 1-10    # is it still hard enough?
node tools/balance.js --replay-check --levels 1-5
node server/relay/index.js --test
node tools/backlog.js --summary
# in-page, in a browser:  ?selftest=1

# Store assets
npm install                            # once, for the rasteriser
node tools/store-assets.js             # regenerate the Play icon and graphic
node tools/store-assets.js --check     # CI: fail if they are stale

# Ship
./deploy/deploy.sh --apps=packet-defense --yes
```

**Node 22 or newer is required** to build the Android app: Capacitor 8 needs it.
The verification scripts run on 20 as well, but the Android build does not. An
`.nvmrc` pins the version.

---

## Architecture

### How the code is loaded

There is no module system. Every file is an IIFE that attaches itself to `window`,
and `www/index.html` lists them in dependency order. **The order matters and a
missing tag fails silently** - the campaign map rendered as an empty platform for
a whole release because `roads.js` and `campaign.js` were never included and
`levels.js` degrades to an empty array rather than throwing.

```
config, storage, audio, tracks, music, ads, purchases, progress,
base, map, threats, towers, roads, campaign, levels, story,
engine, net, coop, main, selftest
```

`net.js` and `coop.js` sit between the engine and the screens: the engine exposes
the snapshot codec and the authority switch, `net.js` moves bytes, and `coop.js`
decides which of those happens. `main.js` wires them together and owns the screens.

### The three layers that matter

**`campaign.js` generates the content.** It does not contain 240 hand-written
levels. It builds them from twelve acts, each with a road family, a threat roster
and a set of dials, and `composeWave` solves the enemy count from a power budget
rather than from a hand-picked number. This is why a change to one dial moves all
240 tickets, and why every balance change has to be re-measured rather than
spot-checked.

**`engine.js` runs and draws the battle.** It owns the frame loop, the HUD layout,
input, the money API and - importantly - the action log. A battle is a pure
function of `(ticket, tier, actions)`: the RNG is seeded from the ticket and tier,
and every player action is recorded with the simulation time it happened at.
`--replay-check` records a run and replays it to prove it.

**`towers.js` and `threats.js` are the rules.** Damage, targeting, bounties,
splitting, sabotage. They are deliberately ignorant of who is playing.

### Co-op is host-authoritative, not lockstep

Exactly one client simulates. It is authoritative over money, kills, integrity and
win/lose. Peers send *intents* - "build here", "start the wave" - and receive
snapshots at 10Hz, which they interpolate 150ms behind so there is always a later
snapshot to interpolate towards.

Lockstep was considered and rejected: it requires bit-identical floating point
across devices, and `Math.pow`, `Math.exp` and `Math.sin` are not guaranteed to
agree across JavaScript engines. One unit in the last place of divergence
compounds over minutes of simulation into two players watching different battles,
discovered only at the end. Full reasoning in [`COOP.md`](COOP.md).

The relay uses Server-Sent Events downstream and POST upstream rather than
WebSockets, and this repository has **no runtime dependencies** - the games, the
static server, the relay and the purchase validator are all plain Node `http`.
`EventSource` reconnects by itself and replays from `Last-Event-ID`, which is
exactly the reconnect behaviour a twenty-wave battle needs on a phone.

---

## Conventions

Rules that are load-bearing. Breaking one of these has cost real time.

1. **No runtime dependencies.** Dev dependencies are allowed for tooling only.
   `@resvg/resvg-js` exists solely so store assets can be generated from the SVG.
2. **No assets.** Art and audio are generated from code. This is a deliberate
   strategy, not an accident: no asset pipeline, no licensing, a tiny download,
   and nothing that can go missing at runtime.
3. **A battle must stay a pure function of `(ticket, tier, actions)`.** No
   `Math.random()` anywhere in the simulation. Use `state.rand()`. If you add an
   unseeded call, replays stop reproducing *and nothing tells you*.
4. **Never trust "the bot cleared it" as evidence of difficulty.** A full board
   clears almost anything. The metric is *slack*: the gap between the money a
   ticket gives you and what the winning defence actually cost.
5. **Only `lean` changes which defence wins.** Multiplying health or counts
   changes the numbers, not the answer.
6. **Count caps are the real ceiling.** A bigger budget against fixed caps
   saturates every group and spills the surplus into *health*. When a dial appears
   to do nothing, check whether it saturated.
7. **Generators' ramps are battle totals distributed across waves**, not per-wave
   multipliers. Getting this backwards made a co-op battle twenty-four times its
   intended size and turned extra players into extra enemy health.
8. **Nothing in `www/` is private.** It is the Capacitor `webDir`, so it ships.
   The backlog board lives outside it for exactly this reason.
9. **When a silent failure is found, make it loud.** A thrown exception in a
   startup path once killed the render loop and broadcast nothing; it was only
   found by reading a console log during a manual test. See **PD-302**.

---

## Verification

One command runs everything: **`npm run verify`** (9 seconds, six gates).
`npm run verify:full` adds the 240-ticket campaign sweep and the difficulty
measurement. CI runs the first on every push that touches the game and the second
on main and on tags, so there is one definition of "verified" for both a machine
and a person.

| Gate | Command | What it proves |
|---|---|---|
| Everything fast | `npm run verify` | syntax, backlog, assets, screenshots, relay, co-op, invariants, replay |
| Campaign soundness | `node tools/balance.js` | Difficulty rises monotonically; every ticket is playable; no ticket is a single-threat wall |
| Real difficulty | `node tools/balance.js --minimal --levels 1-40` | The *cost* of the winning defence against the budget |
| Determinism | `node tools/balance.js --replay-check` | A battle reproduces exactly from its action log |
| Co-op rules | `node tools/balance.js --coop --detail` | Per-seat spend sums to the totals and every seat builds something |
| Networking | `node server/relay/index.js --test` | Seat assignment, forwarding, **that a peer cannot forge state**, reconnect replay |
| Two clients | `node tools/coop-test.js` | Two real clients through a real relay agree, each pays for its own towers, and a peer renders the newest snapshot it holds |
| In-page | `?selftest=1` | 54 structural, commerce, gameplay and diagnostics checks in the real page |
| Store set | `npm run shots -- --check` | Five 1920x1080 screenshots exist and are not blank. `npm run shots` regenerates them from the real build |
| Backlog | `node tools/backlog.js` | The plan is internally consistent |

**The single-player campaign is the regression gate for everything.** When
per-player purses were introduced, `state.bandwidth` was deliberately kept as an
accessor onto the active seat rather than being replaced, so the released solo game
did not go through the refactor. The proof is a byte-comparison of the full
campaign report against a saved baseline:

```bash
node tools/balance.js > /tmp/after.txt
diff <(grep -v ' tickets in ' /tmp/baseline.txt) /tmp/after.txt   # must be empty
```

This is the reason the accessor approach was safe to take on something already
shipped. Any change to the engine should be run through it.

---

## Layout

```
packet-defense/
  www/                     the game - everything here ships in the APK
    index.html             script order and the CSP
    js/
      campaign.js          content generation: acts, dials, waves, tiers
      engine.js            frame loop, render, input, money, action log, net codec
      towers.js            8 tower definitions (7 sold), placement, upgrades
      threats.js           enemy types, damage, bounties, splitting
      roads.js             road families and scoring
      levels.js            ticket access and difficulty tuning
      base.js              meta-progression: research, unlocks, hardening
      progress.js          save, stars, credits, tamper check
      story.js             12 acts of narration and chat reactions
      music.js tracks.js   generated music and the adaptive mood machine
      audio.js             generated sound effects
      ads.js purchases.js  AdMob and IAP
      net.js coop.js       co-op transport and session
      diag.js              the failure ring buffer and global handlers
      main.js              screens and wiring
      selftest.js          54 in-page checks behind ?selftest=1
  server/
    relay/                 co-op room server (SSE + POST, zero dependencies)
    validator/             purchase receipt validator (scaffolded, not deployed)
  tools/
    balance.js             the balance harness and difficulty metric
    verify.js              one entry point for every gate
    coop-test.js           two clients, one relay, no browser
    serve.js               dev static server + /coop proxy + /backlog board
    backlog.js             validates backlog/backlog.json
    store-assets.js        generates the Play icon and feature graphic
    screenshots.js         captures the Play screenshots from the real build
    cdp.js                 a small Chrome DevTools Protocol client (~50 lines of use)
    harden-android.js      manifest hardening, AdMob id, version numbers
    configure-signing.js   keystore wiring
  backlog/                 the plan, as data. Not shipped.
  store/                   generated Play assets (icon, feature graphic, screenshots)
  docs/                    this file and the subsystem documents
  deploy/                  provisioning, nginx, systemd, basic auth
```

---

## Documentation map

| Document | Covers |
|---|---|
| **[PROJECT.md](PROJECT.md)** | This file. Architecture, conventions, verification. |
| [RESEARCH.md](RESEARCH.md) | Play requirements, genre analysis, tooling - with sources and dates. |
| [ROADMAP.md](ROADMAP.md) | What to do next and in what order, traced to backlog ids. |
| [backlog/README.md](../backlog/README.md) | How the backlog data is structured, validated and used. |
| [DIFFICULTY.md](DIFFICULTY.md) | The tier dials and the corrected difficulty methodology. |
| [COOP.md](COOP.md) | The co-op protocol, what measurement found, and the Play obligations it creates. |
| [TOWERS.md](TOWERS.md) | The roster, the palette ceiling, and the rules for adding a tower. |
| [PUBLISHING.md](PUBLISHING.md) | Play Console steps, signing, versioning, release order. |
| [PRIVACY.md](PRIVACY.md) | The privacy policy and the matching Data safety answers. |
| [SECURITY.md](../SECURITY.md) | Threat model and what is deterrence rather than protection. |

---

## Known constraints

These are real, measured limits. They are written here because each one has
already caused a wrong decision.

* **The palette holds seven cards.** At the narrowest supported screen width,
  seven build cards at the 44-unit floor use 614 of 620 available units. An eighth
  pushes the wave and pause controls off the right edge. The roster is therefore
  capped at seven sold towers until the palette layout changes (**PD-403**).
* **A board holds about seventy-three towers.** This is why co-op gives the team
  one divided budget rather than a budget per player: with a fixed tile count,
  extra purses buy nothing. It is also why a third co-op seat may be decoration
  (**PD-208**).
* **Co-op difficulty depends heavily on the theme.** Mid-campaign themes measure
  0-2% slack; theme 1 measures 12-46%; theme 240 cannot host three seats usefully.
* **The harness bot is a lower bound.** It maximises road coverage per tile, which
  is the skill the game teaches, so a human will find the game harder than the
  numbers suggest. A bot failure may be a bot-policy bug rather than an
  unwinnable ticket.
* **Nobody has played this on a real Android device.** Every check so far has been
  a desktop browser or a headless harness. The Android path - manifest hardening,
  AdMob id injection, in-app purchase, touch under a real finger - has never been
  run end to end (**PD-804**).
