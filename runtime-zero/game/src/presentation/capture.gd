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
## then writes the PNG. Coroutine: call with await. Fails loudly under the
## headless/dummy renderer (there is no viewport texture there) instead of
## reporting a saved file that was never written.
static func save_after_frames(viewport: Viewport, path: String,
		frames: int = 5) -> Error:
	if DisplayServer.get_name() == "headless":
		printerr("capture: headless mode has no framebuffer; run with a display (WSLg)")
		return ERR_UNAVAILABLE
	for frame in maxi(1, frames):
		await viewport.get_tree().process_frame
	if not (path.begins_with("res://") or path.begins_with("user://")):
		var parent := path.get_base_dir()
		if not parent.is_empty():
			DirAccess.make_dir_recursive_absolute(parent)
	var image: Image = viewport.get_texture().get_image()
	if image == null:
		printerr("capture: viewport texture unavailable")
		return ERR_UNAVAILABLE
	return image.save_png(path)
