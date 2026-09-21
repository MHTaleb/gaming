extends SceneTree
## Headless replay suite (RZ-011).
##   godot --headless --path game --script res://tests/replay_tests.gd
##
## Fixtures in tests/fixtures/replay/ pin the full result of a canonical command
## list: outcome, turns, hero HP, event count, ordered-event digest and final
## state hash. A rule or content change that alters any of them fails here until
## it is reviewed and regenerated with tools/make_replay_fixtures.gd.
## The suite also proves the UI path and the headless runner call the same core:
## driving the real combat scene with the same commands yields the same state
## hash as the headless runner and the fixture.

const REPLAY_DIR := "res://tests/fixtures/replay"
const COMBAT_SCENE := "res://scenes/combat.tscn"
const EXPECTED_FIXTURES := ["encounter1_win", "encounter2_guard_defeat",
	"encounter3_boss_win", "encounter1_rejected_command"]

var _checks := 0
var _failures := 0

func _initialize() -> void:
	var run: RZRunService = root.get_node("RZRun")
	await process_frame
	run.profile_path = "user://test-replay-save.json"
	_wipe(run)
	run.reload_profile()
	_test_fixtures()
	await _test_ui_matches_runner()
	_wipe(run)
	run.profile_path = RZSaveRepository.DEFAULT_PATH
	run.reload_profile()
	if _failures == 0:
		print("ALL REPLAY TESTS PASSED (%d checks)" % _checks)
		quit(0)
	else:
		printerr("REPLAY TESTS FAILED: %d of %d checks failed" % [_failures, _checks])
		quit(1)

# ---------------------------------------------------------------- helpers

func _expect(condition: bool, label: String) -> void:
	_checks += 1
	if condition:
		print("  ok  ", label)
	else:
		_failures += 1
		printerr("  FAIL ", label)

func _wipe(run: RZRunService) -> void:
	for suffix in ["", ".bak", ".tmp"]:
		var path: String = run.profile_path + suffix
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func _load_fixture(name: String) -> Dictionary:
	var file := FileAccess.open(REPLAY_DIR + "/" + name + ".json", FileAccess.READ)
	if file == null:
		return {}
	return JSON.parse_string(file.get_as_text())

func _load_all() -> Dictionary:
	var fixtures := {}
	var dir := DirAccess.open(REPLAY_DIR)
	if dir == null:
		return fixtures
	for entry in dir.get_files():
		if entry.ends_with(".json"):
			fixtures[entry.get_basename()] = _load_fixture(entry.get_basename())
	return fixtures

func _open_combat() -> Control:
	var scene: PackedScene = load(COMBAT_SCENE)
	var node: Control = scene.instantiate()
	root.add_child(node)
	await process_frame
	return node

func _close(node: Node) -> void:
	root.remove_child(node)
	node.free()

# ---------------------------------------------------------------- fixtures

func _test_fixtures() -> void:
	var found := _load_all()
	_expect(found.size() >= EXPECTED_FIXTURES.size(),
		"replay fixture directory holds the pinned set (%d files)" % found.size())
	for name in EXPECTED_FIXTURES:
		_expect(found.has(name), "fixture %s is present" % name)
	for name in found:
		_check_fixture(name, found[name])

func _check_fixture(name: String, fixture: Dictionary) -> void:
	if fixture.is_empty():
		_expect(false, "fixture %s parses" % name)
		return
	var expected: Dictionary = fixture.get("expected", {})
	_expect(int(fixture.get("format_version", -1)) == RZReplayRunner.FORMAT_VERSION,
		"%s: format_version supported" % name)
	_expect(int(fixture.get("rules_version", -1)) == RZRules.RULES_VERSION,
		"%s: rules_version matches RZRules (%d)" % [name, RZRules.RULES_VERSION])
	var encounter_id := str(fixture.get("encounter_id", ""))
	var equipment_id := str(fixture.get("equipment_id", ""))
	var commands: Array = fixture.get("commands", [])
	var first := RZReplayRunner.play(encounter_id, equipment_id, commands)
	var second := RZReplayRunner.play(encounter_id, equipment_id, commands)
	_expect(first.get("ok", false), "%s: replay runs on the current content" % name)
	if not first.get("ok", false):
		return
	_expect(first.event_digest == second.event_digest
			and first.final_state_hash == second.final_state_hash,
		"%s: replaying twice gives identical digests" % name)
	_expect(first.outcome == int(expected.get("outcome", -1)),
		"%s: outcome pinned as %d" % [name, first.outcome])
	_expect(first.turns == int(expected.get("turns", -1)),
		"%s: turn count pinned as %d" % [name, first.turns])
	_expect(first.hero_hp == int(expected.get("hero_hp", -1)),
		"%s: hero HP pinned at %d" % [name, first.hero_hp])
	_expect(first.event_count == int(expected.get("event_count", -1)),
		"%s: event count pinned as %d" % [name, first.event_count])
	_expect(first.event_digest == str(expected.get("event_digest", "")),
		"%s: ordered-event digest matches" % name)
	_expect(first.final_state_hash == str(expected.get("final_state_hash", "")),
		"%s: final state hash matches" % name)
	_expect(JSON.stringify(first.rejected) == JSON.stringify(expected.get("rejected", [])),
		"%s: rejected-command list matches" % name)

# ---------------------------------------------------------------- UI parity

func _test_ui_matches_runner() -> void:
	var fixture := _load_fixture("encounter1_win")
	if fixture.is_empty():
		_expect(false, "encounter1_win fixture loads for the UI parity check")
		return
	var expected: Dictionary = fixture.get("expected", {})
	var commands: Array = fixture.get("commands", [])
	var runner := RZReplayRunner.play(str(fixture.encounter_id), "", commands)
	var node := await _open_combat()
	node.debounce_ms = 0
	_expect(node.session != null and node.session.state != null,
		"combat scene starts the same encounter (%s)" % str(fixture.encounter_id))
	if node.session == null or node.session.state == null:
		_close(node)
		return
	# Rejection parity first: the same invalid command produces the same reason
	# in both paths, and neither changes state.
	var reason := str(RZReplayRunner.play("encounter_1", "",
		[{"action": "dance", "target": "enemy_1"}]).rejected[0])
	var before: String = node.session.state.state_hash()
	var refused: Dictionary = node.submit_action("dance")
	_expect(not refused.get("accepted", true)
			and str(refused.get("reason", "")) == reason
			and node.session.state.state_hash() == before,
		"scene rejects the unknown action with the same reason as the runner")
	var rejected_fixture := _load_fixture("encounter1_rejected_command")
	var rejected_expected: Dictionary = rejected_fixture.get("expected", {})
	_expect(rejected_expected.get("final_state_hash", "-")
			== expected.get("final_state_hash", "+")
			and rejected_expected.get("event_digest", "-")
			== expected.get("event_digest", "+")
			and rejected_expected.get("rejected", []).size() == 1,
		"a rejected command changes nothing (same hash and digest as the clean win)")
	for _index in commands.size():
		node.submit_action(RZRules.ACTION_ATTACK)
	_expect(node.session.state.state_hash() == str(expected.get("final_state_hash", "")),
		"scene and headless runner reach the same final state hash")
	_expect(node.session.state.state_hash() == str(runner.final_state_hash),
		"scene result equals a fresh runner result (not just the fixture)")
	_expect(node.session.state.outcome == int(expected.get("outcome", -1)),
		"scene reaches the pinned outcome")
	_expect(node.session.hero().hp == int(expected.get("hero_hp", -1)),
		"scene ends on the pinned hero HP")
	_close(node)
