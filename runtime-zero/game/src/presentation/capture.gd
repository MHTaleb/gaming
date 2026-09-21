class_name RZCapture
extends RefCounted
## Screenshot capture shared by the title screen, the combat scene and the demo
## runner (RZ-007, extended by RZ-031).
##
## Requested on the command line as:  godot --path game -- --capture <path>
## Paths may be absolute host paths, res:// or user://; parent directories are
## created for absolute paths. Captures are evidence only - they never gate or
## change gameplay.

const CAPTURE_ARG := "--capture"

## Returns the requested capture path, or "" when the flag is absent.
static func requested_path() -> String:
	var args := OS.get_cmdline_user_args()
	for index in args.size():
		if args[index] == CAPTURE_ARG and index + 1 < args.size():
			return args[index + 1]
	return ""

## Waits for `frames` rendered frames so the scene composites before the grab,
## then writes the PNG. Coroutine: call with await.
static func save_after_frames(viewport: Viewport, path: String,
		frames: int = 5) -> Error:
	for frame in maxi(1, frames):
		await viewport.get_tree().process_frame
	if not (path.begins_with("res://") or path.begins_with("user://")):
		var parent := path.get_base_dir()
		if not parent.is_empty():
			DirAccess.make_dir_recursive_absolute(parent)
	var image: Image = viewport.get_texture().get_image()
	return image.save_png(path)
