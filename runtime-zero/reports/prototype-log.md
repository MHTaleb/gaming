# Prototype build log

Running evidence for prototype-phase tickets (P0–P1). Raw artifacts stay in ignored
`reports/local/`; this file records their location, hash and the measured outcome.

## RZ-004 — independent Godot project and first launch (2026-09-20)

Engine: **Godot 4.7.2.stable.official.ed1daf0bf** (GDScript build, sha512-verified in
`config/toolchain.lock.json`), installed at `~/.local/godot/`.

Project layout created:

```
game/project.godot            GDScript project; main scene res://scenes/title.tscn
game/scenes/title.tscn        provisional title screen (placeholder labels)
game/src/presentation/title.gd
game/src/{domain,application,infrastructure}/README.md   layer boundaries
```

Renderer: **GL Compatibility** (`rendering_method` and `.mobile`). Rationale: works
through WSLg (which exposes OpenGL 3.3 via Mesa/D3D12) and travels best to Android;
placeholder 2D does not need Forward+/Vulkan. Viewport 1280×720, `canvas_items`
stretch, orientation 0 (landscape) for the provisional landscape target.

### Checks actually run

| Command | Result |
|---|---|
| `~/.local/bin/godot --headless --path game --editor --quit` | exit 0; filesystem scan and editor init completed; no parse errors; `title.gd.uid` generated |
| `~/.local/bin/godot --path game --quit-after 300 -- --smoke-shot` | exit 0; window opened through WSLg (OpenGL 3.3 Core, Mesa 21.2.6, D3D12 device: RTX 4050); title scene rendered |

GUI-render evidence (not committed, recorded by hash):

- `reports/local/rz-004-title-smoke.png` — 1280×720 RGBA PNG, sha256
  `1304aa63480204d73240bdb079ffe758e011c2fc4b285a7a6d48bce7f413669e`
- Captured by the scene itself via `--smoke-shot` (user arg) which saves
  `user://title_smoke.png` after 5 frames and quits; the hook is presentation-only and
  inert during normal play.

Observed non-fatal warnings on WSLg (recorded, not hidden):

- `Could not set V-Sync mode ... not supported by the graphics driver`
- `libxkbcommon ... undefined symbol` messages from the WSLg X11 stack

Neither blocked rendering or input startup. If they grow into input problems, the
documented fallback is a Windows-editor/WSL-CLI split with matched engine versions.

No export templates were installed and no export preset exists yet (P6 owns that).

## RZ-005 — deterministic combat commands and events (2026-09-20)

Implemented in `game/src/domain/` (pure RefCounted data, no scene/timer/IO access):

| File | Role |
|---|---|
| `rules.gd` | Versioned rule constants (`RULES_VERSION` 1), mitigation and guard-floor math, round cap 50 |
| `actor_state.gd` | Actor stats/state incl. hero guard flag, boss telegraph + normal-attack counter |
| `combat_state.gd` | Turn index, actors, outcome (ONGOING/VICTORY/DEFEAT/STALLED), `rng_state` (reserved; v1 consumes none), `state_hash()` |
| `combat_command.gd` / `combat_event.gd` | DATA_CONTRACTS shapes, monotonic event sequence |
| `combat_resolver.gd` | Pure `resolve(state, command)` → `{accepted, reason, state, events}`; rejection consumes nothing |

Rules implemented per `docs/GAME_DESIGN.md`: Attack `max(1, atk-def)`; Guard halves with
integer floor/min 1; Skill costs 3 energy and deals `max(1, 2*atk-def)`; enemies act in
stable actor-ID order after the hero and dead actors never act; +1 energy at round end up
to cap; boss telegraphs after every third normal attack and then hits for double attack;
victory/defeat evaluated after every action; round cap → STALLED (never a win); HP/energy
clamped; rejected commands change no state, consume no sequence number and emit no events.

