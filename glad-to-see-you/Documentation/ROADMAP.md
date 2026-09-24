# ROADMAP.md — from bootstrap to the first polished playable

> **Current milestone:** *One visually polished playable arena with one animated character and one enemy.*
> Everything below serves that sentence. Out-of-scope items live in `GAME_VISION.md`.

## Milestone 1 — "It exists and runs" (done by this bootstrap + first editor session)

- [x] Repo structure, docs, scripts, MCP wiring, tests scaffold, deterministic slice factory
- [ ] Editor opens the project, packages resolve, **compiles with zero errors** (USER: open editor)
- [ ] `Bootstrap ▸ 1. Setup Project` + `2. Build Vertical Slice Scene` produce a playable arena scene
- [ ] EditMode + PlayMode tests green
- [ ] Console clean in play mode
- [ ] MCP for Unity connected (editor package + wizard) — take a screenshot of a verified tool call

## Milestone 2 — "It feels good" (game feel pass, no final art)

- [ ] Combat timing pass: attack wind-ups/recoveries in `WeaponData`, hit-stop 60–90 ms on hit, camera impulse per weight class
- [ ] Dodge: distance, i-frame window, cancel rules — tuned against the enemy's attack telegraph
- [ ] Enemy read: lock-on framing, attack telegraph color/flash, stun reaction to heavy hits
- [ ] Add directional hit reactions (4-way) once `AnimatorAnimationDriver` is in use
- [ ] Sound pass: replace procedural placeholders with first real SFX set (hit, whoosh, step, death)
- [ ] A 60-second "hero loop" recording captured as the official slice demo (screenshots for the repo)

## Milestone 3 — "It looks premium" (vertical-slice art sprint)

- [ ] Hero: Meshy draft → Blender cleanup → LODs → Unity import → swap placeholder visuals
- [ ] Enemy: same pipeline (single archetype)
- [ ] Arena: stone kit (Fab/Megascans) + hero props; baked lighting pass; fog/atmosphere tuned to ART_DIRECTION
- [ ] VFX pass: hit sparks per weight, dodge dust, death embers — color contract enforced
- [ ] Post-processing pass inside PERFORMANCE_BUDGET limits
- [ ] Real animation set imported + retargeted (locomotion, attacks, dodge, hit, death)

## Milestone 4 — "It ships to a phone"

- [ ] Android dev build signed + installed; 60 fps on target device / 30 fps floor validated
- [ ] Perf matrix recorded for Low/Balanced/High (device + numbers in a report)
- [ ] Touch controls usability test on a real device (thumb reach, sensitivity defaults)
- [ ] Crash-free 20-minute session

## Working agreements for every task

- One task = one small diff = one verification story (tests/screenshots/profile note).
- Anything that changes conventions updates `Documentation/` in the same commit.
- Use the MCP toolchain where it saves real time (editor state, Blender ops) — with the security rules.

## Later (parked, do not start)

Tower defense wave mode — no. New arenas — after Milestone 4. Second enemy archetype — after Milestone 4.
Everything else — see `GAME_VISION.md` "DO NOT BUILD YET".
