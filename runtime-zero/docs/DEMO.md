# Owner demo — try Runtime Zero locally

One command runs the current build. You do not need a debug console, Godot
knowledge or any environment setup beyond a normal VS Code WSL terminal in this
repository (the runner activates the pinned toolchain itself via
`tools/env.sh`).

## What is playable right now (2026-09-21)

- **The full three-region campaign with a work map.** Title (with procedural key
  art) → **equipment loadout** (pick one of three, effect explained) → **work
  map** for region 1 ("Intrusion") — a stage with a winding stone route, a
  region banner, HUD chips and a **mini map** → **tap the glowing TICKET stone**
  and the engineer walks there and the war starts → reward result → next
  region's map ("Load Spike") → "Server Cathedral" boss → **RUN COMPLETE** with
  play-again. Later stones are locked until their region unlocks; cleared
  stones stay walkable. Retry and title flows reset cleanly; rewards are
  granted exactly once per run.
- **The hero is a young man with a laptop, and he walks.** A six-frame walk
  cycle plays while he crosses the map (arms counter-swinging, laptop screen
  glowing) and he turns to face the direction he is walking; he rests in a
  two-frame idle breathing loop on every stone. Every region has its own painted
  1280×720 backdrop (RZ-036) and fights open on the region's painting (dimmed
  for readability).
- **War (combat)**: battlefield staging per the owner's reference — the
  Operator left and the hostiles right, HP bars under each fighter (green pill
  for the hero, red pills for enemies), intent text, a mission banner, a
  centered action dock (Attack / Guard / Skill) and a combat log panel.
  Attack, Guard (single-use halving), Skill (3 energy, double attack), target
  selection (tap a hostile), win/lose/round-cap states.
- **Between encounters** the hero is fully healed and refilled (each fight is a
  fresh session).
- **Input**: mouse, touch (48 px targets), keyboard (`1`/`2`/`3`, Tab/Enter),
  double-click/tap protection, reduced-motion toggle.
- **Quit** with the in-game Quit button (clean shutdown) or the window's X.
- **Progress is remembered** (RZ-009): reduced-motion setting, unlocked rewards
  and your last equipment choice survive restarts. The save is a plain JSON file
  under `~/.local/share/godot/app_userdata/Runtime Zero/save.json`; a corrupt
  save recovers from its backup (`.bak`) and the game always reaches the title.

- **Placeholder sound + mute** (RZ-010): distinct cues for hit/guard/skill/
  telegraph/victory/defeat and UI clicks (generated, deterministic). The **Mute**
  checkbox on the title and combat screens silences everything and is remembered;
  no essential information is audio-only.

**Not playable yet** (later tickets): Android build, real music, and
AI-generated art *integration* — the local image toolchain (ComfyUI +
SDXL-Turbo, RZ-037) is installed under `~/ai` and can generate offline, but the
shipped look stays the deterministic procedural art until you approve a swap at
the RZ-012 style gate. The work map, the select-to-fight flow, the battlefield
combat, saves, sound and the replay-verified rule set (RZ-011) are all in place;
the next gate is **your playtest (RZ-012)**.

## Run it

```sh
tools/demo.sh run            # title: Enter -> equipment -> work map; tap the glowing
                             # TICKET stone and the engineer walks there; the war starts
tools/demo.sh run combat     # straight into the war scene
```

Quit with Ctrl+C in the terminal. On this laptop the window opens through WSLg;
if nothing appears, make sure you are in a WSL terminal with `DISPLAY` set
(`echo $DISPLAY` should print `:0`). On WSL the runner automatically uses Mesa
software rendering — the native driver crashes intermittently (RZ-033, see
"If something goes wrong" below).

## Playtest checklist (RZ-012 — owner review)

Play the build once end to end, then answer from memory — quick impressions are
more useful than careful analysis:

1. Start: `source tools/env.sh && tools/demo.sh run`, then press **Enter** (or
   click **Start**).
2. Pick one of the three equipment cards; note whether the choice felt
   meaningful before you knew the fights.
3. On the **work map**: walk the stones (tap one ahead of the engineer). Does
   the stone route + mini map make the region readable? Tapping the glowing
   TICKET stone walks the engineer there and **starts the war** — did that feel
   right, or should there be a confirm step? Watch the hero while he walks:
   does the six-frame cycle read as walking, and does he face the right way
   when you send him back to a cleared stone?
4. Fight the three regions (Attack / Guard / Skill, tap a hostile to target
   it). Note:
   - **War feel:** is the rhythm (attack → enemy reply → telegraph → your
     turn) readable? Does Guard/Skill feel worth using?
   - **Pacing:** too long, too short, or right? Region 2 has two enemies;
     the boss telegraphs a heavy hit every third normal attack.
   - **Readability:** HP pills under the fighters, the combat log, enemy intent
     text — anything confusing or missing?
   - **View:** the battlefield layout, the procedural sprites and the banner —
     what bothers you most?
5. Finish the run (RUN COMPLETE or defeat), then try **Retry** once.
6. Toggle **Mute** and **MOTION** (reduced motion: instant walks); quit
   in-game, relaunch with `tools/demo.sh run` again and check the toggles and
   your last equipment were remembered.
6. Tell the agent your impressions (or write them in
   `reports/owner-prototype-review.md`). The agent records them verbatim and
   files corrective tasks; nothing in the real-art/audio phases starts before
   this review.

Scope questions answered in this build: it is a **one-run, three-fight slice**
with placeholder visuals and generated placeholder sounds — real painted art
and real music are the phases unlocked after this playtest.

## Captures for the remote reviewer

```sh
tools/demo.sh capture validation/demo/20260921-title.png
tools/demo.sh run -- --auto-enter 60 --capture validation/demo/20260921-loadout.png
tools/demo.sh run -- --auto-enter 60 --auto-begin guard_plating --capture validation/demo/20260921-combat-in-campaign.png
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

- **The window closed by itself shortly after starting (exit code 134).**
  Root cause found on 2026-09-21 (RZ-033): the **native WSLg D3D12 GL path**
  crashes intermittently after roughly 20 seconds of runtime — reproduced with
  a minimal Godot project that contains no game code, so it is the environment,
  not the game. `tools/demo.sh` therefore now forces Mesa's **software
  rendering** on WSL, which was stable in every test run (50 s idle, full
  title→loadout→combat sessions, mouse-driven play, 136 fps measured in a
  3000-frame run — plenty for this 2D game).
- **Want the native (faster in theory) path anyway?**
  `RZ_GL=hardware tools/demo.sh run` — expect the intermittent crash; useful
  only for testing whether WSLg's driver got fixed upstream.
- **Crashes even on the default path.** Godot writes a log and crash dump under
  `~/.local/share/godot/app_userdata/Runtime Zero/logs/`. Run `wsl --shutdown`
  in Windows PowerShell, reopen the terminal and retry. If it then still
  crashes *while you are playing*, note what you were doing — that would be a
  game bug.
- **Quit cleanly from inside the game.** The **Quit** buttons on the title and
  combat screens and the window's X button use the clean shutdown path. Killing
  the game from the terminal (Ctrl+C) after playing for a while can make WSLg's
  graphics stack crash *during teardown* (exit code 134) even though gameplay
  was fine — measured on 2026-09-21: window-close exits 0, `SIGTERM` at ~3 s
  exits clean, `SIGTERM` at ~10 s crashed 4/4 (Mesa `swrast_dri.so`). Prefer
  Quit/X.
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
