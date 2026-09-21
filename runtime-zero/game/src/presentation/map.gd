extends Control
## Work map (RZ-035, redesigned to the owner's Obsidian Knight reference): one
## region per screen - a named stage with a winding route of stone nodes. The
## engineer walks stone to stone; the last stone of the region is the job
## ticket, resolved by fighting that region's encounter. Presentation only:
## progression lives in RZRun and combat runs through the validated scenes.
##
## Modes (command line after `--`):
##   --demo-run            begin a run if none is active (captures/previews)
##   --capture <path>      save one PNG and quit (shared with tools/demo.sh)
##
## Tests set instant_motion to walk without waiting for the tween; reduced
## motion makes every walk instant for players.

const LOADOUT_SCENE := "res://scenes/loadout.tscn"
const COMBAT_SCENE := "res://scenes/combat.tscn"
const TITLE_SCENE := "res://scenes/title.tscn"
const WALK_SPEED := 480.0
const CHARACTER_OFFSET := Vector2(-58, -74)
const DISC_RADIUS := 36.0

## One winding stone route per region (start stone first, ticket stone last).
const ROUTES: Array = [
	[Vector2(150, 470), Vector2(390, 350), Vector2(650, 440), Vector2(950, 330)],
	[Vector2(140, 320), Vector2(420, 460), Vector2(720, 350), Vector2(1010, 470)],
	[Vector2(150, 480), Vector2(430, 330), Vector2(740, 470), Vector2(1030, 310)],
]
## Slight backdrop grade and pan per region so stages read differently.
const REGION_TINTS: Array = [
	Color(0.6, 0.8, 1.0, 0.5),
	Color(1.0, 0.68, 0.85, 0.5),
	Color(1.0, 0.85, 0.6, 0.55),
]

var instant_motion := false
var reduced_motion := false
## Selecting a spot starts the war: arriving on the region's ticket stone
## launches the fight at once (owner's reference flow). State/capture tests
## disable it; the CONTRACTS dock still shows the ticket text.
var auto_start := true

var _disc_index := 0
var _walking := false
var _fight_requested := false

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	if not RZRun.active and "--demo-run" in args:
		var equipment: String = RZRun.last_equipment
		if equipment.is_empty():
			equipment = "guard_plating"
		RZRun.begin(equipment)
		var demo_region := clampi(int(_arg_value(args, "--demo-region")), 0, 2)
		for _step in demo_region:
			RZRun.report_outcome("victory")
			RZRun.advance()
	if not RZRun.active:
		# The map only exists inside a run; without one, pick equipment first.
		call_deferred("_redirect_to_loadout")
		return
	_apply_region_look()
	%MuteButton.set_pressed_no_signal(RZRun.setting("mute"))
	_sync_mute_style()
	%MuteButton.pressed.connect(func() -> void:
		var pressed := not RZRun.setting("mute")
		RZRun.set_setting("mute", pressed)
		if pressed:
			RZAudio.stop_all()
		_sync_mute_style())
	reduced_motion = RZRun.setting("reduced_motion")
	_sync_motion_style()
	%MotionButton.pressed.connect(func() -> void:
		reduced_motion = not reduced_motion
		RZRun.set_setting("reduced_motion", reduced_motion)
		_sync_motion_style())
	%QuitButton.pressed.connect(_quit)
	%AbandonButton.pressed.connect(_abandon)
	%ContractsButton.pressed.connect(func() -> void:
		_show_ticket(_region_index()))
	%ChestsButton.pressed.connect(_show_chests)
	%InventoryButton.pressed.connect(_show_inventory)
	%InfoClose.pressed.connect(func() -> void:
		%InfoPanel.visible = false)
	%ResolveButton.pressed.connect(_resolve)
	%LaterButton.pressed.connect(func() -> void:
		%TicketPanel.visible = false)
	_build_discs()
	%MiniMap.source = self
	_place_character(0)
	_refresh_map()
	print("[rz] map ready: region=%d/%d ticket=%s" % [RZRun.encounter_number(),
		RZRun.encounter_count(), str(_region().get("title", ""))])
	var capture := RZCapture.requested_path()
	if not capture.is_empty():
		await _run_capture(capture)

