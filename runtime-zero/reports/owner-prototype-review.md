# Owner prototype review (RZ-012) — in progress

Owner: Housseyn. Reviewer of record: the owner (human playtest). This file records
actual feedback verbatim as it arrives; nothing here is self-approval, and RZ-012
stays open until the owner has played the slice and answered the checklist in
`docs/DEMO.md`.

## Build identity

- Repo: `MHTaleb/gaming`, branch `codex/runtime-zero-impl`.
- Build under test: commit `41baece` plus the RZ-033 rendering fix commit
  (`tools/demo.sh` software-GL default). Godot 4.7.2.stable (sha512 pinned in
  `config/toolchain.lock.json`).
- Environment: Lenovo 83GS, WSL2 Ubuntu 20.04.6 + WSLg, RTX 4050 (D3D12 WSLg path),
  1280x720 window.

## Feedback received (2026-09-21 evening)

1. Verbatim: *"when I hit start it closes directly"*
   - Investigation: reproduced with real mouse input and idle title runs; then
     reproduced with a **minimal Godot project without any game code**. Root cause
     is the native WSLg D3D12 GL path crashing intermittently after ~20 s (Mesa
     `swrast_dri.so`, exit 134) — the environment, not the game.
   - Corrective task: **RZ-033** (`tools/demo.sh` now defaults to Mesa software
     rendering on WSL; `RZ_GL=hardware` opts out). Verified with a full
     mouse-driven session (title → loadout → combat → victory → result → next
     encounter → clean exit, `demo-exit=0`).
   - Note: before the fix, *no* playtest longer than ~20 s was possible, so this
     was a hard blocker for this review.
2. Verbatim: *"by the way nice backgroun image like it :)"*
   - Meaning: the procedural placeholder landing key art (RZ-032) reads as the
     right direction for the title screen. Real generated art remains gated behind
     this review per `docs/ART_BIBLE.md` / ROADMAP phases.
3. Minor observation from the same session (by the agent): the title subtitle
   still said *"saves and polish arrive in RZ-009/010"* — those tickets are done,
   so the line was stale. Fixed immediately in the RZ-033 commit (now reads
   "prototype build (RZ-012 playtest)"); no test depended on the old text.

## Still to collect (the actual RZ-012 playtest pass)

Per the checklist in `docs/DEMO.md`: combat feel, pacing, readability, view/art,
scope; plus persistence checks (mute/reduced motion/last equipment after relaunch).
Record the owner's answers here, then create corrective tasks and decide whether
`docs/DECISIONS.md` needs revisions before the art/audio phases unlock.

## Feedback round 2 (2026-09-21, evening, after the RZ-033 fix)

4. Verbatim: *"i the spec is there any mention about the gaming experiance we seek ?
   I want to build a mmorpg like obsidient knight on playstore, the character is an
   engeneer that goes from company to company and win chalenges. I see cubes and
   buttons, where is my expected gaming experience"*
   - Reference located: "Obsidian Knight — RPG Games" (ActFirst Games, 1M+ installs;
     Play Store tags: idle RPG, roguelike, single-player, stylized, offline; ads +
     in-app purchases; reviews describe platform/idle/turn-based mixing, heavy gear
     and stat progression).
   - Experience gap acknowledged: the current build is the deliberate engine-first
     slice (placeholder shapes per docs/GAME_DESIGN.md "Use simple shapes/placeholders
     initially"). The rich experience targets are exactly the unresolved decisions
     this review gates: D-009 (combat model, movement, campaign size, narrative,
     final art style) and D-011 (multiplayer/store release, deferred).
   - Theme alignment: the stated hero vision (engineer going company to company
     winning challenges) already matches the provisional D-006 theme and the content
     (Operator vs Memory Leak / Intrusion / Load Spike / Server Cathedral).
   - Actions: structured direction questions asked via the review session; answers
     recorded below as they arrive, then DECISIONS.md and corrective tickets updated.

## Feedback round 3-4 (2026-09-21 night) — map & war direction, implemented

5. Verbatim: *"in the map once you select a spot you start the war as in pictures /
   I want same experiance we are in map, we have mini map, and once we select a spot
   we start the war of IT engineer"* — with owner-supplied Obsidian Knight combat
   screenshots (fighters on a battlefield with HP bars, mission banner, action dock).
   Earlier reference screenshots (region stages "Grimwood/Ashenfall" with stone
   routes, HUD chips, dock buttons) drove the region-map redesign.
   - Implemented (RZ-034/RZ-035): battlefield war staging (Operator left, hostiles
     right, green/red HP pills, intent, mission banner, centered Attack/Guard/Skill
     dock, combat log panel); region work map with stone route, HUD chips, dock
     buttons and a **mini map**; tapping the TICKET stone walks the engineer there
     and starts the war immediately (no confirm dialog — the CONTRACTS dock button
     still opens the ticket text).
   - Evidence: `validation/evidence/034/` (battlefield captures, generator log),
     `validation/evidence/035/` (map captures with mini map, suite logs).
   - Direction recorded as D-012 in docs/DECISIONS.md (owner-directed; refines
     D-009 movement = point-to-point, not open world).
