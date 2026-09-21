extends SceneTree
## Headless content-validation test suite (RZ-006).
##   godot --headless --path game --script res://tests/content_tests.gd
## Nonzero exit on any failure. Exercises the same repository the game uses and
## the malformed fixtures under res://tests/fixtures/content/; no scene, GPU or
## wall-clock dependency.

const CONTENT_ROOT := "res://content"
const FIXTURE_ROOT := "res://tests/fixtures/content"

var _checks := 0
var _failures := 0

func _initialize() -> void:
	_test_valid_pack_loads()
	_test_missing_and_duplicate_ids()
	_test_bad_stats()
	_test_behaviors_are_allowlisted()
	_test_encounter_references()
	_test_progression_chain()
	_test_equipment_rules()
	_test_malformed_fixtures()
	if _failures == 0:
		print("ALL CONTENT TESTS PASSED (%d checks)" % _checks)
		quit(0)
	else:
		printerr("CONTENT TESTS FAILED: %d of %d checks failed" % [_failures, _checks])
		quit(1)

# ---------------------------------------------------------------- fixtures

func _repo() -> RZContentRepository:
	return RZContentRepository.new()

func _has_error(errors: Array, fragment: String) -> bool:
	for error in errors:
		if (error as String).contains(fragment):
			return true
	return false

func _enemy_fixture(id := "unit_enemy") -> Dictionary:
	return {
		"schema_version": 1,
		"id": id,
		"display_name": "Unit Enemy",
		"stats": {"max_hp": 10, "attack": 1, "defense": 0},
		"behavior_id": "basic_attack",
		"presentation_id": "placeholder_enemy",
	}

func _encounter_fixture(id := "unit_encounter") -> Dictionary:
	return {
		"schema_version": 1,
		"id": id,
		"title": "Unit Encounter",
		"enemy_groups": [{"enemy_id": "memory_leak", "count": 1, "actor_ids": ["enemy_1"]}],
		"reward_id": "completion_unit",
		"next_encounter_id": null,
		"rules_version": RZRules.RULES_VERSION,
	}

func _equipment_fixture(id := "unit_item") -> Dictionary:
	return {
		"schema_version": 1,
		"id": id,
		"display_name": "Unit Item",
		"description": "Unit effect.",
		"effect": {"stat": "attack", "amount": 1},
	}

# ---------------------------------------------------------------- tests

func _test_valid_pack_loads() -> void:
	var repo := _repo()
	var pack := repo.load_pack(CONTENT_ROOT)
	for error in pack.errors:
		print("   load error: ", error)
	_expect(pack.ok, "valid prototype pack loads with ok=true")
	_expect_eq(pack.errors.size(), 0, "valid prototype pack has zero errors")
	_expect_eq(pack.enemies.size(), 2, "two enemies defined")
	var leak: Dictionary = pack.enemies.get("memory_leak", {})
	var leak_stats: Dictionary = leak.get("stats", {})
	_expect_eq(leak_stats.get("max_hp"), 35, "memory_leak max_hp fixture")
	_expect_eq(leak_stats.get("attack"), 9, "memory_leak attack fixture")
	var boss: Dictionary = pack.enemies.get("server_cathedral", {})
	var boss_stats: Dictionary = boss.get("stats", {})
	_expect_eq(boss_stats.get("max_hp"), 90, "server_cathedral max_hp fixture")
	_expect_eq(pack.encounters.size(), 3, "three connected encounters")
	var encounters_by_id: Dictionary = pack.encounters_by_id
	var first: Dictionary = encounters_by_id.get("encounter_1", {})
	_expect_eq(first.get("next_encounter_id"), "encounter_2", "encounter_1 links to encounter_2")
	var third: Dictionary = encounters_by_id.get("encounter_3", {})
	_expect_eq(third.get("next_encounter_id"), null, "encounter_3 terminates the chain")
	_expect_eq(pack.equipment.size(), 3, "three equipment choices")
	_expect_eq(RZContentRepository.behavior_kind("basic_attack"), RZRules.KIND_ENEMY,
		"basic_attack maps to a normal enemy")
	_expect_eq(RZContentRepository.behavior_kind("boss_heavy_cycle"), RZRules.KIND_BOSS,
		"boss_heavy_cycle maps to the boss kind")
	_expect_eq(RZContentRepository.behavior_kind("unknown_behavior"), "", "unknown behavior maps to nothing")

