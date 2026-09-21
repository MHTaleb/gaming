extends Control
## Title screen (RZ-004, RZ-007). Presentation-only: no gameplay logic lives
## here. The Start button, Enter/Space, or a click anywhere begins the combat
## prototype (RZ-012 keeps the expansion gate).
##
## Verification modes:
##   godot --path game -- --smoke-shot
##        legacy smoke shot (user://title_smoke.png)
##   godot --path game -- --capture <path>
##        shared capture path (tools/demo.sh, RZ-031)
##   godot --path game -- --auto-enter <frames> [--capture <path>]
##        injects a real Enter press after <frames> frames (verification hook:
##        proves the title -> combat transition on a desktop without input
##        tooling). With --capture, the capture belongs to the scene reached
##        after the press, i.e. the combat scene.

const SMOKE_SHOT_ARG := "--smoke-shot"
const SMOKE_SHOT_FRAMES := 5
const SMOKE_SHOT_PATH := "user://title_smoke.png"
const LOADOUT_SCENE := "res://scenes/loadout.tscn"

var _started := false

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	print("[rz] title ready")
	%StartButton.pressed.connect(_start_game)
	%QuitButton.pressed.connect(_quit)
	%MuteCheck.set_pressed_no_signal(RZRun.setting("mute"))
	%MuteCheck.toggled.connect(func(pressed: bool) -> void:
		RZRun.set_setting("mute", pressed)
		if pressed:
			RZAudio.stop_all())
	%StartButton.grab_focus()
	var auto_enter := _arg_value(args, "--auto-enter")
	var capture_path := RZCapture.requested_path()
	if SMOKE_SHOT_ARG in args:
		capture_path = SMOKE_SHOT_PATH
	if not auto_enter.is_empty():
		# Leave any requested capture to the scene reached after the press.
		await _wait_frames(int(auto_enter))
		var enter := InputEventKey.new()
		enter.keycode = KEY_ENTER
		enter.pressed = true
		Input.parse_input_event(enter)
		return
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
	_start_game()

## One-way transition into the campaign (loadout first); the button press,
## keyboard and click paths all land here, and two events in the same frame
## must not change the scene twice.
func _start_game() -> void:
	if _started:
		return
	_started = true
	RZAudio.play("ui_click")
	print("[rz] start -> loadout")
	get_tree().change_scene_to_file(LOADOUT_SCENE)

## Clean in-game quit: the same shutdown path as the window's close button.
func _quit() -> void:
	print("[rz] quit requested")
	get_tree().quit(0)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		print("[rz] window close requested")

func _wait_frames(frames: int) -> void:
	for frame in maxi(1, frames):
		await get_tree().process_frame

func _run_capture(path: String) -> void:
	var err: Error = await RZCapture.save_after_frames(get_viewport(), path, SMOKE_SHOT_FRAMES)
	if err == OK:
		print("capture saved: ", ProjectSettings.globalize_path(path))
	get_tree().quit(0 if err == OK else 1)

func _arg_value(args: PackedStringArray, flag: String) -> String:
	for index in args.size():
		if args[index] == flag and index + 1 < args.size():
			return args[index + 1]
	return ""
