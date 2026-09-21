extends SceneTree
## Headless run-loop test suite (RZ-008).
##   godot --headless --path game --script res://tests/run_flow_tests.gd
## Nonzero exit on any failure. Covers the run service (progression, rewards
## granted once, defeat/retry, stall) and the full campaign through the real
## scenes: title flow -> loadout -> three encounters -> result -> replay.

const LOADOUT_SCENE := "res://scenes/loadout.tscn"
const COMBAT_SCENE := "res://scenes/combat.tscn"
const RESULT_SCENE := "res://scenes/result.tscn"

var _checks := 0
var _failures := 0
## The RZRun autoload fetched at runtime: autoload identifiers are not visible
## to main-loop (--script) scripts, only to scene scripts.
var run: RZRunService

func _initialize() -> void:
	run = root.get_node("RZRun")
	# The autoload's _ready (profile reload) lands on the first processed frame;
	# settle it before redirecting persistence away from the real save.
	await process_frame
	run.profile_path = "user://test-runflow-save.json"
	_wipe_profile()
	run.reload_profile()
	_test_begin_variants()
	_test_progression_rewards_once()
	_test_defeat_stall_and_double_report()
	await _test_loadout_scene_flow()
	await _test_full_campaign_through_scenes()
	if _failures == 0:
		print("ALL RUN FLOW TESTS PASSED (%d checks)" % _checks)
		quit(0)
	else:
		printerr("RUN FLOW TESTS FAILED: %d of %d checks failed" % [_failures, _checks])
		quit(1)

# ---------------------------------------------------------------- helpers

func _expect(condition: bool, label: String) -> void:
	_checks += 1
	if condition:
		print("  ok  ", label)
	else:
		_failures += 1
		printerr("  FAIL ", label)

func _fresh_run() -> void:
	run.reset()
	run.completed.clear()

func _wipe_profile() -> void:
	for suffix in ["", ".bak", ".tmp"]:
		var path: String = run.profile_path + suffix
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func _clear_scene() -> void:
	if current_scene != null:
		current_scene.free()
		current_scene = null

func _open(scene_path: String) -> Control:
	var scene: PackedScene = load(scene_path)
	var node: Control = scene.instantiate()
	root.add_child(node)
	# Claim the scene so later change_scene_to_file() calls free it and the
	# engine-managed current scene follows the flow exactly like a real session.
	current_scene = node
	await process_frame
	return node

func _win_current_fight(limit: int) -> int:
	var node: Control = current_scene
	node.debounce_ms = 0
	var turns := 0
	while not node.session.terminal() and turns < limit:
		node.submit_action("attack")
		turns += 1
	return turns

# ---------------------------------------------------------------- service

func _test_begin_variants() -> void:
	for equipment_id in ["guard_plating", "power_booster", "battery_cell"]:
		_fresh_run()
		var result := run.begin(equipment_id)
		_expect(result.get("ok", false) and run.active
			and run.encounter_id == "encounter_1" and run.equipment_id == equipment_id,
			"begin(%s) starts at encounter_1" % equipment_id)
	_expect(run.encounter_count() == 3 and run.encounter_number() == 1,
		"the pack holds three encounters and the run is on the first")
	var unknown := run.begin("cursed_usb")
	_expect(not unknown.get("ok", false) and not unknown.get("errors", []).is_empty(),
		"unknown equipment is refused with a diagnostic")
	_fresh_run()
	_expect(not run.active and run.encounter_id.is_empty(),
		"reset clears the active run")

func _test_progression_rewards_once() -> void:
	_fresh_run()
	run.begin("guard_plating")
	var early := run.advance()
	_expect(not early.get("ok", false), "advancing without a reported victory is refused")
	run.report_outcome("victory")
	var first := run.advance()
	_expect(first.get("ok", false) and first.get("granted", false)
		and first.get("next_encounter_id") == "encounter_2",
		"victory advances to encounter_2 and grants the reward")
	_expect(run.encounter_id == "encounter_2", "the run remembers encounter_2")
	var twice := run.advance()
	_expect(not twice.get("ok", false) and run.encounter_id == "encounter_2",
		"a second advance is refused - no duplicate progression")
	run.report_outcome("victory")
	var second := run.advance()
	_expect(second.get("ok", false) and run.encounter_id == "encounter_3",
		"second victory advances to encounter_3")
	run.report_outcome("victory")
	var final := run.advance()
	_expect(final.get("ok", false) and final.get("complete", false) and run.run_complete
		and not run.active, "third victory completes the run")
	_expect(run.completed.size() == 3, "exactly three rewards were recorded")
	# Replaying the finished campaign must not double-grant.
	run.begin("guard_plating")
	run.report_outcome("victory")
	var replay := run.advance()
	_expect(replay.get("ok", false) and not replay.get("granted", false),
		"replaying an encounter records no second reward")
	_expect(run.completed.size() == 3, "the reward list stays at three entries")

