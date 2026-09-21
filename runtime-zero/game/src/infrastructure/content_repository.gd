class_name RZContentRepository
extends RefCounted
## Loads and validates versioned RPG content packs (RZ-006).
##
## Content is plain JSON under res://content/ (see game/content/README.md).
## Validation uses the allowlists below and NEVER evaluates scripts: a
## behavior_id is a lookup key, not a path, so no content field can execute code.
## Errors state the file, entry and field so a broken pack is fixable without a
## debugger. A pack with any error is returned with ok == false and is not usable.

const DEFAULT_ROOT := "res://content"
const SUPPORTED_SCHEMA_VERSION := 1

## Allowlisted enemy behaviors -> actor kind used by the combat core.
const BEHAVIOR_KINDS := {
	"basic_attack": RZRules.KIND_ENEMY,
	"boss_heavy_cycle": RZRules.KIND_BOSS,
}

## Equipment effect stats understood by the prototype core.
const EQUIPMENT_STATS := ["max_hp", "attack", "energy_cap"]

const MAX_STAT_VALUE := 100000
const MAX_EFFECT_AMOUNT := 1000

var errors: Array[String] = []

static func behavior_kind(behavior_id: String) -> String:
	return BEHAVIOR_KINDS.get(behavior_id, "")

## Loads every section, validates entries and cross-references.
## Returns {ok, errors, enemies (by id), encounters (file order),
## encounters_by_id, equipment}.
func load_pack(root: String = DEFAULT_ROOT) -> Dictionary:
	errors = []
	var enemies := read_section(root.path_join("enemies.json"), "enemies")
	var encounters := read_section(root.path_join("encounters.json"), "encounters")
	var equipment := read_section(root.path_join("equipment.json"), "equipment")
	if errors.is_empty():
		validate_references(enemies, encounters, equipment, root)
	return {
		"ok": errors.is_empty(),
		"errors": errors.duplicate(),
		"enemies": _index_by_id(enemies),
		"encounters": encounters,
		"encounters_by_id": _index_by_id(encounters),
		"equipment": equipment,
	}

## Reads and per-entry-validates one section file. Public so tests and tools can
## point at fixture directories. Returns the raw entries (possibly invalid).
func read_section(path: String, key: String) -> Array:
	var items: Array = []
	if not FileAccess.file_exists(path):
		errors.append("%s: missing content file" % path)
		return items
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		errors.append("%s: unreadable or empty" % path)
		return items
	var parsed: Variant = _normalize_numbers(JSON.parse_string(text))
	if typeof(parsed) != TYPE_DICTIONARY:
		errors.append("%s: expected a JSON object" % path)
		return items
	var document: Dictionary = parsed
	if not _is_supported_schema(document.get("schema_version"), path):
		return items
	var raw_items: Variant = document.get(key)
	if typeof(raw_items) != TYPE_ARRAY:
		errors.append("%s: missing '%s' array" % [path, key])
		return items
	items = raw_items
	for index in items.size():
		var where := "%s[%d]" % [path, index]
		var item: Variant = items[index]
		if typeof(item) != TYPE_DICTIONARY:
			errors.append("%s: entry must be an object" % where)
			continue
		var entry: Dictionary = item
		match key:
			"enemies":
				validate_enemy(entry, where)
			"encounters":
				validate_encounter(entry, where)
			"equipment":
				validate_equipment(entry, where)
			_:
				errors.append("%s: unknown content section '%s'" % [path, key])
	return items

func validate_enemy(enemy: Dictionary, where: String) -> void:
	_require_string(enemy, "id", where)
	_require_string(enemy, "display_name", where)
	_is_supported_schema(enemy.get("schema_version"), where)
	var stats: Variant = enemy.get("stats")
	if typeof(stats) != TYPE_DICTIONARY:
		errors.append("%s: missing stats object" % where)
	else:
		var stat_source: Dictionary = stats
		_require_bounded_int(stat_source, "max_hp", where + ".stats", 1)
		_require_bounded_int(stat_source, "attack", where + ".stats", 0)
		_require_bounded_int(stat_source, "defense", where + ".stats", 0)
	var behavior: Variant = enemy.get("behavior_id")
	if typeof(behavior) != TYPE_STRING or (behavior as String).is_empty():
		errors.append("%s: missing behavior_id" % where)
	elif not BEHAVIOR_KINDS.has(behavior):
		errors.append("%s: unknown behavior_id '%s' (allowlist: %s)" % [where, behavior, _join_keys(BEHAVIOR_KINDS.keys())])
	_require_string(enemy, "presentation_id", where)