func _test_missing_and_duplicate_ids() -> void:
	var repo := _repo()
	var no_id := _enemy_fixture()
	no_id.erase("id")
	repo.validate_enemy(no_id, "unit.enemy")
	_expect(_has_error(repo.errors, "missing or empty id"), "missing enemy id fails")

	var repo2 := _repo()
	var no_name := _enemy_fixture()
	no_name.erase("display_name")
	repo2.validate_enemy(no_name, "unit.enemy")
	_expect(_has_error(repo2.errors, "missing or empty display_name"), "missing display_name fails")

	var repo3 := _repo()
	repo3.validate_references([_enemy_fixture("dupe"), _enemy_fixture("dupe")], [], [], "unit")
	_expect(_has_error(repo3.errors, "duplicate enemy id"), "duplicate enemy ids fail")

	var repo4 := _repo()
	repo4.validate_references([], [_encounter_fixture("dupe"), _encounter_fixture("dupe")], [], "unit")
	_expect(_has_error(repo4.errors, "duplicate encounter id"), "duplicate encounter ids fail")

	var repo5 := _repo()
	repo5.validate_references([], [], [_equipment_fixture("dupe"), _equipment_fixture("dupe")], "unit")
	_expect(_has_error(repo5.errors, "duplicate equipment id"), "duplicate equipment ids fail")

func _test_bad_stats() -> void:
	var cases := [
		[{"max_hp": 0}, "out of range"],
		[{"max_hp": "35"}, "must be an integer"],
		[{"attack": -1}, "out of range"],
		[{"defense": 1.5}, "must be an integer"],
		[{"attack": 100001}, "out of range"],
		[{"defense": INF}, "must be an integer"],
	]
	for case in cases:
		var repo := _repo()
		var enemy := _enemy_fixture()
		var stats: Dictionary = enemy["stats"]
		for key in (case[0] as Dictionary).keys():
			stats[key] = (case[0] as Dictionary)[key]
		repo.validate_enemy(enemy, "unit.enemy")
		_expect(_has_error(repo.errors, case[1]), "bad stat %s -> %s" % [case[0], case[1]])
	var repo_missing := _repo()
	var no_stats := _enemy_fixture()
	no_stats.erase("stats")
	repo_missing.validate_enemy(no_stats, "unit.enemy")
	_expect(_has_error(repo_missing.errors, "missing stats object"), "missing stats object fails")

	var repo_float := _repo()
	var float_stats := _enemy_fixture()
	(float_stats["stats"] as Dictionary)["max_hp"] = 20.0
	repo_float.validate_enemy(float_stats, "unit.enemy")
	_expect_eq(repo_float.errors.size(), 0, "integral float max_hp (as JSON parses it) is accepted")

func _test_behaviors_are_allowlisted() -> void:
	var repo := _repo()
	var unknown := _enemy_fixture()
	unknown["behavior_id"] = "summon_adds"
	repo.validate_enemy(unknown, "unit.enemy")
	_expect(_has_error(repo.errors, "unknown behavior_id"), "unknown behavior id fails")

	var repo_script := _repo()
	var script_path := _enemy_fixture()
	script_path["behavior_id"] = "res://evil.gd"
	repo_script.validate_enemy(script_path, "unit.enemy")
	_expect(_has_error(repo_script.errors, "unknown behavior_id"),
		"script path as behavior id is rejected as data, never executed")

	var source := FileAccess.get_file_as_string("res://src/infrastructure/content_repository.gd")
	_expect(not source.contains("Expression") and not source.contains("GDScript"),
		"repository contains no script-evaluation facilities")

