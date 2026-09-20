# Data contracts to implement

Implement validators in RZ-006 and asset validation in RZ-016. The examples define intended contracts, not existing assets. Reject unknown IDs, missing required fields, invalid types, nonfinite numbers, duplicate IDs and schema versions you cannot migrate.

## Content

```json
{
  "schema_version": 1,
  "id": "memory_leak",
  "display_name": "Memory Leak",
  "stats": {"max_hp": 35, "attack": 9, "defense": 1},
  "behavior_id": "basic_attack",
  "presentation_id": "placeholder_enemy"
}
```

Enemy stat fields are bounded integers; max_hp > 0, attack/defense >= 0. Behaviors reference an allowlisted implementation. Presentation IDs can resolve to placeholders during prototype development.

Encounter data: `schema_version`, `id`, `title`, `enemy_groups` (actor IDs, enemy IDs and counts), `reward_id`, `next_encounter_id` (nullable), `rules_version`. Validate no negative counts, unreachable campaign nodes or missing references. Build data: `id`, `equipment_ids`, `policy_id` for benchmarks, `expected_role`; reject incompatible equipment combinations.

## Combat and replay

Command: `{schema_version, turn_index, actor_id, action_id, target_id}`. Event: `{sequence, turn_index, type, actor_id, target_id, payload}`. Assign monotonically increasing event sequence numbers. Replay: `{schema_version, engine_version, rules_version, content_hash, rng_algorithm, initial_seed, initial_state, commands, final_state_hash}`. Canonical hashing must define sorted object keys and stable integer serialization. Wall time is metadata, not simulation input.

## Saves

Save envelope: `{schema_version, game_version, saved_at, payload, checksum}`. Payload includes settings, campaign unlocks and selected loadout; resumable combat is a later explicit capability. Verify checksum, validate fields, migrate supported older schemas, and recover to a usable title screen on corrupt data. A checksum detects corruption, not cheating. Never block offline play on a server. Keep secrets out of saves.

## Asset provenance

For each candidate/approved asset record: `asset_id`, `kind`, `status` (candidate/approved/rejected), `relative_path`, `sha256`, `model_id`, `model_revision`, `model_sha256`, `model_license_ref`, `workflow_id`, `workflow_sha256`, `prompt`, `negative_prompt`, `seed`, `reference_asset_ids`, `dimensions_or_audio_format`, `postprocess_steps`, `tool_versions`, `created_at`, `reviewer`, `review_notes`.

Record both code license and model-weight/license source. No blanket commercial-use assertion follows from an MIT code repository. Keep actual reviewed license snapshots/references and any accepted terms. Reject promotion with missing rights provenance. A filename, prompt seed or model name alone is insufficient reproducibility.

## Job result

`{job_id, request_id, status, progress, artifacts, warnings, error, started_at, finished_at}`. Status: queued/running/succeeded/failed/cancelled. Artifacts contain validated relative paths, media type and SHA-256. Error contains stable code, message, retryable boolean and sanitized backend detail. Do not return success before output exists and validates. Cancellation and timeouts must release project-owned locks and preserve diagnostic evidence.