func validate_encounter(encounter: Dictionary, where: String) -> void:
	_require_string(encounter, "id", where)
	_require_string(encounter, "title", where)
	_require_string(encounter, "reward_id", where)
	_is_supported_schema(encounter.get("schema_version"), where)
	var rules: Variant = _number_as_int(encounter.get("rules_version"))
	if rules == null:
		errors.append("%s: missing or non-integer rules_version" % where)
	elif rules != RZRules.RULES_VERSION:
		errors.append("%s: unsupported rules_version %d (core implements %d)" % [where, rules, RZRules.RULES_VERSION])
	var groups: Variant = encounter.get("enemy_groups")
	if typeof(groups) != TYPE_ARRAY or (groups as Array).is_empty():
		errors.append("%s: missing enemy_groups array" % where)
	else:
		var seen_actors := {}
		var group_list: Array = groups
		for index in group_list.size():
			var group_where := "%s.enemy_groups[%d]" % [where, index]
			var group: Variant = group_list[index]
			if typeof(group) != TYPE_DICTIONARY:
				errors.append("%s: group must be an object" % group_where)
				continue
			_validate_enemy_group(group, group_where, seen_actors)
	if not encounter.has("next_encounter_id"):
		errors.append("%s: missing next_encounter_id (string or null)" % where)
	else:
		var next_value: Variant = encounter.get("next_encounter_id")
		if next_value != null and typeof(next_value) != TYPE_STRING:
			errors.append("%s: next_encounter_id must be a string or null" % where)

func validate_equipment(item: Dictionary, where: String) -> void:
	_require_string(item, "id", where)
	_require_string(item, "display_name", where)
	_require_string(item, "description", where)
	_is_supported_schema(item.get("schema_version"), where)
	var effect: Variant = item.get("effect")
	if typeof(effect) != TYPE_DICTIONARY:
		errors.append("%s: missing effect object" % where)
		return
	var effect_map: Dictionary = effect
	var stat: Variant = effect_map.get("stat")
	if typeof(stat) != TYPE_STRING or not EQUIPMENT_STATS.has(stat):
		errors.append("%s: unknown effect stat '%s' (allowlist: %s)" % [where, str(stat), _join_keys(EQUIPMENT_STATS)])
	var amount: Variant = _number_as_int(effect_map.get("amount"))
	if amount == null or amount < 1 or amount > MAX_EFFECT_AMOUNT:
		errors.append("%s: effect amount must be an integer 1..%d" % [where, MAX_EFFECT_AMOUNT])

## Cross-section validation: unique ids, enemy references and the campaign chain.
func validate_references(enemies: Array, encounters: Array, equipment: Array, source: String) -> void:
	_check_unique_ids(enemies, "enemy", source)
	_check_unique_ids(encounters, "encounter", source)
	_check_unique_ids(equipment, "equipment", source)
	var enemy_ids := {}
	for enemy in enemies:
		if typeof(enemy) == TYPE_DICTIONARY:
			var id: Variant = (enemy as Dictionary).get("id")
			if typeof(id) == TYPE_STRING and not (id as String).is_empty():
				enemy_ids[id] = true
	for index in encounters.size():
		var encounter: Variant = encounters[index]
		if typeof(encounter) != TYPE_DICTIONARY:
			continue
		var encounter_map: Dictionary = encounter
		var where := "%s[%d] (%s)" % [source, index, str(encounter_map.get("id", "<no id>"))]
		var groups: Variant = encounter_map.get("enemy_groups")
		if typeof(groups) != TYPE_ARRAY:
			continue
		for group in (groups as Array):
			if typeof(group) != TYPE_DICTIONARY:
				continue
			var enemy_id: Variant = (group as Dictionary).get("enemy_id")
			if typeof(enemy_id) == TYPE_STRING and not enemy_ids.has(enemy_id):
				errors.append("%s: enemy_groups references unknown enemy_id '%s'" % [where, enemy_id])
	if encounters.size() > 0:
		_validate_progression(encounters, source)

# ---------------------------------------------------------------- internals

func _validate_enemy_group(group: Dictionary, where: String, seen_actors: Dictionary) -> void:
	var enemy_id: Variant = group.get("enemy_id")
	if typeof(enemy_id) != TYPE_STRING or (enemy_id as String).is_empty():
		errors.append("%s: missing enemy_id" % where)
	var count: Variant = _number_as_int(group.get("count"))
	if count == null or count < 1:
		errors.append("%s: count must be an integer >= 1" % where)
	var actors: Variant = group.get("actor_ids")
	if typeof(actors) != TYPE_ARRAY or (actors as Array).is_empty():
		errors.append("%s: missing actor_ids array" % where)
		return
	var actor_list: Array = actors
	if count != null and actor_list.size() != count:
		errors.append("%s: actor_ids size %d does not match count %d" % [where, actor_list.size(), count])
	for actor in actor_list:
		if typeof(actor) != TYPE_STRING or (actor as String).is_empty():
			errors.append("%s: actor id must be a non-empty string" % where)
			continue
		if seen_actors.has(actor):
			errors.append("%s: duplicate actor id '%s'" % [where, actor])
		seen_actors[actor] = true

