# Runtime Zero content packs

Versioned JSON data for the prototype slice, validated by
`game/src/infrastructure/content_repository.gd` before any run starts. Numbers here are the
provisional fixtures from `docs/GAME_DESIGN.md`; they are starting tuning values, not proven
balance.

## Files

| File | Shape | Notes |
|---|---|---|
| `enemies.json` | `{schema_version, enemies: [...]}` | Each enemy: `schema_version`, `id`, `display_name`, `stats {max_hp, attack, defense}`, `behavior_id`, `presentation_id` (DATA_CONTRACTS). Bounded integers: `max_hp >= 1`, `attack`/`defense >= 0`. |
| `encounters.json` | `{schema_version, encounters: [...]}` | Each encounter: `schema_version`, `id`, `title`, `enemy_groups` (`enemy_id`, `count >= 1`, `actor_ids` matching the count and unique), `reward_id` (completion marker), `next_encounter_id` (string or null), `rules_version` pinned to the combat core's version. |
| `equipment.json` | `{schema_version, equipment: [...]}` | Each item: `schema_version`, `id`, `display_name`, `description`, `effect {stat, amount}` with allowlisted stats and `1 <= amount <= 1000`. Exactly one is chosen per run (loadout UI arrives in RZ-007/RZ-008). |

## Allowlists (the only executable-looking fields are plain keys)

- `behavior_id`: `basic_attack` (normal enemy), `boss_heavy_cycle` (boss telegraph cycle).
  Unknown values — including script paths such as `res://x.gd` — are rejected as unknown
  behavior ids. The repository never loads or evaluates scripts; behavior ids are lookups.
- `effect.stat`: `max_hp`, `attack`, `energy_cap`.

## Validation entry points

- Game code: `RZContentRepository.load_pack()` → `{ok, errors, enemies, encounters, encounters_by_id, equipment}`.
  A pack with any error is not usable (`ok == false`); each error states file, entry and field.
- Tests: `game/tests/content_tests.gd`, including malformed fixtures under
  `game/tests/fixtures/content/`.

```
source tools/env.sh
godot --headless --path game --editor --quit          # refresh imports/class cache
godot --headless --path game --script res://tests/content_tests.gd
```

Validation rejects: missing/duplicate ids, wrong field types, out-of-range stats, unknown
behaviors or stats, unknown enemy references, actor/count mismatches, duplicate actor ids,
broken progression links (missing target, cycles, extra roots, unreachable encounters) and
unsupported `schema_version`/`rules_version`.