# ---------------------------------------------------------------- region data

func _region_index() -> int:
	return RZRun.encounter_number() - 1

func _region() -> Dictionary:
	var encounters: Array = RZRun.encounters()
	var index := clampi(_region_index(), 0, encounters.size() - 1)
	return encounters[index]

func _route() -> Array:
	return ROUTES[clampi(_region_index(), 0, ROUTES.size() - 1)]

func _apply_region_look() -> void:
	var index := clampi(_region_index(), 0, REGION_TINTS.size() - 1)
	%Backdrop.modulate = REGION_TINTS[index]
	%Backdrop.position = Vector2(-index * 140, 0)

func _build_discs() -> void:
	for index in _route().size():
		var center: Vector2 = _route()[index]
		var spot := Button.new()
		spot.name = "Disc_%d" % index
		spot.flat = true
		spot.focus_mode = Control.FOCUS_ALL
		spot.tooltip_text = "Walk to stone %d" % (index + 1)
		spot.position = center - Vector2(DISC_RADIUS, DISC_RADIUS)
		spot.size = Vector2(DISC_RADIUS * 2.0, DISC_RADIUS * 2.0)
		spot.pressed.connect(_walk_to_disc.bind(index))
		%Stones.add_child(spot)
		var label := Label.new()
		label.name = "DiscLabel_%d" % index
		label.text = "START" if index == 0 else ("TICKET" if index == _route().size() - 1 else "ROUTE")
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.position = center + Vector2(-70, DISC_RADIUS - 4)
		label.size = Vector2(140, 20)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.add_theme_color_override("font_color", Color(0.95, 0.88, 0.7))
		label.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.03))
		label.add_theme_constant_override("outline_size", 4)
		%Stones.add_child(label)

# ---------------------------------------------------------------- drawing

func _refresh_route() -> void:
	%RouteBoard.configure(_route(), _disc_index)

## Stone states live on the route board; this mirrors them for tests and HUD.
func _disc_state(index: int) -> String:
	return str(%RouteBoard.call("_disc_state", index))

# ---------------------------------------------------------------- mini map

## Scaled overview data for the mini map control (route, states, position).
func minimap_state() -> Dictionary:
	return {
		"route": _route(),
		"index": _disc_index,
		"active": RZRun.active,
		"character": _disc_index,
		"walking": _walking,
	}

# ---------------------------------------------------------------- movement

# ---------------------------------------------------------------- movement

func _walk_to_disc(index: int) -> void:
	if _walking or index < 0 or index >= _route().size() or index == _disc_index:
		if index == _disc_index:
			_after_arrival(index)
		return
	_walking = true
	%TicketPanel.visible = false
	%InfoPanel.visible = false
	if instant_motion or reduced_motion:
		_disc_index = index
		_place_character(index)
		_after_arrival(index)
		return
	var tween := create_tween()
	var cursor := _disc_index
	var step := 1 if index > cursor else -1
	while cursor != index:
		cursor += step
		var target: Vector2 = _route()[cursor] + CHARACTER_OFFSET
		var distance: float = %Character.position.distance_to(target)
		tween.tween_property(%Character, "position", target,
			maxf(distance / WALK_SPEED, 0.18))
	_disc_index = index
	tween.finished.connect(_after_arrival.bind(index))

func _place_character(index: int) -> void:
	var point: Vector2 = _route()[clampi(index, 0, _route().size() - 1)]
	%Character.position = point + CHARACTER_OFFSET

func _after_arrival(index: int) -> void:
	_walking = false
	_refresh_map()
	queue_redraw()
	if not RZRun.active or index != _route().size() - 1:
		return
	if auto_start:
		_begin_fight()
	else:
		_show_ticket(_region_index())

## Selecting the spot IS the war: launched as soon as the engineer arrives.
func _begin_fight() -> void:
	if _fight_requested:
		return
	_fight_requested = true
	RZAudio.play("ui_click")
	get_tree().change_scene_to_file(COMBAT_SCENE)
# ---------------------------------------------------------------- panels

