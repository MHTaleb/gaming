class_name RZCombatResolver
extends RefCounted
## Pure combat resolution (RZ-005).
##
## resolve(state, command) -> {accepted, reason, state, events}
##   - Never mutates the given state; returns a new state on acceptance and the
##     original state on rejection.
##   - Rejections consume nothing: no turn advance, no resource use, no RNG draw,
##     no sequence number. The reason string is the feedback channel (RZ-007).
##   - Accepted command resolves hero action -> living enemies in stable actor-ID
##     order -> round end. Terminal state is evaluated after every action.

const REASON_UNKNOWN_ACTION := "unknown_action"
const REASON_STALE_TURN := "stale_turn"
const REASON_ACTOR_MISSING := "actor_missing"
const REASON_ACTOR_DEAD := "actor_dead"
const REASON_NOT_HERO := "not_hero"
const REASON_TARGET_MISSING := "target_missing"
const REASON_TARGET_DEAD := "target_dead"
const REASON_INSUFFICIENT_ENERGY := "insufficient_energy"
const REASON_TERMINAL := "combat_over"

## Guard contract (rules v2, RV-001 V-001): Guard halves only the NEXT incoming hit
## (integer floor, minimum 1) and that hit consumes it; an unused Guard expires when
## the hero's next turn begins. Guard never stacks. docs/GAME_DESIGN.md states this
## contract and validation/guard_contract.gd pins it independently.
static func resolve(state: RZCombatState, command: RZCombatCommand) -> Dictionary:
	if state.terminal():
		return _reject(state, REASON_TERMINAL)
	if command.turn_index != state.turn_index:
		return _reject(state, REASON_STALE_TURN)
	if not RZRules.ACTION_IDS.has(command.action_id):
		return _reject(state, REASON_UNKNOWN_ACTION)
	var hero := state.actor_by_id(command.actor_id)
	if hero == null:
		return _reject(state, REASON_ACTOR_MISSING)
	if not hero.alive():
		return _reject(state, REASON_ACTOR_DEAD)
	if hero.kind != RZRules.KIND_HERO:
		return _reject(state, REASON_NOT_HERO)
	if command.action_id == RZRules.ACTION_SKILL and hero.energy < RZRules.SKILL_ENERGY_COST:
		return _reject(state, REASON_INSUFFICIENT_ENERGY)

	var target: RZActorState = null
	if command.action_id != RZRules.ACTION_GUARD:
		target = state.actor_by_id(command.target_id)
		if target == null:
			return _reject(state, REASON_TARGET_MISSING)
		if not target.alive():
			return _reject(state, REASON_TARGET_DEAD)
		if target.kind == RZRules.KIND_HERO:
			return _reject(state, REASON_TARGET_MISSING)

	var working := state.duplicate_state()
	var events: Array[RZCombatEvent] = []
	var w_hero := working.actor_by_id(command.actor_id)

	# The hero's next turn begins: a guard from the previous round expires now.
	if w_hero.guard_active:
		w_hero.guard_active = false
		_emit(working, events, "guard_expired", w_hero.id, "")

	match command.action_id:
		RZRules.ACTION_ATTACK:
			_hero_strike(working, events, w_hero, working.actor_by_id(target.id), 1)
		RZRules.ACTION_SKILL:
			w_hero.energy -= RZRules.SKILL_ENERGY_COST
			w_hero.clamp_resources()
			_emit(working, events, "skill_used", w_hero.id, target.id,
				{"energy_cost": RZRules.SKILL_ENERGY_COST, "energy_remaining": w_hero.energy})
			_hero_strike(working, events, w_hero, working.actor_by_id(target.id),
				RZRules.SKILL_ATTACK_MULTIPLIER)
		RZRules.ACTION_GUARD:
			w_hero.guard_active = true
			_emit(working, events, "guard_started", w_hero.id, "")

	if working.sorted_living_enemies().is_empty():
		working.outcome = RZCombatState.Outcome.VICTORY
		_emit(working, events, "victory", w_hero.id, "")
		return _accept(working, events)

	# Enemy phase: living enemies act in stable actor-ID order; the dead do not act.
	for enemy in working.sorted_living_enemies():
		if not w_hero.alive():
			break
		_enemy_turn(working, events, enemy, w_hero)

	if not w_hero.alive():
		working.outcome = RZCombatState.Outcome.DEFEAT
		_emit(working, events, "defeat", w_hero.id, "")
		return _accept(working, events)

	# Round end: +1 hero energy up to the cap (actual amount recorded).
	var added := mini(RZRules.ENERGY_REGEN_PER_ROUND, w_hero.energy_cap - w_hero.energy)
	if added > 0:
		w_hero.energy += added
	_emit(working, events, "energy_regenerated", w_hero.id, "",
		{"added": added, "energy": w_hero.energy})

	working.turn_index += 1
	if working.turn_index > working.max_rounds:
		# A stalled combat ends explicitly and is never a win (GAME_DESIGN).
		working.outcome = RZCombatState.Outcome.STALLED
		_emit(working, events, "stalled", w_hero.id, "", {"round_cap": working.max_rounds})
	return _accept(working, events)

