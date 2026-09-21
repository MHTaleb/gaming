class_name RZRunService
extends Node
## Run-level orchestration for the three-encounter campaign (RZ-008).
##
## One instance lives as the `RZRun` autoload so run state survives scene
## changes. Presentation asks it what to load and reports fight outcomes back.
##
## Progression is deliberately two-step: the combat scene *reports* an outcome,
## and the result screen *advances*. Advancing requires a reported victory, and
## the pending mark is consumed exactly once, so duplicate clicks or a re-entered
## result screen can never grant two rewards or skip an encounter.
##
## "Heal fully and refill energy between encounters" is structural: every fight
## is a fresh RZCombatSession, so the next encounter always starts at full HP
## and energy. Saving settings/unlocks is RZ-009's job; this service is memory
## state for the current process.

var active := false
var equipment_id := ""
var encounter_id := ""
## Reward ids granted this process (a reward is granted at most once).
var completed: Array[String] = []
## "victory" | "defeat" | "stalled" while a fight outcome awaits advancing.
var pending_outcome := ""
var last_outcome := ""
var last_encounter_title := ""
var last_reward_id := ""
var last_reward_granted := false
var run_complete := false

var _pack: Dictionary = {}

## Starts a run for one equipment choice at the pack's first encounter.
## Returns {ok, errors} - a broken pack or unknown equipment fails closed.
func begin(chosen_equipment_id: String, root: String = RZContentRepository.DEFAULT_ROOT) -> Dictionary:
	var repository := RZContentRepository.new()
	var pack: Dictionary = repository.load_pack(root)
	if not pack.get("ok", false):
		return {"ok": false, "errors": pack.get("errors", [])}
	if not chosen_equipment_id.is_empty() \
			and RZCombatSession.find_by_id(pack.equipment, chosen_equipment_id).is_empty():
		return {"ok": false, "errors": ["equipment '%s' not found" % chosen_equipment_id]}
	var encounters: Array = pack.get("encounters", [])
	if encounters.is_empty():
		return {"ok": false, "errors": ["no encounters in the content pack"]}
	_pack = pack
	active = true
	equipment_id = chosen_equipment_id
	encounter_id = str(encounters[0].get("id", ""))
	pending_outcome = ""
	last_outcome = ""
	last_reward_id = ""
	last_reward_granted = false
	run_complete = false
	return {"ok": true}

## Ends the current run (title flow). `completed` (in-process unlocks) stays.
func reset() -> void:
	active = false
	equipment_id = ""
	encounter_id = ""
	pending_outcome = ""
	last_outcome = ""
	last_encounter_title = ""
	last_reward_id = ""
	last_reward_granted = false
	run_complete = false
	_pack = {}

func encounters() -> Array:
	return _pack.get("encounters", [])

func current_encounter() -> Dictionary:
	return _pack.get("encounters_by_id", {}).get(encounter_id, {})

func next_encounter_id() -> String:
	var value: Variant = current_encounter().get("next_encounter_id", null)
	return "" if value == null else str(value)

func encounter_number() -> int:
	var all := encounters()
	for index in all.size():
		if str(all[index].get("id", "")) == encounter_id:
			return index + 1
	return 0

func encounter_count() -> int:
	return encounters().size()

## Content lookup for the loadout screen; works before a run begins.
func list_equipment(root: String = RZContentRepository.DEFAULT_ROOT) -> Array:
	if not _pack.is_empty() and _pack.get("ok", false):
		return _pack.get("equipment", [])
	var repository := RZContentRepository.new()
	var pack: Dictionary = repository.load_pack(root)
	if not pack.get("ok", false):
		return []
	return pack.get("equipment", [])

## Called by the combat scene when a fight ends. The first report wins; a
## second report for the same fight is ignored.
func report_outcome(outcome: String) -> void:
	if not active or pending_outcome != "" or run_complete:
		return
	pending_outcome = outcome
	last_outcome = outcome
	last_encounter_title = str(current_encounter().get("title", ""))

## Consumes a reported victory: grants the reward at most once and moves to the
## next encounter (or completes the run). Any other state is refused.
func advance() -> Dictionary:
	if not active or pending_outcome != "victory":
		return {"ok": false, "reason": "no_pending_victory"}
	var entry := current_encounter()
	last_reward_id = str(entry.get("reward_id", ""))
	last_reward_granted = last_reward_id != "" and not completed.has(last_reward_id)
	if last_reward_granted:
		completed.append(last_reward_id)
	pending_outcome = ""
	var next_id := next_encounter_id()
	if next_id.is_empty():
		run_complete = true
		active = false
		return {"ok": true, "granted": last_reward_granted, "complete": true,
			"next_encounter_id": ""}
	encounter_id = next_id
	return {"ok": true, "granted": last_reward_granted, "complete": false,
		"next_encounter_id": next_id}

## Defeat/retry path: clears the pending outcome and keeps the same encounter.
## The next fight is a fresh session, so HP and energy are full again.
func retry() -> void:
	pending_outcome = ""
