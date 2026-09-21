# Demo capture manifest

Milestone captures for reviewers without laptop access. The manifest is honest
about scope: it states exactly what was playable when the captures were taken.

## 2026-09-21 — combat scene milestone

- **Implementation commit:** `e70c2009f1df1cfc054e88f15dd7febf52944b13` (`e70c200`)
  on `codex/runtime-zero-impl` — the commit that added the demo runner and these
  captures (RZ-031). The UI itself landed in `5c7ff40` (RZ-007).
- **Captured with:** `tools/demo.sh` via WSLg; Godot 4.7.2.stable.official.ed1daf0bf.
- **Playable at this point:** title screen → single combat encounter
  (`encounter_1` "Intrusion", one Memory Leak); Attack/Guard/Skill with costs and
  disabled reasons; target selection; enemy intent; ordered combat log;
  win/lose/round-cap with Retry and Title; keyboard (1/2/3, Tab/Enter), mouse
  and touch; reduced-motion toggle. **Not playable yet:** loadout/equipment
  choice, encounter progression, rewards, saves, audio, Android.

| File | Scene / moment | sha256 |
|---|---|---|
| `20260921-title.png` | title screen, before starting combat | `fb5055c904d068d145f607bec7186702919fd985c5404de8283af4e110fe162f` |
| `20260921-combat/combat-1-attack.png` | combat, right after an Attack (enemy 11 damage) | `f29bf47d5c0795d1727db79c589beddc101f38277c4bdcf268ad5c6b7f176d89` |
| `20260921-combat/combat-2-guard.png` | combat, after Guard (halved enemy hit) | `192d94679a0a5d58871b9944a45031550b5e54054178c1ce3569fd16d3951554` |
| `20260921-combat/combat-3-skill.png` | combat, after Skill (23 damage, 3 energy) | `a4d196ac125085e313dcefc1998c20737537ea7f1054b8bc1e3d1b0b72421b86` |

Deterministic artifact of the smoke run: `round=4 hero_hp=85/100 energy=4/6`,
`state_hash=8fcedb79cde93626392a0eb56b4271727418d8f7c82685b2deb4964b41516db9`.
The title capture is byte-identical when replayed from a minimal fresh shell
(`env -i HOME=… PATH=/usr/bin:/bin DISPLAY=:0`), verified 2026-09-21.

## Recording a new milestone

1. `tools/demo.sh capture validation/demo/<date>-<name>.png [title|combat]`
2. `tools/demo.sh smoke validation/demo/<date>-<name>-combat`
3. Add a section here: commit hash, what is playable, file hashes, state hash.
4. Commit captures and manifest together with the implementing changes.