func _test_encounter_references() -> void:
	var repo := _repo()
	var bad_ref := _encounter_fixture()
	(bad_ref["enemy_groups"] as Array)[0]["enemy_id"] = "ghost_enemy"
	repo.validate_references([_enemy_fixture("memory_leak")], [bad_ref], [], "unit")
	_expect(_has_error(repo.errors, "unknown enemy_id"), "unknown enemy reference fails")

	var repo2 := _repo()
	var count_mismatch := _encounter_fixture()
	(count_mismatch["enemy_groups"] as Array)[0]["count"] = 2
	repo2.validate_encounter(count_mismatch, "unit.encounter")
	_expect(_has_error(repo2.errors, "does not match count"), "actor_ids/count mismatch fails")

	var repo3 := _repo()
	var zero_count := _encounter_fixture()
	(zero_count["enemy_groups"] as Array)[0]["count"] = 0
	repo3.validate_encounter(zero_count, "unit.encounter")
	_expect(_has_error(repo3.errors, "count must be an integer >= 1"), "zero count fails")

	var repo4 := _repo()
	var dup_actors := _encounter_fixture()
	(dup_actors["enemy_groups"] as Array)[0]["count"] = 2
	(dup_actors["enemy_groups"] as Array)[0]["actor_ids"] = ["enemy_1", "enemy_1"]
	repo4.validate_encounter(dup_actors, "unit.encounter")
	_expect(_has_error(repo4.errors, "duplicate actor id"), "duplicate actor ids fail")

	var repo5 := _repo()
	var no_title := _encounter_fixture()
	no_title.erase("title")
	repo5.validate_encounter(no_title, "unit.encounter")
	_expect(_has_error(repo5.errors, "missing or empty title"), "missing title fails")

	var repo6 := _repo()
	var old_rules := _encounter_fixture()
	old_rules["rules_version"] = 1
	repo6.validate_encounter(old_rules, "unit.encounter")
	_expect(_has_error(repo6.errors, "unsupported rules_version"), "stale rules_version fails")

	var repo7 := _repo()
	var bad_next := _encounter_fixture()
	bad_next["next_encounter_id"] = 7
	repo7.validate_encounter(bad_next, "unit.encounter")
	_expect(_has_error(repo7.errors, "next_encounter_id must be a string or null"), "non-string next id fails")

	var repo8 := _repo()
	var missing_next := _encounter_fixture()
	missing_next.erase("next_encounter_id")
	repo8.validate_encounter(missing_next, "unit.encounter")
	_expect(_has_error(repo8.errors, "missing next_encounter_id"), "absent next id field fails")

func _test_progression_chain() -> void:
	var repo := _repo()
	var first := _encounter_fixture("enc_a")
	first["next_encounter_id"] = "enc_missing"
	repo.validate_references([], [first], [], "unit")
	_expect(_has_error(repo.errors, "does not exist"), "dangling next_encounter_id fails")

	var repo2 := _repo()
	var a := _encounter_fixture("enc_a")
	var b := _encounter_fixture("enc_b")
	a["next_encounter_id"] = "enc_b"
	b["next_encounter_id"] = "enc_a"
	repo2.validate_references([], [a, b], [], "unit")
	_expect(_has_error(repo2.errors, "campaign root"), "two-node cycle has no valid root")

	var repo3 := _repo()
	var self_cycle := _encounter_fixture("enc_self")
	self_cycle["next_encounter_id"] = "enc_self"
	repo3.validate_references([], [self_cycle], [], "unit")
	_expect(_has_error(repo3.errors, "campaign root"), "self cycle fails")

	var repo4 := _repo()
	var root := _encounter_fixture("enc_root")
	var orphan_a := _encounter_fixture("enc_orphan_a")
	var orphan_b := _encounter_fixture("enc_orphan_b")
	orphan_a["next_encounter_id"] = "enc_orphan_b"
	orphan_b["next_encounter_id"] = "enc_orphan_a"
	repo4.validate_references([], [root, orphan_a, orphan_b], [], "unit")
	_expect(_has_error(repo4.errors, "unreachable"), "orphaned cycle is unreachable from the root")

	var repo5 := _repo()
	var extra_root := _encounter_fixture("enc_extra")
	repo5.validate_references([], [_encounter_fixture("enc_one"), extra_root], [], "unit")
	_expect(_has_error(repo5.errors, "campaign root"), "two roots fail")

	var repo6 := _repo()
	repo6.validate_references([_enemy_fixture("memory_leak")], [_encounter_fixture("enc_ok")], [], "unit")
	_expect_eq(repo6.errors.size(), 0, "single valid encounter chain passes")

