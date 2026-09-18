# Neon Stack

A hyper-casual one-tap block stacker with a character to protect, enemies to fight, a story, 30 decks and daily missions. Web build + Android wrapper with AdMob.

- **Zero dependencies in the game itself** — plain HTML/CSS/JS + canvas 2D. No Phaser, no Unity, no build step.
- **No binary assets** — every sound is synthesised with WebAudio, every graphic is drawn procedurally. The whole game is a few KB and boots instantly, which matters for a casual game's retention.
- **Ads wired in from the start** — interstitial, rewarded ("continue") and banner slots behind one small API.

---

## Run it

```bash
npm run serve          # http://localhost:8080
```

Open it in a phone-sized viewport. Click/tap anywhere to drop the block.

Add `?debug=1` to the URL to expose `window.__game`, `window.__Profile`, `window.__Missions` and `window.__app` for console tinkering.

## The game

Tap anywhere to drop the sliding block. Any overhang gets sliced off. Land it inside the tolerance of the block below and you get a **PERFECT** — the block keeps its full width and your streak multiplies the score.

**You are not the blocks. You are keeping NS-7 alive.** A drone rides the top of your tower, looking at whatever is closest, flinching when something gets near, and saying what it thinks. It has three **cells** (the bar under the score). Lose them all and the deck is over.

**The core decision is where you cut.** Everything follows from it:

| | What it does | What you do about it |
|---|---|---|
| 🔴 **Crawler** | Walks across the deck toward the drone. Reaches it and you lose a cell. | **Land on it.** A landing covers the deck, so a centred drop crushes it — but an off-centre drop leaves it alive and it hops back up. |
| 🟠 **Turret** | Sits on the deck with a lit danger zone above it. | **Do not land on it** — it detonates and destroys your block, costing you a whole turn of progress. Cut it off the edge instead. |
| 🔵 **Warden** | Guards every chapter finale. Only appears once you reach the deck's goal. | **Hit it.** Every landing damages it, perfect drops damage it twice. It spawns crawlers while you work. |

That pairing is the whole game: **turrets punish precision, crawlers punish sloppiness.** A perfect drop is the best move on an empty deck and a mistake on one with a turret, because the cut you make to avoid it lets the crawler you were ignoring stay alive. Crawlers arrive at deck 4, turrets at deck 13, and the first Warden at deck 6.

**Perfect drops refill your cells** (three in a row), so the way to survive is to get good rather than to play scared.

**Story mode** — 30 decks across 5 chapters. Unit NS-7 climbs the abandoned Neon Spire to restore the colony relay. Each chapter opens with a short transmission and each finale unlocks a story log. Deck goals are short ("stack 16 blocks"), so you can always see the top.

**Endless mode** — no goal, just score. Hostiles join in once you pass 18 points and the speed keeps ramping.

**Stars** — 1★ for clearing a deck, 2★ and 3★ for hitting perfect-drop counts.

## NS-7's voice

`story.js` holds three layers of text: chapter intros, unlocked logs, and **quips** — the lines NS-7 says in a speech bubble during a run. They fire on events (first perfect, first crawler of a chapter, losing a cell, the Warden arriving) and on quiet stretches, where it just muses about the Spire. The `musing` lines are per chapter, so the tone of the game changes as you climb.

## Retention systems

These are the parts that make it a game you come back to rather than a toy:

| System | Where | Why it's there |
|---|---|---|
| **NS-7, the drone** | `actors.js` | You are protecting someone. A score does not care if you fail; a character does. |
| **A Warden per chapter** | `levels.js` + `actors.js` | Every finale is a fight, not just a tall deck. |
| **Cells** | `actors.js` | A life bar turns one mistake into a resource instead of an instant loss. |
| Chapter story | `story.js` | Curiosity. You clear deck 6 to find out what the log says. |
| 30 levels, unlocked in order | `levels.js` | A visible path. One more deck is always a real decision. |
| Stars on perfects | `main.js` | Rewards skill, not just attendance, so replays have a purpose. |
| Coins | `progress.js` | A second reason to chase perfect drops. |
| Themes shop | `skins.js` | Somewhere for the coins to go that isn't a power-up. |
| Daily missions (3) | `missions.js` | A reason to open the app tomorrow. |
| Daily streak + bonus | `progress.js` | Loss aversion: the streak is worth protecting. |
| "You were 3 blocks from the top" | `main.js` | The near-miss framing on the fail screen. |
| Continue for an ad or 50 coins | `ads.js` | Monetisation that also respects the player's time. |

