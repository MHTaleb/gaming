class_name RZRules
extends RefCounted
## Versioned combat rules contract (prototype v1).
##
## Values mirror the provisional fixtures in docs/GAME_DESIGN.md. Changing a value
## or a resolution rule means bumping RULES_VERSION: replays pin it (DATA_CONTRACTS).
## v1 resolution is fully integer-based and deterministic. No v1 rule consumes
## randomness; rng_state exists so approved later mechanics (RZ-013, crit/DoT/speed)
## can use an explicit, engine-independent stream instead of implicit engine RNG.

const SCHEMA_VERSION := 1
const RULES_VERSION := 1

## One valid command resolves the hero action, the enemy phase and round end.
const ROUND_CAP := 50

const ACTION_ATTACK := "attack"
const ACTION_GUARD := "guard"
const ACTION_SKILL := "skill"
const ACTION_IDS := [ACTION_ATTACK, ACTION_GUARD, ACTION_SKILL]

const SKILL_ENERGY_COST := 3
const SKILL_ATTACK_MULTIPLIER := 2
const GUARD_HEAVY_MULTIPLIER := 2
const ENERGY_REGEN_PER_ROUND := 1
const BOSS_NORMALS_PER_TELEGRAPH := 3

const KIND_HERO := "hero"
const KIND_ENEMY := "enemy"
const KIND_BOSS := "boss"

## Minimum damage after mitigation: guard floor and armor cannot zero out a hit.
static func mitigate(attack_value: int, defense_value: int) -> int:
	return maxi(1, attack_value - defense_value)

## Guard halves damage with integer floor and minimum 1.
static func halve_with_floor(damage: int) -> int:
	return maxi(1, int(floor(float(damage) / 2.0)))
