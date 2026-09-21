class_name RZCombatSession
extends RefCounted
## Single-encounter combat session (RZ-007): the application-layer seam between
## the validated content pack, the pure combat core and the presentation.
##
## Build it with RZCombatSession.start("encounter_1"). The presentation reads
## `state` and sends intents through request_action(); it never mutates combat
## state directly (docs/ARCHITECTURE.md: "UI must not directly change HP,
## inventory or RNG").
##
## Scope: exactly one fight plus its retry. The run-level loop (loadout,
## rewards, encounter progression) stays RZ-008's job.
##
## Hero baseline values are the provisional tuning fixtures from
## docs/GAME_DESIGN.md ("Prototype baseline hero"). They live here in one named
## place instead of being scattered through the UI; when equipment/loadout
## content schema work lands (RZ-008) they move into versioned content.

const HERO_ID := "hero"
const HERO_DISPLAY_NAME := "Operator"
const HERO_BASELINE := {
	"max_hp": 100,
	"attack": 12,
	"defense": 3,
	"energy_cap": 6,
	"energy": 6,
}

var state: RZCombatState = null
var encounter: Dictionary = {}
var errors: Array[String] = []

var _encounter_id: String = ""
var _equipment_id: String = ""
var _root: String = RZContentRepository.DEFAULT_ROOT

## Builds a session for one encounter id, optionally with one equipment choice.
## A broken or missing pack fails closed: `errors` carries the repository's
## diagnostics and `state` stays null.
static func start(encounter_id: String, equipment_id: String = "",
		root: String = RZContentRepository.DEFAULT_ROOT) -> RZCombatSession:
	var session := RZCombatSession.new()
	session._encounter_id = encounter_id
	session._equipment_id = equipment_id
	session._root = root
	session.reset()
	return session

## Wraps an already-built state (tests, tools and later the simulator reuse the
## same presentation path without touching content files).
static func from_state(prebuilt: RZCombatState,
		encounter_dict: Dictionary = {}) -> RZCombatSession:
	var session := RZCombatSession.new()
	session.state = prebuilt
	session.encounter = encounter_dict
	return session

## Rebuilds the encounter from content. Also the UI's "Retry" path.
func reset() -> bool:
	errors = []
	state = null
	encounter = {}
	var repository := RZContentRepository.new()
	var pack: Dictionary = repository.load_pack(_root)
	if not pack.get("ok", false):
		errors = pack.get("errors", [])
		return false
	encounter = pack.encounters_by_id.get(_encounter_id, {})
	if encounter.is_empty():
		errors.append("encounter '%s' not found under %s" % [_encounter_id, _root])
		return false
	var equipment_entry: Dictionary = {}
	if not _equipment_id.is_empty():
		equipment_entry = find_by_id(pack.equipment, _equipment_id)
		if equipment_entry.is_empty():
			errors.append("equipment '%s' not found under %s" % [_equipment_id, _root])
			return false
	state = build_state(encounter, pack.enemies, equipment_entry)
	if not errors.is_empty():
		state = null
		return false
	return true

## Builds the actor set for one encounter exactly as the game plays it: hero
## first, then one actor per entry of every group's actor_ids (content
## validation already guarantees counts, uniqueness and enemy references).
static func build_state(encounter_dict: Dictionary, enemies_by_id: Dictionary,
		equipment_entry: Dictionary) -> RZCombatState:
	var built := RZCombatState.new()
	var hero := RZActorState.make(HERO_ID, HERO_DISPLAY_NAME, RZRules.KIND_HERO,
		int(HERO_BASELINE.max_hp), int(HERO_BASELINE.attack),
		int(HERO_BASELINE.defense), int(HERO_BASELINE.energy_cap),
		int(HERO_BASELINE.energy))
	if not equipment_entry.is_empty():
		apply_equipment_effect(hero, equipment_entry)
	hero.clamp_resources()
	built.actors.append(hero)
	for group in encounter_dict.get("enemy_groups", []):
		var enemy_entry: Dictionary = enemies_by_id.get(group.get("enemy_id", ""), {})
		var stats: Dictionary = enemy_entry.get("stats", {})
		var kind := RZContentRepository.behavior_kind(enemy_entry.get("behavior_id", ""))
		for actor_id in group.get("actor_ids", []):
			built.actors.append(RZActorState.make(str(actor_id),
				str(enemy_entry.get("display_name", actor_id)), kind,
				int(stats.get("max_hp", 1)), int(stats.get("attack", 0)),
				int(stats.get("defense", 0))))
	return built

## Applies one validated equipment entry (game/content/equipment.json) to the
## hero. max_hp starts full and energy_cap raises the ceiling; the fixture
## starting energy is unchanged (docs/GAME_DESIGN.md).
static func apply_equipment_effect(actor: RZActorState, equipment_entry: Dictionary) -> void:
	var effect: Variant = equipment_entry.get("effect", {})
	if typeof(effect) != TYPE_DICTIONARY:
		return
	var amount := int(effect.get("amount", 0))
	match str(effect.get("stat", "")):
		"max_hp":
			actor.max_hp += amount
			actor.hp = actor.max_hp
		"attack":
			actor.attack += amount
		"energy_cap":
			actor.energy_cap += amount

static func find_by_id(entries: Array, id: String) -> Dictionary:
	for entry in entries:
		if typeof(entry) == TYPE_DICTIONARY and str(entry.get("id", "")) == id:
			return entry
	return {}

func hero() -> RZActorState:
	if state == null:
		return null
	return state.hero()

## Living enemies in the stable presentation order (sorted actor ids).
func enemies() -> Array[RZActorState]:
	if state == null:
		return []
	return state.sorted_living_enemies()

func terminal() -> bool:
	return state != null and state.terminal()

func encounter_title() -> String:
	return str(encounter.get("title", ""))

func can_use_skill() -> bool:
	var h := hero()
	return h != null and h.energy >= RZRules.SKILL_ENERGY_COST

## The single player-intent entry point: UI buttons, keyboard shortcuts and the
## desktop smoke script all call exactly this. Rejections return the resolver's
## machine reason (the presentation maps it to text) and change nothing.
func request_action(action_id: String, target_id: String = "") -> Dictionary:
	if state == null:
		return {"accepted": false, "reason": RZCombatResolver.REASON_TERMINAL,
			"state": null, "events": []}
	var command := RZCombatCommand.make(state.turn_index, HERO_ID, action_id, target_id)
	var result: Dictionary = RZCombatResolver.resolve(state, command)
	if result.get("accepted", false):
		state = result.get("state")
	return result

func display_names() -> Dictionary:
	var names := {}
	if state == null:
		return names
	for actor in state.actors:
		names[actor.id] = actor.display_name
	return names
