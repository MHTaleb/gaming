# Demo capture manifest

Milestone captures for reviewers without laptop access. The manifest is honest
about scope: it states exactly what was playable when the captures were taken.

## 2026-09-21 — campaign milestone (loadout + three encounters)

- **Implementation commit:** `a00c38142d07d89515fe14167f7aa4c8fdaabf8c` (`a00c381`)
  on `codex/runtime-zero-impl` — the campaign loop (RZ-008) and capture refresh.
  Title art + quit affordances landed in `df34b2e` (RZ-032).
- **Captured with:** `tools/demo.sh` via WSLg; Godot 4.7.2.stable.official.ed1daf0bf.
- **Playable at this point:** title (procedural key art, Start, Quit) →
  **equipment loadout** (three choices, effects explained) → **encounter 1**
  ("Intrusion") → reward result → **encounter 2** ("Load Spike", two enemies) →
  reward result → **encounter 3** ("Server Cathedral" boss) → **RUN COMPLETE**
  with play-again; retry/title flows; rewards granted once per run; hero healed
  between fights. **Not playable yet:** saves/persistence (RZ-009), polish and
  placeholder sound (RZ-010), replay fixtures/CI (RZ-011), real generated art
  and music (gated phases), Android build.

| File | Scene / moment | sha256 |
|---|---|---|
| `20260921-title.png` | title screen with key art, Start and Quit | `32e91f78beddbc49add704345d3d86ac56c057bda89d48ea28f083e769dba236` |
| `20260921-loadout.png` | equipment loadout (reachable via ENTER from the title; auto-enter run) | `fed746e8c2b8ac1adc1a1bb8139927a380fc8f158ab2bba56ddf43e3ed76d942` |
| `20260921-combat-in-campaign.png` | combat in the live campaign (guard plating applied, 125 HP) reached through title → loadout → begin | `5fe259cf621da3b2656ae40f3e688d2f96416ba127e2c92e6698e4354d6a93d4` |
| `20260921-combat/combat-1-attack.png` | standalone combat smoke, right after an Attack | `efcecb832b57743ac0bd4d36d69102d9bf4c6bcc3be2ab06569790a24cbedd87` |
| `20260921-combat/combat-2-guard.png` | standalone combat smoke, after Guard | `8440052a8e1579892d5eabb44a729ecbaff43c3c72ea12a99ce770af3df10726` |
| `20260921-combat/combat-3-skill.png` | standalone combat smoke, after Skill | `b986e09feede8521c3069dacb49afc9a00795c306c62211f1e03039069dd9315` |

Deterministic artifact of the smoke run: `round=4 hero_hp=85/100 energy=4/6`,
`state_hash=8fcedb79cde93626392a0eb56b4271727418d8f7c82685b2deb4964b41516db9`
(unchanged across milestones). The title capture is byte-identical when replayed
from a minimal fresh shell; combat frames are cosmetic snapshots (animation
timing shifts floater pixels) — the state hash is the durable artifact.

History note: the earlier `20260921-combat-from-title.png` capture was superseded
when the title flow moved through the loadout screen (RZ-008); it is now the
`combat-in-campaign` row above (reached through the real interaction hooks:
`--auto-enter` on the title, `--auto-begin` on the loadout).

## Recording a new milestone

1. `tools/demo.sh capture validation/demo/<date>-<name>.png [title|combat]`
2. `tools/demo.sh run -- --auto-enter 60 --capture …loadout.png`
3. `tools/demo.sh run -- --auto-enter 60 --auto-begin <equipment> --capture …combat-in-campaign.png`
4. `tools/demo.sh smoke validation/demo/<date>-<name>-combat`
5. Add a section here: commit hash, what is playable, file hashes, state hash.
6. Commit captures and manifest together with the implementing changes.