func _test_defeat_stall_and_double_report() -> void:
	_fresh_run()
	run.begin("battery_cell")
	run.report_outcome("defeat")
	var refused := run.advance()
	_expect(not refused.get("ok", false) and run.completed.is_empty(),
		"defeat cannot advance and records no reward")
	run.retry()
	_expect(run.pending_outcome.is_empty() and run.encounter_id == "encounter_1",
		"retry clears the outcome and keeps the encounter")
	run.report_outcome("victory")
	run.report_outcome("defeat")
	_expect(run.pending_outcome == "victory",
		"the first reported outcome wins; a second report is ignored")
	run.advance()
	run.report_outcome("stalled")
	var stall_advance := run.advance()
	_expect(not stall_advance.get("ok", false) and run.encounter_id == "encounter_2",
		"stalled cannot advance the run")

# ---------------------------------------------------------------- scenes

func _test_loadout_scene_flow() -> void:
	_fresh_run()
	run.last_equipment = ""
	_clear_scene()
	var node := await _open(LOADOUT_SCENE)
	_expect(node.name == "Loadout", "loadout scene opens")
	var options: Node = node.get_node("%OptionsBox")
	_expect(options.get_child_count() == 3, "loadout lists the three equipment choices")
	var begin: Button = node.get_node("%BeginButton")
	_expect(begin.disabled, "begin is disabled until a choice is made")
	var first_card: Button = options.get_child(0)
	first_card.pressed.emit()
	_expect(not begin.disabled and node.get_node("%SummaryLabel").text.contains("guard_plating"),
		"selecting the first card enables begin")
	begin.pressed.emit()
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Combat",
		"begin switches to the combat scene")
	_expect(run.active and run.encounter_id == "encounter_1"
		and run.equipment_id == "guard_plating", "the run is active with the chosen loadout")
	_expect(current_scene.get_node("%HeroHPText").text == "125 / 125",
		"the chosen guard plating is applied in the fight")
	# Reopening the loadout preselects the remembered equipment (RZ-009).
	_fresh_run()
	_clear_scene()
	var again := await _open(LOADOUT_SCENE)
	_expect(not again.get_node("%BeginButton").disabled
		and again.get_node("%SummaryLabel").text.contains("guard_plating"),
		"reopening the loadout preselects the remembered equipment")
	_fresh_run()
	run.last_equipment = ""
	_clear_scene()

func _test_full_campaign_through_scenes() -> void:
	_fresh_run()
	_clear_scene()
	run.begin("power_booster")
	var combat := await _open(COMBAT_SCENE)
	_expect(combat.session != null and combat.session.encounter.get("id", "") == "encounter_1",
		"combat scene follows the active run (encounter_1)")
	_expect(combat.get_node("%HeroHPText").text == "100 / 100",
		"encounters start at full HP")
	var turns := await _win_current_fight(10)
	_expect(combat.session.terminal() and turns <= 6, "encounter_1 is won through the UI path")
	_expect(combat.get_node("%ContinueButton").visible
		and not combat.get_node("%RetryButton").visible,
		"with a live run the fight offers Continue, not standalone Retry")
	_expect(run.pending_outcome == "victory", "the victory was reported to the run")
	combat.get_node("%ContinueButton").pressed.emit()
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Result",
		"Continue opens the result screen")
	_expect(current_scene.get_node("%OutcomeTitle").text == "VICTORY"
		and current_scene.get_node("%OutcomeDetail").text.contains("Intrusion cleared"),
		"result screen states the victory and the encounter")
	_expect(run.encounter_id == "encounter_2", "the result screen advanced the run exactly once")
	_expect(current_scene.get_node("%NextButton").visible, "the next fight is offered")
	current_scene.get_node("%NextButton").pressed.emit()
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Combat"
		and current_scene.get_node("%EnemiesBox").get_child_count() == 2,
		"the next fight is encounter_2 with two enemies")
	_expect(current_scene.get_node("%HeroHPText").text == "100 / 100"
		and current_scene.get_node("%HeroEnergyText").text == "6 / 6",
		"the hero is fully healed and refilled between encounters")
	await _win_current_fight(14)
	current_scene.get_node("%ContinueButton").pressed.emit()
	await process_frame
	await process_frame
	_expect(run.encounter_id == "encounter_3", "encounter_2 clear advances to the boss")
	current_scene.get_node("%NextButton").pressed.emit()
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Combat"
		and current_scene.get_node("%EnemiesBox").get_child_count() == 1,
		"the boss encounter fields one enemy")
	await _win_current_fight(14)
	current_scene.get_node("%ContinueButton").pressed.emit()
	await process_frame
	await process_frame
	_expect(current_scene.get_node("%OutcomeTitle").text == "RUN COMPLETE",
		"clearing the boss completes the run")
	_expect(run.completed.size() == 3 and not run.active,
		"three rewards granted, run closed")
	_expect(current_scene.get_node("%ReplayButton").visible,
		"replay is offered after completion")
	_expect(not current_scene.get_node("%NextButton").visible
		and not current_scene.get_node("%RetryButton").visible,
		"no next/retry buttons after the run is complete")
	current_scene.get_node("%ReplayButton").pressed.emit()
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Loadout"
		and not run.active, "play again returns to the loadout screen")
	_fresh_run()
	_clear_scene()
	_wipe_profile()
