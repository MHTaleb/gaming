extends Control
## Title screen (RZ-004, RZ-007). Presentation-only: no gameplay logic lives
## here. Enter, Space or a click starts the prototype combat scene.
##
## Verification modes:
##   godot --path game -- --smoke-shot          legacy smoke shot (user://title_smoke.png)
##   godot --path game -- --capture <path>      shared capture path (tools/demo.sh, RZ-031)

const SMOKE_SHOT_ARG := "--smoke-shot"
const SMOKE_SHOT_FRAMES := 5
const SMOKE_SHOT_PATH := "user://title_smoke.png"
const COMBAT_SCENE := "res://scenes/combat.tscn"

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var capture_path := RZCapture.requested_path()
	if SMOKE_SHOT_ARG in args:
		capture_path = SMOKE_SHOT_PATH
	if not capture_path.is_empty():
		set_process_unhandled_input(false)
		_run_capture(capture_path)

func _unhandled_input(event: InputEvent) -> void:
	var wants_start := event.is_action_pressed("ui_accept")
	if event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		wants_start = wants_start or (mouse.pressed and mouse.button_index == MOUSE_BUTTON_LEFT)
	if not wants_start:
		return
	get_viewport().set_input_as_handled()
	get_tree().change_scene_to_file(COMBAT_SCENE)

func _run_capture(path: String) -> void:
	var err: Error = await RZCapture.save_after_frames(get_viewport(), path, SMOKE_SHOT_FRAMES)
	if err == OK:
		print("capture saved: ", ProjectSettings.globalize_path(path))
	get_tree().quit(0 if err == OK else 1)