**Superseded by RV-001 V-001 (2026-09-20):** the paragraph below recorded a full-round reading of Guard; the validator demonstrated that the specification requires single-use semantics ("the next incoming damage" = one hit). The corrected contract is rules v2 in `game/src/domain/rules.gd`: Guard halves only the next incoming hit, that hit consumes the Guard, and an unused Guard expires at the hero's next turn. The independent regression `validation/guard_contract.gd` passes (hits [3, 6], hero HP 91, input state unchanged).

> Historical (RZ-005 as committed): "guard expires at the hero's next turn" was implemented as *every* incoming hit while active being halved (floor, min 1), with the flag clearing when the hero's next turn begins — not as a single-use shield.

### Checks actually run

| Command | Result |
|---|---|
| `~/.local/bin/godot --headless --path game --editor --quit` | exit 0 (registers global class names after new scripts are added) |
| `~/.local/bin/godot --headless --path game --script res://tests/run_tests.gd` | exit 0 — **ALL TESTS PASSED (86 checks)**: deterministic replay (identical state hash + event stream for the same inputs), invalid-input rejection without state change, stale/duplicate command rejection, guard halving/expiry/no-stacking, enemy ordering with dead-skip, clamps, terminal states, boss telegraph/heavy, round-cap stall, monotonic event sequences |

Note for CI (RZ-011): a fresh checkout must run the headless editor import once before
`--script` tests, so the GDScript global class cache exists in `.godot/`.

## RV-001 corrections (2026-09-20)

- **V-001 (Guard, high)**: rules v2 — single-use. `game/src/domain/combat_resolver.gd`
  consumes `guard_active` on the first incoming hit (`guard_halved` carries
  `consumed: true`); unused guards still expire at the hero's next turn; minimum-1 floor
  and no stacking preserved. `docs/GAME_DESIGN.md` wording made explicit. Combat suite is
  now **96 checks**; the validator's independent `validation/guard_contract.gd` passes
  (hits [3, 6], hero HP 91, input immutable).
- **V-002 (toolchain)**: `tools/env.sh` activates Node 22+, uv and the pinned Godot from
  a fresh terminal without editing global shell config.
- **V-003 (evidence)**: sanitized logs and the title PNG live under
  `validation/evidence/001-response/`; exact commands, exits and hashes are in
  `reviews/RV-001/response.json`.
- **V-004 (docs)**: README, START_HERE, reports index and the decision register updated
  to describe the implemented scaffold/core and the still-pending game, studio and
  device work.

## RZ-006 — content packs with validation (2026-09-21)

- `game/content/{enemies,encounters,equipment}.json`: prototype fixtures (Memory Leak groups,
  Server Cathedral boss, three equipment effects) with item-level schema versions; documented in
  `game/content/README.md`.
- `game/src/infrastructure/content_repository.gd`: JSON-only loader/validator. Godot's JSON parser
  returns numbers as floats, so loads normalize integral values back to ints and scalar checks
  accept integral floats while rejecting fractions, non-finite values and wrong types. Behavior ids
  are allowlist lookups (`basic_attack`, `boss_heavy_cycle`); a script path is rejected as data and
  never loaded.
- Rejects: missing/duplicate ids, wrong field types, out-of-range stats, unknown behaviors/stats,
  unknown enemy references, actor/count mismatches, duplicate actor ids, broken progression links
  (dangling target, cycles, extra roots, unreachable), unsupported schema/rules versions.
- `game/tests/content_tests.gd` plus malformed fixtures under `game/tests/fixtures/content/`.

