extends Control
## Provisional title screen (RZ-004).
##
## Presentation-only placeholder: no gameplay logic lives here.
## Supports a smoke-shot mode used by setup verification:
##   godot --path game --quit-after 300 -- --smoke-shot
## It renders a few frames, saves user://title_smoke.png and quits.

const SMOKE_SHOT_ARG := "--smoke-shot"
const SMOKE_SHOT_FRAMES := 5
const SMOKE_SHOT_PATH := "user://title_smoke.png"

func _ready() -> void:
	if SMOKE_SHOT_ARG in OS.get_cmdline_user_args():
		_run_smoke_shot()

func _run_smoke_shot() -> void:
	# Let the window and at least one full frame exist before capturing.
	for frame in SMOKE_SHOT_FRAMES:
		await get_tree().process_frame
	var image: Image = get_viewport().get_texture().get_image()
	var err: Error = image.save_png(SMOKE_SHOT_PATH)
	if err == OK:
		print("smoke shot saved: ", ProjectSettings.globalize_path(SMOKE_SHOT_PATH))
	get_tree().quit(0 if err == OK else 1)
