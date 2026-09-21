class_name RZCombatText
extends RefCounted
## Player-facing text for the combat UI (RZ-007): pure formatting, no scene or
## node access, so every string is testable headless.
##
## The boss intent mirrors RZCombatResolver._enemy_turn using RZRules constants:
## a telegraphed heavy fires on the next boss turn, otherwise the boss attacks
## normally and arms the telegraph once BOSS_NORMALS_PER_TELEGRAPH normals have
## run. If the boss cycle changes, both sides change together (rules bump).

static func action_label(action_id: String) -> String:
	match action_id:
		RZRules.ACTION_ATTACK:
			return "Attack"
		RZRules.ACTION_GUARD:
			return "Guard"
		RZRules.ACTION_SKILL:
			return "Skill (-%d energy)" % RZRules.SKILL_ENERGY_COST
	return action_id

static func action_summary(action_id: String) -> String:
	match action_id:
		RZRules.ACTION_ATTACK:
			return "Deal max(1, attack - defense) damage to the chosen enemy."
		RZRules.ACTION_GUARD:
			return "Halve the next incoming hit (single use; expires if unused at your next turn)."
		RZRules.ACTION_SKILL:
			return "Deal max(1, 2 x attack - defense) damage for %d energy." % RZRules.SKILL_ENERGY_COST
	return ""

## Maps every resolver reason to player text. Known reasons never fall through
## to the "Unknown" line (presentation tests pin the whole set).
static func reason_text(reason: String) -> String:
	match reason:
		RZCombatResolver.REASON_UNKNOWN_ACTION:
			return "That action does not exist."
		RZCombatResolver.REASON_STALE_TURN:
			return "That turn is already resolved - extra input ignored."
		RZCombatResolver.REASON_ACTOR_MISSING, RZCombatResolver.REASON_ACTOR_DEAD:
			return "The hero cannot act."
		RZCombatResolver.REASON_NOT_HERO:
			return "Only the hero can act."
		RZCombatResolver.REASON_TARGET_MISSING, RZCombatResolver.REASON_TARGET_DEAD:
			return "Choose a living enemy."
		RZCombatResolver.REASON_INSUFFICIENT_ENERGY:
			return "Not enough energy (Skill costs %d)." % RZRules.SKILL_ENERGY_COST
		RZCombatResolver.REASON_TERMINAL:
			return "The combat is over - retry or return to title."
	return "Unknown reason: %s" % reason

## Next-turn intent for one enemy (docs/GAME_DESIGN.md: "Expose intent before
## the player's next action").
static func intent_text(enemy: RZActorState) -> String:
	if enemy.kind != RZRules.KIND_BOSS:
		return "Attack"
	if enemy.telegraph_pending:
		return "Heavy attack incoming (x%d)" % RZRules.GUARD_HEAVY_MULTIPLIER
	if enemy.normal_attacks_since_heavy + 1 >= RZRules.BOSS_NORMALS_PER_TELEGRAPH:
		return "Attack - heavy telegraphed after this one"
	return "Attack"

static func hp_text(actor: RZActorState) -> String:
	return "%d / %d" % [actor.hp, actor.max_hp]

static func energy_text(actor: RZActorState) -> String:
	return "%d / %d" % [actor.energy, actor.energy_cap]

## Disabled-skill explanation ("" while the skill is usable).
static func skill_disabled_reason(actor: RZActorState) -> String:
	if actor == null or actor.energy >= RZRules.SKILL_ENERGY_COST:
		return ""
	return "Needs %d energy (have %d)." % [RZRules.SKILL_ENERGY_COST, actor.energy]

static func guard_state_text(actor: RZActorState) -> String:
	if actor != null and actor.guard_active:
		return "Guard active: the next incoming hit is halved (single use)."
	return ""

static func outcome_title(outcome: int) -> String:
	match outcome:
		RZCombatState.Outcome.VICTORY:
			return "VICTORY"
		RZCombatState.Outcome.DEFEAT:
			return "DEFEAT"
		RZCombatState.Outcome.STALLED:
			return "STALLED"
	return ""

static func outcome_detail(outcome: int) -> String:
	match outcome:
		RZCombatState.Outcome.VICTORY:
			return "All enemies defeated. Retry, or return to the title (encounter progression is RZ-008)."
		RZCombatState.Outcome.DEFEAT:
			return "The hero has fallen. Retry, or return to the title."
		RZCombatState.Outcome.STALLED:
			return "Round cap reached - this fight is not a win. Retry, or return to the title."
	return ""

## One line per domain event for the combat log.
static func event_line(event: RZCombatEvent, names: Dictionary) -> String:
	var actor := name_of(names, event.actor_id)
	var target := name_of(names, event.target_id)
	match event.type:
		"damage":
			var amount := int(event.payload.get("amount", 0))
			var hp_after := int(event.payload.get("hp_after", 0))
			if str(event.payload.get("kind", "")) == "heavy":
				return "Heavy attack! %s hits %s for %d damage (%d HP left)" % [actor, target, amount, hp_after]
			return "%s hits %s for %d damage (%d HP left)" % [actor, target, amount, hp_after]
		"guard_halved":
			return "Guard absorbs part of the hit: %d -> %d damage" % [int(event.payload.get("before", 0)), int(event.payload.get("after", 0))]
		"guard_started":
			return "%s raises a guard (halves the next incoming hit)" % actor
		"guard_expired":
			return "%s's guard expired unused" % actor
		"skill_used":
			return "Skill: %s spends %d energy (%d left)" % [actor, int(event.payload.get("energy_cost", 0)), int(event.payload.get("energy_remaining", 0))]
		"defeated":
			return "%s is defeated" % target
		"boss_telegraph":
			return "%s telegraphs a heavy attack: double damage next turn" % actor
		"energy_regenerated":
			return "Round end: +%d energy (%d total)" % [int(event.payload.get("added", 0)), int(event.payload.get("energy", 0))]
		"victory":
			return "VICTORY - all enemies defeated"
		"defeat":
			return "DEFEAT - the hero has fallen"
		"stalled":
			return "STALLED - round cap %d reached (not a win)" % int(event.payload.get("round_cap", 0))
	return "event: %s" % event.type

static func name_of(names: Dictionary, actor_id: String) -> String:
	if actor_id.is_empty():
		return "someone"
	return str(names.get(actor_id, actor_id))