func _validate_progression(encounters: Array, source: String) -> void:
	var by_id := _index_by_id(encounters)
	var referenced := {}
	for encounter in encounters:
		if typeof(encounter) != TYPE_DICTIONARY:
			continue
		var next_value: Variant = (encounter as Dictionary).get("next_encounter_id")
		if typeof(next_value) == TYPE_STRING:
			if not by_id.has(next_value):
				errors.append("%s: next_encounter_id '%s' does not exist" % [source, next_value])
			else:
				referenced[next_value] = true
	var roots: Array = []
	for id in by_id.keys():
		if not referenced.has(id):
			roots.append(id)
	if roots.size() != 1:
		errors.append("%s: expected exactly one campaign root, found %d (%s)" % [source, roots.size(), _join_keys(roots)])
		return
	var visited := {}
	var current: Variant = roots[0]
	while typeof(current) == TYPE_STRING and not (current as String).is_empty():
		if visited.has(current):
			errors.append("%s: campaign chain cycles at '%s'" % [source, current])
			break
		visited[current] = true
		var encounter_map: Dictionary = by_id.get(current, {})
		current = encounter_map.get("next_encounter_id")
	for id in by_id.keys():
		if not visited.has(id):
			errors.append("%s: encounter '%s' is unreachable from the root" % [source, id])

func _check_unique_ids(items: Array, kind: String, source: String) -> void:
	var seen := {}
	for index in items.size():
		var item: Variant = items[index]
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var id: Variant = (item as Dictionary).get("id")
		if typeof(id) != TYPE_STRING or (id as String).is_empty():
			continue  # the missing id itself is reported per entry
		if seen.has(id):
			errors.append("%s[%d]: duplicate %s id '%s'" % [source, index, kind, id])
		seen[id] = true

func _is_supported_schema(value: Variant, where: String) -> bool:
	var parsed: Variant = _number_as_int(value)
	if parsed == null:
		errors.append("%s: missing or non-integer schema_version" % where)
		return false
	if parsed != SUPPORTED_SCHEMA_VERSION:
		errors.append("%s: unsupported schema_version %d (supported: %d)" % [where, parsed, SUPPORTED_SCHEMA_VERSION])
		return false
	return true

func _require_string(source: Dictionary, field: String, where: String) -> void:
	var value: Variant = source.get(field)
	if typeof(value) != TYPE_STRING or (value as String).is_empty():
		errors.append("%s: missing or empty %s" % [where, field])

func _require_bounded_int(source: Dictionary, field: String, where: String, minimum: int) -> void:
	var parsed: Variant = _number_as_int(source.get(field))
	if parsed == null:
		errors.append("%s: %s must be an integer (finite, integral)" % [where, field])
		return
	if parsed < minimum or parsed > MAX_STAT_VALUE:
		errors.append("%s: %s out of range (%d..%d): %d" % [where, field, minimum, MAX_STAT_VALUE, parsed])

func _index_by_id(items: Array) -> Dictionary:
	var out := {}
	for item in items:
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var id: Variant = (item as Dictionary).get("id")
		if typeof(id) == TYPE_STRING and not (id as String).is_empty():
			out[id] = item
	return out

static func _join_keys(values: Array) -> String:
	return ", ".join(PackedStringArray(values))

## Accepts JSON numbers: integral values (including 35.0) become ints. 1.5,
## non-finite values and non-numbers return null and are rejected by callers.
static func _number_as_int(value: Variant) -> Variant:
	if typeof(value) == TYPE_INT:
		return value
	if typeof(value) == TYPE_FLOAT:
		if not is_finite(value) or value != floor(value):
			return null
		var converted := int(value)
		if float(converted) != value:
			return null
		return converted
	return null

## JSON has no integer type; normalize integral floats recursively on load so the
## integer-based combat core and the validators see ints for valid data.
static func _normalize_numbers(value: Variant) -> Variant:
	match typeof(value):
		TYPE_FLOAT:
			var parsed: Variant = _number_as_int(value)
			return parsed if parsed != null else value
		TYPE_DICTIONARY:
			var dictionary: Dictionary = value
			for key in dictionary.keys():
				dictionary[key] = _normalize_numbers(dictionary[key])
			return dictionary
		TYPE_ARRAY:
			var array: Array = value
			for index in array.size():
				array[index] = _normalize_numbers(array[index])
			return array
	return value
