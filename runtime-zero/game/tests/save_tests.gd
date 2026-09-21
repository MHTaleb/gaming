extends SceneTree
## Headless save/recovery test suite (RZ-009).
##   godot --headless --path game --script res://tests/save_tests.gd
## Nonzero exit on any failure. Uses a sandbox under user:// and never touches
## the real save; covers round-trip, atomic replacement, backup recovery,
## total corruption, v0 migration, future versions and type sanitizing, plus
## the RZRun profile integration.

const SANDBOX := "user://save-tests"
const MAIN := SANDBOX + "/save.json"
const PROFILE := SANDBOX + "/profile.json"

var _checks := 0
var _failures := 0
var run: RZRunService

func _initialize() -> void:
	run = root.get_node("RZRun")
	# The autoload's _ready (profile reload) lands on the first processed frame;
	# settle it before pointing the profile at the sandbox.
	await process_frame
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SANDBOX))
	_clean()
	_test_defaults_and_roundtrip()
	_test_atomic_replacement_and_backup()
	_test_corrupt_main_recovers_from_backup()
	_test_corrupt_all_uses_defaults()
	_test_migration_v0()
	_test_future_version_fails_closed()
	_test_bad_types_are_sanitized()
	_test_run_service_profile_integration()
	_clean()
	if _failures == 0:
		print("ALL SAVE TESTS PASSED (%d checks)" % _checks)
		quit(0)
	else:
		printerr("SAVE TESTS FAILED: %d of %d checks failed" % [_failures, _checks])
		quit(1)

# ---------------------------------------------------------------- helpers

func _expect(condition: bool, label: String) -> void:
	_checks += 1
	if condition:
		print("  ok  ", label)
	else:
		_failures += 1
		printerr("  FAIL ", label)

func _clean() -> void:
	for base in [MAIN, PROFILE]:
		for suffix in ["", ".bak", ".tmp"]:
			var path: String = base + suffix
			if FileAccess.file_exists(path):
				DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func _write_raw(path: String, text: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(text)
	file.close()

# ---------------------------------------------------------------- tests

func _test_defaults_and_roundtrip() -> void:
	var repo := RZSaveRepository.new()
	var missing := repo.load_data(MAIN)
	_expect(int(missing.version) == 1 and missing.rewards.is_empty()
		and missing.settings.mute == false,
		"a missing save falls back to typed defaults")
	_expect(not repo.errors.is_empty(), "the missing save is reported in errors")
	var payload := {"version": 1,
		"settings": {"mute": true, "reduced_motion": true},
		"rewards": ["completion_intrusion", "completion_load_spike"],
		"last_equipment": "guard_plating"}
	_expect(repo.save_data(payload, MAIN) == OK, "save_data writes the file")
	var loaded := repo.load_data(MAIN)
	_expect(loaded.settings.mute and loaded.settings.reduced_motion,
		"settings round-trip")
	_expect(loaded.rewards.size() == 2 and loaded.rewards[0] == "completion_intrusion",
		"rewards round-trip in order")
	_expect(loaded.last_equipment == "guard_plating", "equipment round-trips")

func _test_atomic_replacement_and_backup() -> void:
	var repo := RZSaveRepository.new()
	var second := {"version": 1,
		"settings": {"mute": false, "reduced_motion": false},
		"rewards": ["completion_slice"], "last_equipment": "power_booster"}
	_expect(repo.save_data(second, MAIN) == OK, "second save succeeds")
	_expect(not FileAccess.file_exists(MAIN + ".tmp"), "no temp file lingers after a save")
	_expect(FileAccess.file_exists(MAIN + ".bak"), "the previous save is kept as backup")
	var current := repo.load_data(MAIN)
	_expect(current.rewards.has("completion_slice"), "the main file holds the new revision")
	var previous := repo.load_data(MAIN + ".bak")
	_expect(previous.settings.mute and previous.rewards.size() == 2,
		"the backup holds the previous revision")

func _test_corrupt_main_recovers_from_backup() -> void:
	_write_raw(MAIN, "{ this is not json")
	var repo := RZSaveRepository.new()
	var recovered := repo.load_data(MAIN)
	_expect(recovered.get("recovered", false)
		and recovered.rewards.has("completion_intrusion"),
		"a corrupt main save recovers from the backup copy")
	_expect(not repo.errors.is_empty(), "the recovery is reported in errors")

func _test_corrupt_all_uses_defaults() -> void:
	_write_raw(MAIN, "{ still broken")
	_write_raw(MAIN + ".bak", "???")
	var repo := RZSaveRepository.new()
	var fallback := repo.load_data(MAIN)
	_expect(fallback.rewards.is_empty() and fallback.settings.mute == false
		and fallback.last_equipment == "",
		"a fully corrupt save still yields usable defaults")
	_expect(not fallback.get("recovered", false), "no false recovery flag is set")

func _test_migration_v0() -> void:
	_write_raw(MAIN, JSON.stringify({"version": 0, "mute": true,
		"unlocks": ["completion_intrusion"]}))
	var repo := RZSaveRepository.new()
	var migrated := repo.load_data(MAIN)
	_expect(int(migrated.version) == 1 and migrated.settings.mute == true
		and migrated.settings.reduced_motion == false
		and migrated.rewards.has("completion_intrusion"),
		"a v0 save migrates to v1 with its unlock preserved")

func _test_future_version_fails_closed() -> void:
	_write_raw(MAIN, JSON.stringify({"version": 99,
		"settings": {"mute": true}, "rewards": ["x"]}))
	var repo := RZSaveRepository.new()
	var result := repo.load_data(MAIN)
	_expect(result.rewards.is_empty() and result.settings.mute == false,
		"a newer save version fails closed to defaults")
	_expect(not repo.errors.is_empty(), "the version refusal is reported")

func _test_bad_types_are_sanitized() -> void:
	_write_raw(MAIN, JSON.stringify({"version": 1,
		"settings": {"mute": "yes", "reduced_motion": 1},
		"rewards": [1, "x", "x", "", "y"], "last_equipment": 5}))
	var repo := RZSaveRepository.new()
	var result := repo.load_data(MAIN)
	_expect(result.settings.mute == false and result.settings.reduced_motion == false,
		"non-bool settings fall back to false")
	_expect(result.rewards.size() == 2 and result.rewards[0] == "x"
		and result.rewards[1] == "y",
		"rewards are type-checked and deduplicated")
	_expect(result.last_equipment == "", "a non-string equipment field is dropped")

func _test_run_service_profile_integration() -> void:
	run.profile_path = PROFILE
	run.reload_profile()
	run.completed.clear()
	run.set_setting("reduced_motion", true)
	run.reload_profile()
	_expect(run.setting("reduced_motion") == true,
		"settings persist across reloads through RZRun")
	run.begin("battery_cell")
	run.reload_profile()
	_expect(run.last_equipment == "battery_cell",
		"the chosen equipment is remembered for the next loadout")
	run.report_outcome("victory")
	run.advance()
	run.reload_profile()
	_expect(run.completed.has("completion_intrusion"),
		"a granted reward survives a full reload")
	run.reset()
	run.completed.clear()
	run.profile_path = RZSaveRepository.DEFAULT_PATH
	run.reload_profile()