func _refresh_map() -> void:
	var region := _region()
	var index := _region_index()
	%RegionLabel.text = str(region.get("title", ""))
	%TicketsChip.text = "TICKETS %d / %d" % [index + 1, RZRun.encounter_count()]
	var cleared := clampi(index, 0, RZRun.encounter_count())
	if not RZRun.active:
		cleared = RZRun.encounter_count()
	%ClearedChip.text = "CLEARED %d / %d" % [cleared, RZRun.encounter_count()]
	_refresh_route()
	%MiniMap.queue_redraw()

func _show_ticket(index: int) -> void:
	var encounters: Array = RZRun.encounters()
	if index < 0 or index >= encounters.size():
		return
	var encounter: Dictionary = encounters[index]
	%TicketTitle.text = "TICKET %d - %s" % [index + 1, str(encounter.get("title", ""))]
	%TicketDetail.text = ("Client challenge: %s.\nHostile processes: %d.\n"
		+ "Resolve it to move on to the next region.") % [
		str(encounter.get("title", "")), _target_count(encounter)]
	%ResolveButton.text = "Resolve ticket - fight %s" % str(encounter.get("title", ""))
	%TicketPanel.visible = true
	%InfoPanel.visible = false
	%ResolveButton.grab_focus()

func _target_count(encounter: Dictionary) -> int:
	var total := 0
	for group in encounter.get("enemy_groups", []):
		total += int(group.get("count", 0))
	return total

func _show_chests() -> void:
	var encounters: Array = RZRun.encounters()
	var index := _region_index()
	var lines := PackedStringArray()
	for i in encounters.size():
		var title := str(encounters[i].get("title", ""))
		if i < index or not RZRun.active:
			lines.append("CLEARED  %s - reward %s recorded" % [title,
				str(encounters[i].get("reward_id", ""))])
		else:
			lines.append("OPEN     %s - not resolved yet" % title)
	if not RZRun.active:
		lines.append("Run complete - all rewards recorded.")
	%InfoTitle.text = "CHESTS - REWARDS %d / %d" % [mini(index, RZRun.encounter_count()),
		RZRun.encounter_count()]
	%InfoDetail.text = "\n".join(lines)
	%InfoPanel.visible = true
	%TicketPanel.visible = false

func _show_inventory() -> void:
	var lines := PackedStringArray()
	lines.append("Run equipment: %s" % (RZRun.equipment_id if not RZRun.equipment_id.is_empty()
		else "(none - run not started)"))
	for entry in RZRun.list_equipment():
		if str(entry.get("id", "")) == RZRun.equipment_id:
			lines.append("")
			lines.append("%s" % str(entry.get("display_name", "")))
			lines.append(str(entry.get("description", "")))
	lines.append("")
	lines.append("Equipment is chosen once per run and lasts until the run ends.")
	%InfoTitle.text = "INVENTORY"
	%InfoDetail.text = "\n".join(lines)
	%InfoPanel.visible = true
	%TicketPanel.visible = false

func _sync_mute_style() -> void:
	%MuteButton.text = "UNMUTE" if RZRun.setting("mute") else "MUTE"

func _sync_motion_style() -> void:
	%MotionButton.text = "FULL MOTION" if reduced_motion else "MOTION"

# ---------------------------------------------------------------- navigation

func _resolve() -> void:
	if RZRun.active:
		RZAudio.play("ui_click")
		get_tree().change_scene_to_file(COMBAT_SCENE)

func _abandon() -> void:
	RZRun.reset()
	get_tree().change_scene_to_file(TITLE_SCENE)

func _quit() -> void:
	print("[rz] quit requested")
	get_tree().quit(0)

func _redirect_to_loadout() -> void:
	get_tree().change_scene_to_file(LOADOUT_SCENE)

func _run_capture(path: String) -> void:
	var err: Error = await RZCapture.save_after_frames(get_viewport(), path)
	if err == OK:
		print("capture saved: ", ProjectSettings.globalize_path(path))
	get_tree().quit(0 if err == OK else 1)

func _arg_value(args: PackedStringArray, flag: String) -> String:
	for index in args.size():
		if args[index] == flag and index + 1 < args.size():
			return args[index + 1]
	return ""
