extends SceneTree
## Regenerates the pinned replay fixtures (RZ-011).
##
##   cd runtime-zero
##   source tools/env.sh
##   godot --headless --path game --script "$PWD/tools/make_replay_fixtures.gd"
##
## Fixtures live in game/tests/fixtures/replay/ and pin, for one command list:
## outcome, turn count, hero HP, event count, event digest and final state hash.
## Regenerating is deliberate: it means the core/content change was reviewed
## (docs/TESTING.md: replay tests fail on rule changes until reviewed).

const OUT_DIR := "res://tests/fixtures/replay"

func _initialize() -> void:
	var dir := DirAccess.open("res://tests")
	if dir != null and not dir.dir_exists("fixtures/replay"):
		dir.make_dir_recursive("fixtures/replay")
	var ok := true
	ok = _write("encounter1_win", "one Memory Leak, four attacks to victory",
		"encounter_1", "", _attacks("enemy_1", 4)) and ok
	ok = _write("encounter2_guard_defeat",
		"two leaks vs guard-only play: deterministic defeat on round 12",
		"encounter_2", "", _guards(12)) and ok
	ok = _write("encounter3_boss_win",
		"boss with the telegraph cycle: nine attacks exactly",
		"encounter_3", "", _attacks("boss_1", 9)) and ok
	ok = _write("encounter1_rejected_command",
		"unknown action is rejected and changes nothing, then the normal win",
		"encounter_1", "", [{"action": "dance", "target": "enemy_1"}] \
			+ _attacks("enemy_1", 4)) and ok
	quit(0 if ok else 1)

func _attacks(target: String, count: int) -> Array:
	var commands: Array = []
	for i in count:
		commands.append({"action": "attack", "target": target})
	return commands

func _guards(count: int) -> Array:
	var commands: Array = []
	for i in count:
		commands.append({"action": "guard", "target": ""})
	return commands

func _write(name: String, title: String, encounter_id: String, equipment_id: String,
		commands: Array) -> bool:
	var result := RZReplayRunner.play(encounter_id, equipment_id, commands)
	if not result.get("ok", false):
		printerr("replay fixtures: ", encounter_id, " failed: ", result.get("errors", []))
		return false
	var fixture := {
		"format_version": RZReplayRunner.FORMAT_VERSION,
		"rules_version": RZRules.RULES_VERSION,
		"title": title,
		"encounter_id": encounter_id,
		"equipment_id": equipment_id,
		"commands": commands,
		"expected": {
			"outcome": result.outcome,
			"turns": result.turns,
			"hero_hp": result.hero_hp,
			"event_count": result.event_count,
			"event_digest": result.event_digest,
			"final_state_hash": result.final_state_hash,
			"rejected": result.rejected,
		},
	}
	var path := OUT_DIR + "/" + name + ".json"
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		printerr("replay fixtures: cannot write ", path)
		return false
	file.store_string(JSON.stringify(fixture, "  ") + "\n")
	file.close()
	print("fixture written: %s  sha256=%s" % [path, FileAccess.get_sha256(path)])
	return true
