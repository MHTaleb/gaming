class_name RZSaveRepository
extends RefCounted
## Versioned local save with recovery (RZ-009).
##
## Plain JSON under user:// (or a caller-supplied path for tests):
##   {"version":1,"settings":{"mute":false,"reduced_motion":false},
##    "rewards":["completion_intrusion"],"last_equipment":"guard_plating"}
##
## Writes are atomic (temp file + rename over the old save) and keep the previous
## save as a `.bak` copy. Loading validates every field, migrates older versions,
## and falls back to the backup or to defaults - a missing or corrupt save never
## blocks the game and never raises. No secrets, no network.

const CURRENT_VERSION := 1
const DEFAULT_PATH := "user://save.json"

var errors: Array[String] = []

static func defaults() -> Dictionary:
	return {
		"version": CURRENT_VERSION,
		"settings": {"mute": false, "reduced_motion": false},
		"rewards": [],
		"last_equipment": "",
	}

## Returns sanitized data plus a "recovered" flag when the backup was used.
## Always returns a usable dictionary; check `errors` for what happened.
func load_data(path: String = DEFAULT_PATH) -> Dictionary:
	errors = []
	var primary: Variant = _read(path)
	if primary != null:
		return _sanitize(primary)
	var backup: Variant = _read(path + ".bak")
	if backup != null:
		errors.append("%s: main save unreadable; recovered from backup" % path)
		var recovered := _sanitize(backup)
		recovered["recovered"] = true
		return recovered
	errors.append("%s: no readable save; using defaults" % path)
	var fallback := defaults()
	fallback["recovered"] = false
	return fallback

## Atomic replacement: temp write, previous save becomes .bak, rename in place.
func save_data(data: Dictionary, path: String = DEFAULT_PATH) -> Error:
	errors = []
	var payload := JSON.stringify(_sanitize(data), "  ") + "\n"
	var tmp := path + ".tmp"
	var file := FileAccess.open(tmp, FileAccess.WRITE)
	if file == null:
		errors.append("%s: cannot open temp file" % tmp)
		return FileAccess.get_open_error()
	file.store_string(payload)
	file.flush()
	file.close()
	if FileAccess.file_exists(path + ".bak"):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path + ".bak"))
	if FileAccess.file_exists(path):
		DirAccess.rename_absolute(ProjectSettings.globalize_path(path),
			ProjectSettings.globalize_path(path + ".bak"))
	var err := DirAccess.rename_absolute(ProjectSettings.globalize_path(tmp),
		ProjectSettings.globalize_path(path))
	if err != OK:
		errors.append("%s: atomic replace failed (%d)" % [path, err])
	return err

# ---------------------------------------------------------------- internals

func _read(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		errors.append("%s: missing" % path)
		return null
	var text := FileAccess.get_file_as_string(path)
	if text.strip_edges().is_empty():
		errors.append("%s: empty" % path)
		return null
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		errors.append("%s: not a JSON object" % path)
		return null
	return parsed

## Field-by-field validation: unknown fields are dropped, wrong types fall back
## to defaults, reward ids are deduplicated. Future versions fail closed.
func _sanitize(raw: Dictionary) -> Dictionary:
	var data := _migrate(raw)
	var version := int(data.get("version", 0))
	if version > CURRENT_VERSION:
		errors.append("save version %d is newer than this build (%d); using defaults"
			% [version, CURRENT_VERSION])
		return defaults()
	var result := defaults()
	var settings: Variant = data.get("settings", {})
	if typeof(settings) == TYPE_DICTIONARY:
		result.settings.mute = _as_bool(settings.get("mute"), false)
		result.settings.reduced_motion = _as_bool(settings.get("reduced_motion"), false)
	var rewards: Variant = data.get("rewards", [])
	if typeof(rewards) == TYPE_ARRAY:
		var seen := {}
		for reward in rewards:
			if typeof(reward) == TYPE_STRING and not (reward as String).is_empty() \
					and not seen.has(reward):
				seen[reward] = true
				result.rewards.append(reward)
	var equipment: Variant = data.get("last_equipment", "")
	if typeof(equipment) == TYPE_STRING:
		result.last_equipment = equipment
	return result

func _migrate(data: Dictionary) -> Dictionary:
	var version := int(data.get("version", 0))
	if version >= CURRENT_VERSION:
		return data
	if version == 0:
		# v0 (pre-release): flat "mute" flag and "unlocks" list.
		return {
			"version": 1,
			"settings": {"mute": _as_bool(data.get("mute"), false),
				"reduced_motion": false},
			"rewards": data.get("unlocks", []),
			"last_equipment": "",
		}
	return {"version": CURRENT_VERSION}

func _as_bool(value: Variant, fallback: bool) -> bool:
	if typeof(value) == TYPE_BOOL:
		return value
	return fallback