func _test_equipment_rules() -> void:
	var repo := _repo()
	repo.validate_equipment(_equipment_fixture(), "unit.item")
	_expect_eq(repo.errors.size(), 0, "valid equipment item passes")

	var repo2 := _repo()
	var bad_stat := _equipment_fixture()
	bad_stat["effect"]["stat"] = "luck"
	repo2.validate_equipment(bad_stat, "unit.item")
	_expect(_has_error(repo2.errors, "unknown effect stat"), "unknown effect stat fails")

	var repo3 := _repo()
	var zero_amount := _equipment_fixture()
	zero_amount["effect"]["amount"] = 0
	repo3.validate_equipment(zero_amount, "unit.item")
	_expect(_has_error(repo3.errors, "effect amount"), "zero effect amount fails")

	var repo4 := _repo()
	var no_desc := _equipment_fixture()
	no_desc.erase("description")
	repo4.validate_equipment(no_desc, "unit.item")
	_expect(_has_error(repo4.errors, "missing or empty description"), "missing description fails")

func _test_malformed_fixtures() -> void:
	var repo := _repo()
	repo.read_section(FIXTURE_ROOT.path_join("bad_schema.json"), "enemies")
	_expect(_has_error(repo.errors, "unsupported schema_version"), "fixture: unsupported schema fails")

	var repo2 := _repo()
	var bad_enemies := repo2.read_section(FIXTURE_ROOT.path_join("bad_enemies.json"), "enemies")
	repo2.validate_references(bad_enemies, [], [], "fixture/bad_enemies.json")
	_expect(_has_error(repo2.errors, "duplicate enemy id"), "fixture: duplicate enemy ids fail")
	_expect(_has_error(repo2.errors, "must be an integer"), "fixture: non-integer stat fails")
	_expect(_has_error(repo2.errors, "out of range"), "fixture: zero max_hp fails")

	var repo3 := _repo()
	repo3.read_section(FIXTURE_ROOT.path_join("bad_encounters.json"), "encounters")
	_expect(_has_error(repo3.errors, "does not match count"), "fixture: actor/count mismatch fails")
	_expect(_has_error(repo3.errors, "duplicate actor id"), "fixture: duplicate actor ids fail")

	var repo4 := _repo()
	repo4.read_section(FIXTURE_ROOT.path_join("does_not_exist.json"), "enemies")
	_expect(_has_error(repo4.errors, "missing content file"), "missing file fails with a clear diagnostic")

# ---------------------------------------------------------------- harness

func _expect(condition: bool, label: String) -> void:
	_checks += 1
	if condition:
		print("  ok  " + label)
	else:
		_failures += 1
		printerr("  FAIL " + label)

func _expect_eq(actual: Variant, expected: Variant, label: String) -> void:
	_checks += 1
	if typeof(actual) == typeof(expected) and actual == expected:
		print("  ok  " + label)
	else:
		_failures += 1
		printerr("  FAIL " + label + " (expected %s, got %s)" % [str(expected), str(actual)])