Checks run (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `godot --headless --path game --editor --quit` | exit 0 (imports + class cache) |
| `godot --headless --path game --script res://tests/content_tests.gd` | exit 0 — **54 checks passed** |
| `godot --headless --path game --script res://tests/run_tests.gd` | exit 0 — 96 checks, regression intact |
| `godot --headless --path game --script $PWD/validation/guard_contract.gd` | exit 0 — hits [3,6], HP 91 unchanged |
| `node tools/verify.js` | exit 0 — specification verification passed (31 implementation tickets), review records valid |

## RZ-007 — playable combat scene (2026-09-21)

- `game/src/application/combat_session.gd`: single-encounter session — loads the validated pack,
  builds hero + enemies (equipment effects applied), runs intents through the pure resolver,
  supports reset/retry. Hero baseline is the provisional GAME_DESIGN fixture held in one named
  place; the loadout/run service (RZ-008) owns progression.
- `game/scenes/combat.tscn` + `game/src/presentation/combat.gd`: HUD (HP/energy bars with text),
  enemy rows with intent and target selection, action buttons with costs and disabled reasons,
  ordered event log, outcome banner with Retry/Title, reduced-motion toggle, keyboard shortcuts
  1/2/3 + Tab focus, 48 px touch targets. All input (mouse, touch, keyboard, scripted) goes through
  one `submit_action()` path with double-click/tap debounce; queued duplicates for a resolved turn
  are rejected by the domain as stale. State applies first, tweens only decorate.
- `game/src/presentation/combat_text.gd`: pure formatting; boss intent mirrors the resolver's
  telegraph cycle via RZRules constants; every resolver reason maps to a player sentence.
- `game/src/presentation/capture.gd` unifies screenshot modes; the title screen starts combat
  on Enter/click and keeps `--smoke-shot`.
- `game/tests/presentation_tests.gd`: **90 checks** — session/equipment/error paths, energy gating,
  stale-turn rejection, victory (4 attacks → 82 HP), defeat (guard-only loses on turn 12), round-cap
  stall, boss intent cycle including the telegraphed heavy (21 → 10 halved), text coverage, scene
  widgets + shortcuts + focus, double-input debounce, disabled-skill reason, terminal banner + retry,
  and identical state hashes with animations on vs off.

Checks run (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `godot --headless --path game --script res://tests/presentation_tests.gd` | exit 0 — **ALL PRESENTATION TESTS PASSED (90 checks)** |
| `godot --headless --path game --script res://tests/run_tests.gd` | exit 0 — 96 checks, regression intact |
| `godot --headless --path game --script res://tests/content_tests.gd` | exit 0 — 54 checks, regression intact |
| `godot --headless --path game --script $PWD/validation/guard_contract.gd` | exit 0 — Guard contract unchanged |
| `DISPLAY=:0 godot --path game res://scenes/combat.tscn -- --combat-smoke validation/evidence/007/combat-smoke` | exit 0 — 3 captures; round=4, hero 85/100, energy 4/6; state_hash `8fcedb79…db9` |

Capture hashes (sha256, this run; captures are cosmetic snapshots — the deterministic artifact
is the printed state_hash): `combat-1-attack.png` `f29bf47d…6d89`, `combat-2-guard.png`
`2d5a6b03…9d32`, `combat-3-skill.png` `4b7b7616…ed70`.

## RZ-031 — owner demo runner (2026-09-21)

- `tools/demo.sh`: `run [title|combat]`, `capture <png> [title|combat]`, `smoke <dir>`; activates
  `tools/env.sh` itself (pinned Godot 4.7.2), requires a display, adds no gameplay state, network
  or credentials, and only plays the current build (RZ-012 gate untouched).
- `docs/DEMO.md`: one-command instructions, the exact playable scope at this milestone, capture
  workflow and runner guarantees.
- Committed milestone captures: `validation/demo/20260921-title.png` (sha256 `fb5055c9…162f`) and
  `validation/demo/20260921-combat/` (attack/guard/skill; combat frames are cosmetic snapshots,
  the deterministic artifact is `state_hash 8fcedb79…db9`). `validation/demo/MANIFEST.md` ties
  them to their implementation commit.
- False-success bug found and fixed while building this: under `--headless` the dummy renderer has
  no viewport texture, and the capture helper reported success while writing nothing (a `null`
  result was coerced to `OK`). `capture.gd` now refuses loudly (`ERR_UNAVAILABLE`, exit 1, no
  file) and `presentation_tests.gd` pins that behavior (suite: 90 → **92 checks**).

Checks run (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `tools/demo.sh run --quit-after 300` | exit 0 — title window on WSLg |
| `tools/demo.sh run combat --quit-after 300` | exit 0 — combat window on WSLg |
| `tools/demo.sh capture validation/demo/20260921-title.png` | exit 0 — PNG + sha256; byte-identical from a fresh `env -i` shell |
| `tools/demo.sh smoke validation/demo/20260921-combat` | exit 0 — 3 frames, round=4, hero 85/100, energy 4/6, state_hash `8fcedb79…` |
| `godot --headless --path game -- --capture /tmp/rz-headless.png` | exit 1 — clear refusal, no file written |
| `godot --headless --path game --script res://tests/presentation_tests.gd` | exit 0 — 92 checks |
| `node tools/verify.js` | exit 0 — specification verification passes with RZ-031 done |

## Post-demo feedback fixes (2026-09-21 evening)

Owner report after `tools/demo.sh run`: "I started the demo but only got a screen about the game,
there was nothing else, no characters no menu" (terminal exit 134).

Findings and fixes:

- **Clicks did nothing.** The full-screen title `Control` and its `Background`/`Center` children kept
  the default `MOUSE_FILTER_STOP`, so the GUI layer consumed every click before `_unhandled_input`
  could start the game. Reproduced through the real input pipeline (`Window.push_input`) and pinned by
  regression tests that inject a real click, a real ENTER press and a real Start-button press.
  Fixed by `mouse_filter = IGNORE` on all three containers.
- **No visible way in.** Added a real `Start - enter combat` button (focused by default) plus a hint
  line: ENTER/Space, a click anywhere and the button all start the fight.
- **"No characters".** Added placeholder character chips (hero blue, enemies orange, boss violet) —
  shapes only, per the placeholder-art mandate; the graphics phase (RZ-016+) replaces them.
- **Exit code 134.** Godot's own crash dump (under the app_userdata logs) shows SIGSEGV inside
  `swrast_dri.so` (Mesa software rasterizer) after a session that had started normally on D3D12 — an
  environment teardown crash, not game logic. `tools/demo.sh` now explains signalled exits, points at
  the log directory and exits with the same code; `docs/DEMO.md` has an "If something goes wrong"
  section. Guidance verified with a real signalled exit.

Verification (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `godot --headless --path game --script res://tests/presentation_tests.gd` | exit 0 — **104 checks** (was 92; +12 interaction/chip checks) |
| `tools/demo.sh run -- --auto-enter 60 --capture validation/demo/20260921-combat-from-title.png` | exit 0 — real ENTER injected into the live window, title → combat, capture written, no crash dump; repeated run also clean |
| `tools/demo.sh run --definitely-not-a-flag` | exit 134 with the new guidance lines (real signalled exit) |
| `run_tests.gd` / `content_tests.gd` / `guard_contract.gd` / `verify.js` | all green |

## RZ-032 — owner demo polish: landing art, quit affordances, diagnostics (2026-09-21)

Owner ask (2026-09-21): "did you install any graph art tool to draw something to be our background
image of landing page". Recorded answer: no external art tool is installed; the graphics pipeline
(RZ-016+) is gated on RZ-012 and needs multi-GB model downloads. The art bible allows flat layered
placeholder shapes now, so this ticket delivers original procedural key art plus the fixes born
from the "when I hit enter the game quits" investigation.

- `tools/make_landing_art.gd`: deterministic procedural generator (pure math + integer hashes, no
  randomness, no downloads) -> `game/assets/branding/landing_background.png` (1280x720 RGBA8).
  Navy/graphite gradient, cyan horizon glow, perspective floor grid, server-ruin skyline with sparse
  cyan/amber windows, data motes, vignette and faint scanlines. No UI-like text (ART_BIBLE).
- `game/scenes/title.tscn`: `LandingArt` TextureRect (click-through, `expand_mode=1`) plus a Quit
  button; copy updated. `game/scenes/combat.tscn`: Quit button in the header.
- Lifecycle diagnostics in both scenes: `[rz] title ready / start / combat ready / quit requested /
  window close requested`, so the next demo run self-documents where it ends.

Signal investigation (explains the owner-visible "exit 134"; also recorded in docs/DEMO.md):

| Scenario | Result |
|---|---|
| Window close (WM) while idling or in combat | exit 0, no crash dump — clean (2/2) |
| SIGTERM ~3 s after launch | exit 143, clean (4/4) |
| SIGTERM ~10 s after launch | exit 134, crash dump in Mesa `swrast_dri.so` (4/4) |
| SIGINT ~10 s after launch | crash 3/4 |
| Real X11 focus + ENTER via XTEST | game stays alive, combat reached — ENTER itself never crashes |

Conclusion: the app does not quit on ENTER; kills from the terminal after a while crash WSLg/Mesa
shutdown. The new Quit buttons use the clean `get_tree().quit()` path.

Checks run (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `godot --headless --path game --script $PWD/tools/make_landing_art.gd` (twice) | identical sha256 `3711b48c…9217` — byte-reproducible |
| `godot --headless --path game --script res://tests/presentation_tests.gd` | exit 0 — **109 checks** (art + quit coverage added) |
| `tools/demo.sh capture validation/demo/20260921-title.png` | exit 0 — title art captured |
| `tools/demo.sh run -- --auto-enter 60 --capture …combat-from-title.png` | exit 0 — real ENTER, combat reached |
| `tools/demo.sh smoke validation/demo/20260921-combat` | exit 0 — 3 frames; state_hash `8fcedb79…` unchanged |

## RZ-008 — three-encounter campaign: loadout, progression, rewards, retry (2026-09-21)

- `game/src/application/run_service.gd` (autoload `RZRun`): loadout choice, the connected
  encounter chain, rewards granted at most once, defeat/stall handling, retry and reset.
  Progression is deliberately two-step - the combat scene *reports* an outcome, the result
  screen *advances* - so duplicate clicks or a re-entered screen cannot double-grant or skip
  an encounter. Healing between fights is structural: every fight is a fresh session at full
  HP/energy.
- `game/scenes/loadout.tscn` + `loadout.gd`: equipment cards driven by content (name,
  description, exclusive selection, Begin disabled until chosen; `--auto-begin` hook for
  verification captures).
- `game/scenes/result.tscn` + `result.gd`: victory/reward/next, run-complete with play-again,
  defeat/stall with retry; advancing happens here exactly once.
- `combat.gd`: follows the active run (encounter + equipment), reports the outcome once,
  offers Continue instead of standalone Retry while a run is live; title resets the run.
- `game/tests/run_flow_tests.gd`: **44 checks** - begin variants, advance refused without a
  victory, reward-granted-once (incl. campaign replay), first-report-wins, defeat/stall cannot
  advance, and the full campaign through the real scenes: loadout → encounter_1 → result →
  encounter_2 (healed) → boss → RUN COMPLETE → play again.

Checks run (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `godot --headless --path game --script res://tests/run_flow_tests.gd` | exit 0 — **ALL RUN FLOW TESTS PASSED (44 checks)** |
| `godot --headless --path game --script res://tests/presentation_tests.gd` | exit 0 — 111 checks (title now opens the loadout) |
| `godot --headless --path game --script res://tests/run_tests.gd` | exit 0 — 96 checks |
| `godot --headless --path game --script res://tests/content_tests.gd` | exit 0 — 54 checks |
| `godot --headless --path game --script $PWD/validation/guard_contract.gd` | exit 0 |
| `tools/demo.sh run -- --auto-enter 60 --capture …loadout.png` | exit 0 — loadout capture |
| `tools/demo.sh run -- --auto-enter 60 --auto-begin guard_plating --capture …combat-in-campaign.png` | exit 0 — title → loadout → combat through real input hooks |

## RZ-009 — save, backup recovery and migration (2026-09-21)

- `game/src/infrastructure/save_repository.gd`: versioned JSON under user:// with **atomic
  replacement** (temp file + rename, previous revision kept as `.bak`), **backup recovery**
  when the main file is unreadable, **v0→v1 migration**, strict field sanitizing (wrong types
  fall back to defaults, rewards deduplicated) and fail-closed handling of newer save versions.
  A missing/corrupt save never blocks the game and never raises.
- Wired into the app: `RZRun` loads the profile at startup and persists rewards as they are
  granted, the last equipment choice on begin, and the reduced-motion setting from the combat
  toggle (the mute field is ready for RZ-010 audio). The loadout preselects the remembered
  equipment, so **progress and settings survive restarts**.
- `game/tests/save_tests.gd`: **24 checks** — round-trip, atomic replace (no `.tmp` residue,
  `.bak` holds the previous revision), corrupt main → backup recovery, fully corrupt → usable
  defaults, raw v0 fixture migration, future version refusal, type sanitizing/dedup, and the
  RZRun profile integration (settings persist, equipment remembered, rewards survive reload).

Test-suite note (learned here): in `--script` harnesses the autoload's `_ready` runs on the
first processed frame; suites settle it with `await process_frame` before touching profile
state, otherwise the reload clobbers test setup.

Checks run (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `godot --headless --path game --script res://tests/save_tests.gd` | exit 0 — **ALL SAVE TESTS PASSED (24 checks)** |
| `godot --headless --path game --script res://tests/run_flow_tests.gd` | exit 0 — 45 checks (loadout memory covered) |
| `godot --headless --path game --script res://tests/presentation_tests.gd` | exit 0 — 111 checks |
| `godot --headless --path game --script res://tests/run_tests.gd` | exit 0 — 96 checks |
| `godot --headless --path game --script res://tests/content_tests.gd` | exit 0 — 54 checks |
| `tools/demo.sh run -- --auto-enter 60 --auto-begin power_booster --quit-after 400` | real GUI session wrote `save.json` with `last_equipment: power_booster` (checked on disk) |

## RZ-010 — accessibility polish and placeholder sound (2026-09-21)

- `tools/make_sfx.gd`: deterministic generator (no downloads/randomness) -> seven WAV cues
  (ui_click, hit, guard, skill, telegraph, victory, defeat); identical hashes across runs.
- `game/src/presentation/audio.gd` (autoload `RZAudio`, runtime profile lookup): fixed voice
  pool, event->cue mapping, mute-aware playback, `stop_all` on mute. Loadout/result/title play
  click cues; combat maps every domain event (energy regen deliberately silent).
- Mute + reduced-motion checkboxes on title and combat persist via the RZ-009 save; both scenes
  reflect saved state on load. Keyboard focusability and 48 px targets re-verified.
- `reports/prototype-accessibility.md`: scope, honest gaps (portrait/phone + screen-reader not
  claimed, real audio phase later) and the cue inventory with hashes.

Checks run (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `godot --headless --path game --script res://tests/feedback_tests.gd` | exit 0 — **ALL FEEDBACK TESTS PASSED (36 checks)** |
| `godot --headless --path game --script res://tests/presentation_tests.gd` | exit 0 — 111 checks |
| `godot --headless --path game --script res://tests/run_flow_tests.gd` | exit 0 — 45 checks |
| `godot --headless --path game --script res://tests/save_tests.gd` | exit 0 — 24 checks |
| `run_tests.gd` / `content_tests.gd` / `guard_contract.gd` | all exit 0 |
| `godot --path game --resolution 1024x600 -- --capture validation/evidence/010/narrow-1024x600.png` | exit 0 — narrow desktop capture inspected |

## RZ-011 — replay fixtures and automated game gates (2026-09-21)

- `game/src/application/replay_runner.gd`: canonical replay execution through the same
  `RZCombatSession` the UI uses; ordered-event digest (seq|turn|type|actor|target|payload,
  sha256) plus final state hash; rejected commands recorded, never fatal.
- `tools/make_replay_fixtures.gd`: deterministic generator for `game/tests/fixtures/replay/`
  — four pinned scenarios (encounter 1 win, guard-only defeat on round 12, boss win on
  round 9 at 4 HP, unknown-command rejected). Regeneration is deliberate review, not a
  routine; reruns produce identical sha256 values.
- `game/tests/replay_tests.gd` (56 checks): fixtures parsed against engine rules version,
  replayed twice for determinism, every pinned field compared; the real combat scene is
  driven with the same commands and must land on the same state hash, outcome and HP,
  and reject the same invalid command with the same reason as the runner.
- `.github/workflows/runtime-zero-game.yml` (repository root): downloads the pinned Godot
  4.7.2 zip, verifies its sha512 from `config/toolchain.lock.json`, imports the project,
  runs all seven suites, the Guard validator contract and `node tools/verify.js`. No GPU,
  no secrets, no model downloads.
- Negative test: an unreviewed `BOSS_NORMALS_PER_TELEGRAPH` change fails three boss-fixture
  checks (`validation/evidence/011/negative-rule-change.log`), then was reverted.

Checks run (pinned Godot via `source tools/env.sh`):

| Command | Result |
|---|---|
| `godot --headless --path game --script res://tests/replay_tests.gd` | exit 0 — **ALL REPLAY TESTS PASSED (56 checks)** |
| `godot --headless --path game --script $PWD/tools/make_replay_fixtures.gd` (two runs) | identical sha256 for all four fixtures across runs |
| full battery (import + 7 suites + guard + `verify.js`) | see `validation/evidence/011/battery.log` — all exit 0 |
| deliberate rule change, unreviewed | replay suite failed 3/56 as designed, reverted (`validation/evidence/011/`) |

## RZ-033 — demo stability on WSLg (hotfix from owner playtest, 2026-09-21)

- Owner playtest finding: "when I hit start it closes directly". Reproduced with a real
  mouse click and with idle runs: signal 11 in Mesa `swrast_dri.so`, exit 134 within
  ~20 s — also on a **minimal Godot project without game code**, so the environment,
  not the game.
- Fix: `tools/demo.sh` now defaults to Mesa software rendering on WSL (stable in every
  test: 50 s idle, 3000-frame chain at ~136 fps, full mouse-driven session ending
  `demo-exit=0`); `RZ_GL=hardware` opts back into the native path. Title subtitle
  updated (the "RZ-009/010" line was stale).
- Evidence: `validation/evidence/033/` (8 logs + README); owner feedback recorded in
  `reports/owner-prototype-review.md` (RZ-012 remains open).

| Command | Result |
|---|---|
| `godot --path /tmp/rzmin` (minimal project, native GL) | crash at 23 s — environment-level |
| `LIBGL_ALWAYS_SOFTWARE=1 timeout 50 godot --path /tmp/rzmin` | survived, 0 crashes |
| `tools/demo.sh run` (default, 30 s) | survived on llvmpipe, 0 crashes |
| mouse flow: Start → card → Begin → 4 attacks → result → next → Quit | `demo-exit=0` |
| `tools/demo.sh capture` / `smoke` under the new default | work; smoke `state_hash` 8fcedb79… unchanged |

## RZ-034 / RZ-035 — battlefield war + region map with mini map (2026-09-21 night)

- Owner supplied Obsidian Knight references (region stages with stone routes; war scene with fighters, HP pills, banner, action dock).
- RZ-034 (war presentation): battlefield staging (hero left / hostiles right, HP pills under fighters, mission banner, centered action dock, log panel); procedural fighter sprites via tools/make_combat_art.gd; impact pulse + banner flourish (reduced-motion aware).
- RZ-035 (work map): one region per screen with a winding stone route (RouteBoard canvas art), HUD chips, dock buttons (CONTRACTS/CHESTS/INVENTORY/ABANDON), region banner + backdrop tint/pan, and a **mini map**; selecting the region ticket stone walks the engineer there and **starts the war immediately**.

| Command | Result |
|---|---|
| `godot --headless --path game --script res://tests/map_tests.gd` | exit 0 — 28 checks (minimap shown, select-ticket-stone starts the war, locks, motion modes) |
| `godot --headless --path game --script res://tests/run_flow_tests.gd` | exit 0 — 48 checks (loadout → map → war ×3, result → map → next war) |
| `godot --headless --path game --script res://tests/presentation_tests.gd` | exit 0 — 112 checks (battlefield layout incl. backdrop) |
| captures | `validation/evidence/034/` battlefield ×2 + generator log; `validation/evidence/035/` map ×2 with mini map |