## Project layout

```
neon-stack/
├── www/                     # the game (this is the whole app)
│   ├── index.html           # all screens + the CSP
│   ├── styles.css           # neon UI, safe-area aware, scrollable sheets
│   ├── manifest.webmanifest # PWA install support
│   └── js/
│       ├── config.js        # THE ONE FILE YOU EDIT: ad ids, products, validator
│       ├── game.js          # engine: stacking, slicing, goal, victory camera
│       ├── actors.js        # NS-7, crawlers, turrets, Wardens, cells
│       ├── main.js          # screens, router, run lifecycle, ad cadence
│       ├── purchases.js     # billing + entitlements (never trusts the save file)
│       ├── story.js         # chapters, transmissions, quips and the ending
│       ├── levels.js        # the 30-deck difficulty + hostile curve
│       ├── missions.js      # daily missions
│       ├── progress.js      # the save file: stars, coins, unlocks, streak
│       ├── skins.js         # tower themes
│       ├── ads.js           # AdMob (native) + mock (web) behind one API
│       ├── music.js         # the score: instruments, transport, reactions
│       ├── tracks.js        # the playlist - 21 pieces, written as data
│       ├── audio.js         # procedural sound effects
│       └── storage.js       # low-level settings store
├── server/validator/        # purchase verification service (deploy this)
├── tools/
│   ├── serve.js             # zero-dep dev server
│   ├── configure-signing.js # injects the release keystore into gradle
│   ├── harden-android.js    # backup rules, cleartext denial, no webview debug
│   └── mock-validator.js    # DEV ONLY signed-verdict stub
├── SECURITY.md              # threat model: what is defended and what is not
├── capacitor.config.json    # Android wrapper + AdMob App ID
└── .github/workflows/       # builds the signed AAB in CI
```

### Tuning knobs

**Level curve** lives in `www/js/levels.js`:

| Line | Meaning | Default |
|---|---|---|
| `goal = 6 + n * 1.15` | Blocks needed to clear deck *n* | deck 1 → 7, deck 30 → 47 |
| `speedMul` | Per-deck speed multiplier, max `+50%` | `1.0` → `1.56` |
| `tol = 5 - floor((n-1)/9)` | Perfect window, floor of 3 | `5` → `3` |
| `baseW = 168 - min(48, n * 1.7)` | Starting block width | `168` → `120` |
| `stars[1..2]` | Perfects needed for 2★ / 3★ | 16% / 30% of the goal |

**Feel** lives at the top of `www/js/game.js`:

| Constant | Meaning | Default |
|---|---|---|
| `MIN_SPEED` / `MAX_SPEED` | Travel speed, px/sec | `150` / `430` |
| `LEVEL_SPEED_STEP` | Extra speed per block in a level | `3` |
| `HARD_MAX_SPEED` | Absolute ceiling (~0.7 s to cross) | `520` |
| `BASE_WIDTH`, `DEPTH_X/Y`, `HUE_STEP` | Shape and look | — |

> Speed is capped on purpose. Above roughly 520 px/s a 360-unit traverse takes
> under 0.7 s, which stops being a game of skill and becomes a coin flip.

**Hostiles** are per-deck in `www/js/levels.js` (the `enemies` block), and their
behaviour is tuned at the top of `www/js/actors.js`:

| Constant | Meaning | Default |
|---|---|---|
| `crawlerEvery` | Seconds between crawlers (`0` = none) | deck 4+: `13 - n*0.28` |
| `crawlerSpeed` | Walk speed toward the drone | `12 + n*0.62`, cap 30 |
| `turrets` / `turretEvery` | Turret decks and cadence | deck 13+, ~16-30 s |
| `boss` | Warden HP on a finale (`0` = none) | `2 + chapter` |
| `batteries` | Cells at the start of a deck | `3` |
| `CELL_STREAK` | Perfects needed for a free cell | `3` |
| `DRONE_HOVER` | How high the drone floats above the deck | `46` |

**Story and missions** are plain data — edit `story.js` and the `POOL` in `missions.js`. Nothing else needs to change.

---

## Ads

`www/js/ads.js` exposes one API with two backends:

| | Web / dev | Android (Capacitor) |
|---|---|---|
| `Ads.showInterstitial()` | full-screen mock with countdown | `@capacitor-community/admob` |
| `Ads.showRewarded()` → `true` when earned | mock that pays out after 5s | real rewarded video |
| `Ads.showBanner()` / `hideBanner()` | no-op | adaptive bottom banner |

The mocks are deliberately faithful (countdown, close button disabled until it's allowed, reward only paid if the user watches to the end) so the whole monetisation flow can be tested before you ever touch AdMob.

**Ad cadence:** an interstitial every 3rd *failure* (never after a win, so clearing a deck always feels clean), a rewarded video behind the "CONTINUE" button, and a banner on the home screen only. Every ad-gated continue is also available for 50 coins, which is the friendlier version of the same monetisation.

### Before you publish

Everything you need to change is in **`www/js/config.js`** — ad unit ids, product
ids, prices and the validator. Nothing else needs editing.

1. Replace the **test ad unit IDs** (the defaults are Google's public test ids:
they serve test ads and earn **$0**).
2. Create the four products in Play Console with exactly the ids in `config.js`
(`remove_ads`, `coins_small`, `coins_medium`, `coins_large`).
3. Deploy the validator and set `validator.url` + `validator.publicKey`, then flip
`validator.required: true`. Add its origin to `connect-src` in `www/index.html`.
4. Keep the test ad ids for development builds — clicking real ads yourself is
what gets AdMob accounts banned.
5. Read `SECURITY.md` before you take money.

---

## Android build

The native wrapper is Capacitor. Building an APK/AAB needs a JDK, the Android SDK and ~4 GB of free RAM:

```bash
npm install
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

**This machine can't do that locally** — it has no JDK, no Android SDK and 1.9 GB of RAM, so the Gradle build will run out of memory. Use the CI workflow instead: push this folder to GitHub, add your keystore as secrets (see `.github/workflows/android.yml`), then run the **Android release build** workflow (or push a `v*` tag). It produces a signed `.aab` for Play and a debug `.apk` for testing.

To publish:

1. Create a Google Play developer account — **$25 one-time**.
2. Upload the `.aab` to a new app in the Play Console.
3. Fill in the store listing — copy is drafted in `store/listing.md`.
4. Complete the **Data safety** form and the **Ads** declaration (yes, your app contains ads — required, checked at review).
5. Content rating questionnaire, then roll out to internal testing first.

## Payments

Two things are for sale: **Remove Ads** (a non-consumable) and three **coin
packs** (consumables). `/home` → 🛒 `Store`, and `RESTORE PURCHASES` for anyone
reinstalling.

The important part is not the shop UI, it is where the entitlement comes from:

```
buy -> Google Play -> approve -> POST receipt to your validator
     -> validator asks the Play Developer API -> Ed25519-signed verdict
     -> client verifies the signature -> entitlement granted
```

- **The save file is not the source of truth.** Entitlements are rebuilt from the
  store on every launch, so editing `localStorage` gains nothing that survives a
  restart.
- **The client verifies a signature** against `validator.publicKey`, so a hostile
  network cannot answer "purchase successful".
- **An unverified purchase is queued, not lost**, and retried on the next launch.
  The store transaction is not finished until the validator says yes.
- **If billing is unavailable on a device, nothing is granted and nothing is
  charged.** There is no "assume it worked" path on native.

On web/dev builds there is a mock backend so the whole flow is testable in a
browser — it says so on the screen, and it is unreachable on a native device.

Server setup, service accounts and the acknowledge/consume rules that stop Play
refunding your buyers are in **`server/validator/README.md`**.

## Music

Twenty-one pieces, and not one of them is an audio file. The whole soundtrack is
*generated* while it plays, from recipes in `www/js/tracks.js`. That is not a
gimmick:

- **It reacts.** Land a perfect drop and the mix answers with a note in the
  current chord. Crush a crawler and it lands a hit; take a hit and it sags.
  A recording cannot do this.
- **It never repeats.** Nothing is a loop, so nothing gets stuck in your head
  after the twentieth run.
- **It costs zero bytes and has no licence attached**, which is the honest answer
  to "where do I get 20 tracks I can legally ship".

The playlist sheet (🎵 on the home screen) lists all of them with a character tag,
lets you audition any track, set the volume, and turn auto-rotation on or off.
Your pick and settings are saved.

| Character | Count | What it is for |
|---|---|---|
| `calm` | 7 | Drifting pads for a quiet climb — Signal Drift, Elevator Hum, Quiet Deck… |
| `playful` | 5 | Bouncy and slightly smug — Maintenance Shuffle, Cartwheel, Bubble Lift |
| `driving` | 4 | A pulse to climb to — Ascent Protocol, Relay Sprint, Iron Staircase |
| `odd` | 3 | Deliberately strange — Error 404 stutters, Wrong Deck, Garden of Wires |
| `silly` | 2 | Comedy — Sad Trombone Drone, Kazoo Protocol |

**Interactive, beyond reacting to events.** `Music.setIntensity()` follows your
progress up a deck (transposing new notes and opening the filter), `setMood()`
adds a pulse when something is on your deck and a drone for a Warden, and tracks
rotate every few minutes or every deck so a long session never settles.

### Adding or changing tracks

Edit the array in `www/js/tracks.js`. Nothing else needs to know:

```js
{
  id: 'my-track', name: 'My Track', vibe: 'One line about it',
  character: 'calm',            // the tag shown in the playlist
  root: 110,                    // base frequency, lower is heavier
  scale: 'minorPent',           // pentatonics can't sound wrong; chromatic should
  chords: [[0, -4, 3, -2]],     // progressions, semitones from the root
  bpm: 0,                       // 0 for free-floating ambience, or a real grid
  density: 0.35,                // how busy the melody layer is
  layers: ['pad', 'bass', 'bell'],   // pad, bass, bell, blip, perc, pulse, wobble
  gimmick: 'none',              // or swing/rests/march/arcade/boing/sag/rain/glitch
}
```

Scales available: `minorPent`, `majorPent`, `dorian`, `lydian`, `aeolian`,
`blues`, `japanese`, `wholeTone`, `chromatic`, `airy`.

**Prefer real recordings?** Drop files in `www/audio/`, add an `<audio>` element
per track, and route it through the same master bus (`Sfx.masterBus()`), so the
volume slider and mute keep working. `Music.react()` would need a different
implementation, since note-scheduling is what makes the flourishes possible.

### How loud is it

Tuned by measurement, not by ear. `BED_GAIN` in `music.js` is the single knob:

| | Value |
|---|---|
| Bed level at volume 1.0 (`BED_GAIN`) | `2.55` |
| Measured RMS across the 21 tracks | `0.008` – `0.117` (sparse ambient to dense kazoo) |
| Measured peak sample | max `0.25`, no clipping |
| Silence floor when muted | `< 0.001` |

The compressor sits at -12 dB on purpose: any lower and it fights the bed
instead of only catching stacked bells.

## Security

`SECURITY.md` has the full threat model. The short version:

- The device belongs to the player, so **no client-side check is a security
  control**. Everything that matters is verified server-side.
- A **strict CSP** (`script-src 'self'`, no `unsafe-inline`) plus a build with no
  inline handlers or style attributes means injected script cannot execute.
- **Store-provided strings are rendered as text**, never as markup.
- `tools/harden-android.js` turns off backups, denies cleartext and disables
  WebView debugging in release builds.
- The save file carries a **tamper checksum**. It is detection, not protection —
  the key ships in the bundle, and `SECURITY.md` says so plainly.

Two things are deliberately *not* solved: a rooted device running a repackaged
APK, and iOS purchases (the validator is Android-only until you extend it).

---

## Straight talk about the money

Ads pay on impressions × eCPM. For a casual game, realistic numbers are roughly **$1–$4 eCPM** for interstitials and **$8–$20 eCPM** for rewarded video in tier-1 countries, and a small fraction of that elsewhere. If 1,000 people play 4 runs each with 1 ad per run, that's a few dollars — not a few hundred.

What actually decides whether this earns is **retention and installs**, not the code. Once this ships, the work that matters is soft-launching it, watching the day-1 retention number in Play Console, and iterating on the first 10 seconds of the game. The tuning constants above are where you do that iterating.

---

## Ideas for the next iteration

- A second crawler type that flies, so you have to cut *above* your landing.
- Drone upgrades bought with coins: a fourth cell, faster cell regen, a shield.
- Chapter 6, or a New Game+ that replays the 30 decks at a higher speed band.
- Daily challenge deck — same seed for everyone, one attempt, shareable score.
- Block *shape* skins, not just palettes (hex blocks, glass, pixel art).
- Leaderboards (Play Games Services) once there are enough players to matter.
- Slow-motion on a near miss — cheap tension, big perceived polish.
