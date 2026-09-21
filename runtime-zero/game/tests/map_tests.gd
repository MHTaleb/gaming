extends SceneTree
## Headless work-map test suite (RZ-035).
##   godot --headless --path game --script res://tests/map_tests.gd
## Covers the region view (banner, HUD chips, stone route), the point-to-point
## walk, the ticket stone, the dock panels (contracts/chests/inventory) and the
## two motion modes.

const MAP_SCENE := "res://scenes/map.tscn"
## Pinned copy of the map layout: a layout change must consciously update both.
const ROUTE_1: Array[Vector2] = [
	Vector2(150, 470), Vector2(390, 350), Vector2(650, 440), Vector2(950, 330)]
const ROUTE_2: Array[Vector2] = [
	Vector2(140, 320), Vector2(420, 460), Vector2(720, 350), Vector2(1010, 470)]
const OFFSET := Vector2(0, -54)

var _checks := 0
var _failures := 0
var run: RZRunService

func _initialize() -> void:
	run = root.get_node("RZRun")
	await process_frame
	run.profile_path = "user://test-map-save.json"
	_wipe()
	run.reload_profile()
	await _test_region_board()
	await _test_walk_and_ticket()
	await _test_dock_panels()
	await _test_progress_and_next_region()
	await _test_motion_modes()
	await _test_select_spot_starts_war()
	_wipe()
	run.profile_path = RZSaveRepository.DEFAULT_PATH
	run.reload_profile()
	if _failures == 0:
		print("ALL MAP TESTS PASSED (%d checks)" % _checks)
		quit(0)
	else:
		printerr("MAP TESTS FAILED: %d of %d checks failed" % [_failures, _checks])
		quit(1)

# ---------------------------------------------------------------- helpers

func _expect(condition: bool, label: String) -> void:
	_checks += 1
	if condition:
		print("  ok  ", label)
	else:
		_failures += 1
		printerr("  FAIL ", label)

func _wipe() -> void:
	for suffix in ["", ".bak", ".tmp"]:
		var path: String = run.profile_path + suffix
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

func _fresh_run() -> void:
	run.reset()
	run.completed.clear()

func _open_map() -> Control:
	var scene: PackedScene = load(MAP_SCENE)
	var node: Control = scene.instantiate()
	# State/panel tests inspect arrival behavior; the fight-start test below
	# enables auto_start on purpose (selecting a spot starts the war).
	node.auto_start = false
	root.add_child(node)
	await process_frame
	return node

func _close(node: Node) -> void:
	root.remove_child(node)
	node.free()

# ---------------------------------------------------------------- tests

func _test_region_board() -> void:
	_fresh_run()
	run.begin("guard_plating")
	var map_node := await _open_map()
	_expect(map_node.get_node("%RegionLabel").text == "Intrusion",
		"the banner names the current region")
	_expect(map_node.get_node("%TicketsChip").text == "TICKETS 1 / 3"
		and map_node.get_node("%ClearedChip").text == "CLEARED 0 / 3",
		"the HUD chips state the run progress")
	_expect(map_node.get_node("%Stones").get_node_or_null("Disc_0") != null
		and map_node.get_node("%Stones").get_node_or_null("Disc_1") != null
		and map_node.get_node("%Stones").get_node_or_null("Disc_2") != null
		and map_node.get_node("%Stones").get_node_or_null("Disc_3") != null,
		"the route holds four walkable stones")
	_expect(map_node.get_node("%Stones").get_node("DiscLabel_0").text == "START",
		"the first stone is labelled START")
	_expect(map_node.get_node("%Stones").get_node("DiscLabel_3").text == "TICKET",
		"the last stone is labelled TICKET")
	_expect(map_node.get_node("%Character").position == ROUTE_1[0] + OFFSET,
		"the engineer starts on the first stone")
	var sprite: AnimatedSprite2D = map_node.get_node("%Character")
	_expect(sprite is AnimatedSprite2D and sprite.sprite_frames != null
		and sprite.sprite_frames.has_animation("walk")
		and sprite.sprite_frames.has_animation("idle")
		and sprite.sprite_frames.get_frame_count("walk") == 6
		and sprite.sprite_frames.get_frame_count("idle") == 2
		and sprite.animation == "idle",
		"the engineer is animated (6-frame walk, 2-frame idle, resting)")
	_expect(map_node.call("_disc_state", 0) == "current"
		and map_node.call("_disc_state", 1) == "ahead"
		and map_node.call("_disc_state", 3) == "ahead",
		"stone states start at current + ahead")
	_close(map_node)

func _test_walk_and_ticket() -> void:
	_fresh_run()
	run.begin("guard_plating")
	var map_node := await _open_map()
	map_node.instant_motion = true
	map_node.call("_walk_to_disc", 1)
	_expect(map_node.get_node("%Character").position == ROUTE_1[1] + OFFSET,
		"clicking a stone walks the engineer to it")
	_expect(map_node.call("_disc_state", 0) == "visited"
		and map_node.call("_disc_state", 1) == "current",
		"walked stones become visited, the current one is highlighted")
	_expect(not map_node.get_node("%TicketPanel").visible,
		"a middle stone opens no ticket")
	map_node.call("_walk_to_disc", 3)
	_expect(map_node.get_node("%Character").position == ROUTE_1[3] + OFFSET,
		"the engineer can walk straight to the ticket stone")
	_expect(map_node.get_node("%TicketPanel").visible
		and map_node.get_node("%TicketTitle").text.contains("Intrusion"),
		"arrival on the last stone opens the ticket")
	_expect(map_node.get_node("%TicketDetail").text.contains("Hostile processes: 1"),
		"the ticket states the threat")
	map_node.get_node("%LaterButton").pressed.emit()
	_expect(not map_node.get_node("%TicketPanel").visible,
		"the ticket can be closed without resolving")
	map_node.get_node("%ContractsButton").pressed.emit()
	_expect(map_node.get_node("%TicketPanel").visible,
		"the CONTRACTS dock button reopens the ticket")
	_close(map_node)

