# Owner demo — try Runtime Zero locally

One command runs the current build. You do not need a debug console, Godot
knowledge or any environment setup beyond a normal VS Code WSL terminal in this
repository (the runner activates the pinned toolchain itself via
`tools/env.sh`).

## What is playable right now (2026-09-21)

- **Title → combat.** The title screen has procedural placeholder key art, a
  visible **Start - enter combat** button; ENTER/Space or a click anywhere also
  starts the fight. Quit with the in-game **Quit** button (clean shutdown).
- **One encounter** (`encounter_1`, "Intrusion"): you against one Memory Leak.
- **Placeholder characters**: the hero and each enemy show a colored chip (real
  art arrives in the graphics phase; names and text carry the identity too).
- **Three actions**: Attack, Guard (halves the next incoming hit, single use),
  Skill (costs 3 energy, double attack power). Unavailable actions are disabled
  and say why (e.g. "Needs 3 energy (have 2)").
- **Target selection**, **enemy intent** ("Attack", "Heavy attack incoming (x2)"
  for the boss), an ordered **combat log**, HP/energy **bars plus text**,
  **win/lose/round-cap** banner with **Retry** and **Title** buttons.
- **Input**: mouse, touch (48 px targets), keyboard (`1` Attack / `2` Guard /
  `3` Skill, Tab to move focus, Enter to activate), double-click/tap protection,
  and a **Reduced motion** toggle.

**Not playable yet** (later tickets): loadout and equipment choice UI,
encounter progression beyond the first fight, rewards, saves, audio, Android
build. This demo shows the first slice's combat loop only.

## Run it

```sh
tools/demo.sh run            # title screen; press Enter/click to fight
tools/demo.sh run combat     # straight into the combat scene
```

Quit with Ctrl+C in the terminal. On this laptop the window opens through WSLg;
if nothing appears, make sure you are in a WSL terminal with `DISPLAY` set
(`echo $DISPLAY` should print `:0`).

## Captures for the remote reviewer

```sh
tools/demo.sh capture validation/demo/20260921-title.png
tools/demo.sh capture validation/demo/20260921-combat.png combat
tools/demo.sh smoke validation/demo/20260921-combat   # Attack/Guard/Skill frames + state summary
```

`capture` saves one PNG and prints its sha256; `smoke` saves one PNG per action
plus the round/hp/energy summary and a `state_hash` line. Captures are cosmetic
snapshots pending layout changes — the deterministic artifact is the state hash.

Captures need a display (WSLg). Headless mode refuses instead of writing a file
that was never rendered, and the runner says so when `DISPLAY` is missing.

## Committed milestone captures

`validation/demo/MANIFEST.md` lists the committed captures with their commit,
sha256 and an honest statement of what was playable at that point. A reviewer
without laptop access can open the PNGs and compare the manifest with the
backlog evidence.

## Rules this runner follows (RZ-031)

- It only launches the current build: no gameplay state, no rewards, no network
  access, no credentials.
- It does not bypass the **RZ-012** owner review gate — expansion still needs
  Housseyn's playtest notes.
- A capture never claims more than the build it came from: the manifest states
  the exact playable scope at that commit.

## If something goes wrong

- **Quit cleanly from inside the game.** The **Quit** buttons on the title and
  combat screens and the window's X button use the clean shutdown path. Killing
  the game from the terminal after playing for a while can make WSLg's graphics
  stack crash *during teardown* (terminal exit code 134) even though gameplay was
  fine — measured on 2026-09-21: window-close exits 0, `SIGTERM` at ~3 s exits
  clean, `SIGTERM` at ~10 s crashed 4/4 (Mesa `swrast_dri.so`). Prefer Quit/X.
- **The window crashed / the terminal shows exit code 134 or 139.** See above:
  teardown crash of the WSLg/Mesa stack, not game logic. Godot writes a log and
  crash dump under `~/.local/share/godot/app_userdata/Runtime Zero/logs/`.
  If it repeats, run `wsl --shutdown` in Windows PowerShell, reopen the terminal
  and retry. If it ever crashes *while you are playing*, note what you were doing
  - that would be a game bug, not a teardown crash.
- **Nothing responds to clicks.** Should not happen anymore: the title
  background passes clicks through and the Start button is a real button. If it
  does, the log above plus the exact click location helps.
- **Curious what the game did?** Both scenes print `[rz] …` lifecycle lines
  (title ready / start / combat ready / quit requested).

## Verifying the runner itself

```sh
tools/demo.sh run --quit-after 300          # opens and exits cleanly
tools/demo.sh run combat --quit-after 300
tools/demo.sh capture validation/demo/verify.png && sha256sum validation/demo/verify.png
```

Recorded verification for RZ-031 lives in `reports/prototype-log.md`.