static func _hero_strike(working: RZCombatState, events: Array[RZCombatEvent],
		hero: RZActorState, target: RZActorState, attack_multiplier: int) -> void:
	var raw := hero.attack * attack_multiplier
	var damage := RZRules.mitigate(raw, target.defense)
	target.hp -= damage
	target.clamp_resources()
	_emit(working, events, "damage", hero.id, target.id,
		{"amount": damage, "hp_after": target.hp, "kind": "attack" if attack_multiplier == 1 else "skill"})
	if not target.alive():
		_emit(working, events, "defeated", hero.id, target.id)

static func _enemy_turn(working: RZCombatState, events: Array[RZCombatEvent],
		enemy: RZActorState, hero: RZActorState) -> void:
	var raw := enemy.attack
	var kind := "attack"
	if enemy.kind == RZRules.KIND_BOSS:
		if enemy.telegraph_pending:
			enemy.telegraph_pending = false
			raw = enemy.attack * RZRules.GUARD_HEAVY_MULTIPLIER
			kind = "heavy"
		else:
			enemy.normal_attacks_since_heavy += 1
			if enemy.normal_attacks_since_heavy >= RZRules.BOSS_NORMALS_PER_TELEGRAPH:
				enemy.telegraph_pending = true
				enemy.normal_attacks_since_heavy = 0
				_emit(working, events, "boss_telegraph", enemy.id, hero.id,
					{"attack_multiplier": RZRules.GUARD_HEAVY_MULTIPLIER,
					 "for_turn": working.turn_index + 1})
	var damage := RZRules.mitigate(raw, hero.defense)
	if hero.guard_active:
		var before := damage
		damage = RZRules.halve_with_floor(damage)
		hero.guard_active = false  # single-use: the first incoming hit consumes the guard (RV-001)
		_emit(working, events, "guard_halved", enemy.id, hero.id,
			{"before": before, "after": damage, "consumed": true})
	hero.hp -= damage
	hero.clamp_resources()
	_emit(working, events, "damage", enemy.id, hero.id,
		{"amount": damage, "hp_after": hero.hp, "kind": kind})

static func _emit(working: RZCombatState, events: Array[RZCombatEvent], type: String,
		actor_id: String, target_id: String, payload: Dictionary = {}) -> void:
	var event := RZCombatEvent.make(working.next_sequence, working.turn_index, type,
		actor_id, target_id, payload)
	working.next_sequence += 1
	events.append(event)

static func _accept(state: RZCombatState, events: Array[RZCombatEvent]) -> Dictionary:
	return {"accepted": true, "reason": "", "state": state, "events": events}

static func _reject(state: RZCombatState, reason: String) -> Dictionary:
	return {"accepted": false, "reason": reason, "state": state, "events": []}