func _test_dock_panels() -> void:
	_fresh_run()
	run.begin("guard_plating")
	var map_node := await _open_map()
	map_node.call("_walk_to_disc", 3)
	map_node.get_node("%ChestsButton").pressed.emit()
	_expect(map_node.get_node("%InfoPanel").visible
		and map_node.get_node("%InfoTitle").text.contains("CHESTS")
		and map_node.get_node("%InfoDetail").text.contains("Intrusion")
		and map_node.get_node("%InfoDetail").text.contains("OPEN"),
		"CHESTS lists the rewards and marks the open contract")
	map_node.get_node("%InfoClose").pressed.emit()
	_expect(not map_node.get_node("%InfoPanel").visible, "the info panel closes")
	map_node.get_node("%InventoryButton").pressed.emit()
	_expect(map_node.get_node("%InfoPanel").visible
		and map_node.get_node("%InfoTitle").text == "INVENTORY"
		and map_node.get_node("%InfoDetail").text.contains("guard_plating"),
		"INVENTORY shows the run equipment")
	map_node.get_node("%InfoClose").pressed.emit()
	_close(map_node)

func _test_progress_and_next_region() -> void:
	_fresh_run()
	run.begin("guard_plating")
	var map_node := await _open_map()
	map_node.instant_motion = true
	map_node.call("_walk_to_disc", 3)
	run.report_outcome("victory")
	run.advance()
	_close(map_node)
	var next := await _open_map()
	_expect(next.get_node("%RegionLabel").text == "Load Spike",
		"the next region gets its own banner")
	_expect(next.get_node("%TicketsChip").text == "TICKETS 2 / 3"
		and next.get_node("%ClearedChip").text == "CLEARED 1 / 3",
		"the HUD reflects the cleared contract")
	_expect(next.get_node("%Character").position == ROUTE_2[0] + OFFSET,
		"each region starts the engineer on its first stone")
	next.get_node("%ChestsButton").pressed.emit()
	_expect(next.get_node("%InfoDetail").text.contains("CLEARED  Intrusion")
		and next.get_node("%InfoDetail").text.contains("reward completion_intrusion"),
		"CHESTS shows the recorded reward of the cleared contract")
	next.get_node("%InfoClose").pressed.emit()
	next.instant_motion = true
	next.call("_walk_to_disc", 3)
	_expect(next.get_node("%TicketTitle").text.contains("Load Spike")
		and next.get_node("%TicketDetail").text.contains("Hostile processes: 2"),
		"the second region ticket states its threat")
	_close(next)
	_fresh_run()

func _test_motion_modes() -> void:
	_fresh_run()
	run.begin("guard_plating")
	var map_node := await _open_map()
	map_node.instant_motion = false
	map_node.reduced_motion = true
	map_node.call("_walk_to_disc", 3)
	_expect(map_node.get_node("%Character").position == ROUTE_1[3] + OFFSET
		and not map_node.get("_walking"),
		"reduced motion walks instantly")
	_close(map_node)
	var animated := await _open_map()
	animated.instant_motion = false
	animated.reduced_motion = false
	animated.call("_walk_to_disc", 3)
	_expect(animated.get("_walking")
		and animated.get_node("%Character").position != ROUTE_1[3] + OFFSET,
		"the animated walk starts a tween instead of teleporting")
	var walk_sprite: AnimatedSprite2D = animated.get_node("%Character")
	_expect(walk_sprite.animation == "walk" and not walk_sprite.flip_h,
		"the walk cycle plays while moving right")
	var guard := 0
	while animated.get("_walking") and guard < 1200:
		await process_frame
		guard += 1
	_expect(guard < 1200
		and animated.get_node("%Character").position == ROUTE_1[3] + OFFSET
		and animated.get_node("%TicketPanel").visible,
		"the animated walk finishes on the ticket stone")
	_expect(walk_sprite.animation == "idle",
		"the engineer rests in idle on arrival")
	animated.call("_walk_to_disc", 0)
	_expect(animated.get("_walking") and walk_sprite.animation == "walk",
		"a walk back also plays the cycle")
	var back_guard := 0
	while animated.get("_walking") and back_guard < 1200:
		await process_frame
		back_guard += 1
	_expect(back_guard < 1200
		and animated.get_node("%Character").position == ROUTE_1[0] + OFFSET
		and walk_sprite.flip_h and walk_sprite.animation == "idle",
		"walking left faces the engineer left, then rests in idle")
	_close(animated)
	_fresh_run()

func _test_select_spot_starts_war() -> void:
	_fresh_run()
	run.begin("guard_plating")
	var map_node := await _open_map()
	_expect(map_node.get_node("%MiniMap") != null
		and map_node.get_node("%MiniMap").get_script() != null,
		"the work map shows a mini map")
	map_node.auto_start = true
	map_node.instant_motion = true
	map_node.call("_walk_to_disc", 3)
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Combat"
		and current_scene.get_node("%EncounterLabel").text.contains("Intrusion"),
		"selecting the ticket stone starts the war immediately")
	if current_scene != null:
		current_scene.free()
		current_scene = null
	_close(map_node)
	_fresh_run()
