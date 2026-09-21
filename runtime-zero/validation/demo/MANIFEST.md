# Demo capture manifest

Milestone captures for reviewers without laptop access. The manifest is honest
about scope: it states exactly what was playable when the captures were taken.

## 2026-09-21 — combat scene milestone (updated after the owner-feedback fix)

- **Implementation commit:** `49f47f0c5dae61f6212456adc537c3fa9e37064f` (`49f47f0`)
  on `codex/runtime-zero-impl` — the interaction fix (clickable Start button,
  placeholder chips, crash guidance) that produced this capture set. The combat
  scene itself landed in `5c7ff40` (RZ-007); the demo runner in `e70c200` (RZ-031).
- **Captured with:** `tools/demo.sh` via WSLg; Godot 4.7.2.stable.official.ed1daf0bf.
- **Playable at this point:** title screen with a visible **Start - enter combat**
  button (ENTER/Space/click anywhere also works) → single combat encounter
  (`encounter_1` "Intrusion", one Memory Leak); hero/enemy placeholder character
  chips; Attack/Guard/Skill with costs and disabled reasons; target selection;
  enemy intent; ordered combat log; win/lose/round-cap with Retry and Title;
  keyboard (1/2/3, Tab/Enter), mouse and touch; reduced-motion toggle.
  **Not playable yet:** loadout/equipment choice, encounter progression,
  rewards, saves, audio, Android.

| File | Scene / moment | sha256 |
|---|---|---|
| `20260921-title.png` | title screen with the Start button | `0d608d67638ce70b4cf449be1ff06a473149cc24a15541184781e866064e8639` |
| `20260921-combat-from-title.png` | combat reached from the title by a real injected ENTER press (auto-enter verification run) | `5f9452ceb2e910dd8581c5c7cc0d7d3dcf04fbb83e7aa05f1b6fdc99aee9b661` |
| `20260921-combat/combat-1-attack.png` | combat, right after an Attack (enemy 11 damage) | `e52207b8d68c5cb17f5cff5adca77d7f1c533de01b21642156f080f9a5333ffb` |
| `20260921-combat/combat-2-guard.png` | combat, after Guard (halved enemy hit) | `03072077e47ce5e670492972778b72bf1ed9c792545fa6b2276c555ca621fb6a` |
| `20260921-combat/combat-3-skill.png` | combat, after Skill (23 damage, 3 energy) | `daa5cab443c32cd387e9b2294a4650a2aeb1bc3869f5a655255d3cdeef42cab1` |

Deterministic artifact of the smoke run: `round=4 hero_hp=85/100 energy=4/6`,
`state_hash=8fcedb79cde93626392a0eb56b4271727418d8f7c82685b2deb4964b41516db9`.
The title capture is byte-identical when replayed from a minimal fresh shell
(`env -i HOME=… PATH=/usr/bin:/bin DISPLAY=:0`), verified 2026-09-21. Combat
frames are cosmetic snapshots (animation timing shifts floater pixels) — the
state hash is the durable artifact.

## Recording a new milestone

1. `tools/demo.sh capture validation/demo/<date>-<name>.png [title|combat]`
2. `tools/demo.sh smoke validation/demo/<date>-<name>-combat`
3. Add a section here: commit hash, what is playable, file hashes, state hash.
4. Commit captures and manifest together with the implementing changes.

Tip: `godot --path game -- --auto-enter <frames> --capture <png>` captures the
scene reached after a real injected ENTER press (used for the
`combat-from-title` row above).
