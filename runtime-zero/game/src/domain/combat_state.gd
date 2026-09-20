class_name RZCombatState
extends RefCounted
## Full combat state. Pure data: no scene lookups, timers, audio or file access.

enum Outcome { ONGOING, VICTORY, DEFEAT, STALLED }

var rules_version: int = RZRules.RULES_VERSION
## One accepted command resolves one round; commands must carry the current value.
var turn_index: int = 1
## Hero first, then enemies as loaded. Resolution order uses sorted IDs, not this order.
var actors: Array[RZActorState] = []
var outcome: int = Outcome.ONGOING
## Reserved explicit randomness stream; v1 rules consume none (see rules.gd).
var rng_state: int = 1
## Log counter for event sequencing (rejections never consume a sequence number).
var next_sequence: int = 1
## A still-ongoing combat ends explicitly as STALLED at this round count, never a win.
var max_rounds: int = RZRules.ROUND_CAP

func actor_by_id(actor_id: String) -> RZActorState:
	for actor in actors:
		if actor.id == actor_id:
			return actor
	return null

func hero() -> RZActorState:
	for actor in actors:
		if actor.kind == RZRules.KIND_HERO:
			return actor
	return null

## Living enemies in stable actor-ID order (the only enemy resolution order).
func sorted_living_enemies() -> Array[RZActorState]:
	var living: Array[RZActorState] = []
	for actor in actors:
		if actor.kind != RZRules.KIND_HERO and actor.alive():
			living.append(actor)
	living.sort_custom(func(a: RZActorState, b: RZActorState) -> bool: return a.id < b.id)
	return living

func terminal() -> bool:
	return outcome != Outcome.ONGOING

func duplicate_state() -> RZCombatState:
	var copy := RZCombatState.new()
	copy.rules_version = rules_version
	copy.turn_index = turn_index
	copy.outcome = outcome
	copy.rng_state = rng_state
	copy.next_sequence = next_sequence
	copy.max_rounds = max_rounds
	for actor in actors:
		copy.actors.append(actor.duplicate_state())
	return copy

func to_dict() -> Dictionary:
	var actor_dicts: Array = []
	for actor in actors:
		actor_dicts.append(actor.to_dict())
	return {
		"rules_version": rules_version,
		"turn_index": turn_index,
		"outcome": outcome,
		"rng_state": rng_state,
		"next_sequence": next_sequence,
		"max_rounds": max_rounds,
		"actors": actor_dicts,
	}

## Stable digest for determinism checks inside one engine build.
## Canonical cross-version replay hashing is RZ-011's job (DATA_CONTRACTS replay).
func state_hash() -> String:
	return JSON.stringify(to_dict()).sha256_text()
