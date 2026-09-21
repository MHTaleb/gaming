extends SceneTree
## Deterministic hero animation - young man with a laptop (RZ-036).
##
##   cd runtime-zero
##   source tools/env.sh
##   godot --headless --path game --script "$PWD/tools/make_character_anim.gd"
##   # optional review sheet:
##   godot --headless --path game --script "$PWD/tools/make_character_anim.gd" -- \
##       --sheet /tmp/rz-hero-anim.png
##
## Writes (all 128 px tall frames, horizontal sheets):
##   game/assets/characters/operator.png        single idle frame (combat hero)
##   game/assets/characters/operator_idle.png   2-frame idle sheet  (bob + screen)
##   game/assets/characters/operator_walk.png   6-frame walk cycle  (right-facing)
## Same contract as the other placeholder generators: pure math + integer hashes,
## no downloads, byte-identical on re-run. Facing left is done by flip_h.

const SIZE := 128
const OUT_DIR := "res://assets/characters"
const WALK_FRAMES := 6

# Palette - young field engineer: hoodie, dark trousers, glowing laptop.
const SKIN := Color(0.88, 0.73, 0.60)
const SKIN_SHADE := Color(0.76, 0.60, 0.48)
const HAIR := Color(0.17, 0.12, 0.08)
const JACKET := Color(0.13, 0.28, 0.38)
const JACKET_DARK := Color(0.09, 0.20, 0.28)
const TRIM := Color(0.35, 0.85, 1.0)
const PANTS := Color(0.15, 0.15, 0.20)
const SHOES := Color(0.10, 0.10, 0.13)
const LAPTOP := Color(0.22, 0.24, 0.28)
const SCREEN := Color(0.45, 0.90, 1.0)
const STRAP := Color(0.26, 0.19, 0.12)

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	_make_dir()
	var walk := _walk_sheet()
	var idle := _idle_sheet()
	var hero := _frame(0.0, 0.0, false)
	var files := {
		"operator": hero,
		"operator_idle": idle,
		"operator_walk": walk,
	}
	for name in files:
		var image: Image = files[name]
		var path: String = OUT_DIR + "/" + str(name) + ".png"
		var err: Error = image.save_png(path)
		if err != OK:
			printerr("hero anim: save failed for ", path, ": ", err)
			continue
		print("hero anim: %s sha256=%s" % [path, FileAccess.get_sha256(path)])
	var sheet := _arg_value(args, "--sheet")
	if not sheet.is_empty():
		var err2: Error = _review_sheet(walk, idle).save_png(sheet)
		print("hero anim: sheet %s err=%d" % [sheet, err2])
	quit(0)

func _make_dir() -> void:
	var dir := DirAccess.open("res://")
	if dir != null and not dir.dir_exists("assets/characters"):
		dir.make_dir_recursive("assets/characters")

func _arg_value(args: PackedStringArray, flag: String) -> String:
	for index in args.size():
		if args[index] == flag and index + 1 < args.size():
			return args[index + 1]
	return ""

# ------------------------------------------------------------------ sheets

func _walk_sheet() -> Image:
	var sheet := Image.create_empty(SIZE * WALK_FRAMES, SIZE, false, Image.FORMAT_RGBA8)
	for i in WALK_FRAMES:
		# Two full strides across six frames: contact, pass, contact, pass...
		var phase: float = TAU * float(i) / float(WALK_FRAMES)
		var swing: float = sin(phase)
		var image := _frame(swing, 0.0, false)
		sheet.blit_rect(image, Rect2i(0, 0, SIZE, SIZE), Vector2i(i * SIZE, 0))
	return sheet

func _idle_sheet() -> Image:
	var sheet := Image.create_empty(SIZE * 2, SIZE, false, Image.FORMAT_RGBA8)
	sheet.blit_rect(_frame(0.0, 0.0, false), Rect2i(0, 0, SIZE, SIZE), Vector2i(0, 0))
	sheet.blit_rect(_frame(0.0, 1.2, true), Rect2i(0, 0, SIZE, SIZE), Vector2i(SIZE, 0))
	return sheet

func _review_sheet(walk: Image, idle: Image) -> Image:
	var sheet := Image.create_empty(SIZE * (WALK_FRAMES + 2), SIZE, false, Image.FORMAT_RGBA8)
	sheet.fill(Color(0.06, 0.07, 0.1))
	sheet.blit_rect(walk, Rect2i(0, 0, SIZE * WALK_FRAMES, SIZE), Vector2i(0, 0))
	sheet.blit_rect(idle, Rect2i(0, 0, SIZE * 2, SIZE), Vector2i(SIZE * WALK_FRAMES, 0))
	return sheet

# ------------------------------------------------------------------ painter

func _c(x: float, y: float, r: float) -> Dictionary:
	return {"k": "circle", "x": x, "y": y, "r": r}

func _r(x: float, y: float, hw: float, hh: float, rad: float) -> Dictionary:
	return {"k": "rrect", "x": x, "y": y, "hw": hw, "hh": hh, "rad": rad}

func _s(ax: float, ay: float, bx: float, by: float, th: float) -> Dictionary:
	return {"k": "seg", "ax": ax, "ay": ay, "bx": bx, "by": by, "th": th}

func _sdf(shape: Dictionary, px: float, py: float) -> float:
	match str(shape.k):
		"circle":
			return Vector2(px - shape.x, py - shape.y).length() - shape.r
		"rrect":
			var qx: float = absf(px - shape.x) - (shape.hw - shape.rad)
			var qy: float = absf(py - shape.y) - (shape.hh - shape.rad)
			var outside := Vector2(maxf(qx, 0.0), maxf(qy, 0.0)).length()
			return outside + minf(maxf(qx, qy), 0.0) - shape.rad
		"seg":
			var ap := Vector2(px - shape.ax, py - shape.ay)
			var ab := Vector2(shape.bx - shape.ax, shape.by - shape.ay)
			var t: float = clampf(ap.dot(ab) / ab.length_squared(), 0.0, 1.0)
			return (ap - ab * t).length() - shape.th
	return 1e9

func _paint(image: Image, shapes: Array, color: Color, alpha: float,
		grow := 0.0, soft := 1.4) -> void:
	for y in SIZE:
		for x in SIZE:
			var d := 1e9
			for shape in shapes:
				d = minf(d, _sdf(shape, float(x) + 0.5, float(y) + 0.5))
			if d - grow > soft:
				continue
			var coverage: float = clampf(0.5 - (d - grow) / soft, 0.0, 1.0)
			if coverage > 0.0:
				_blend(image, x, y, color, coverage * alpha)

func _blend(image: Image, x: int, y: int, color: Color, a: float) -> void:
	if a <= 0.0:
		return
	var under := image.get_pixel(x, y)
	var out_a: float = a + under.a * (1.0 - a)
	if out_a <= 0.0:
		image.set_pixel(x, y, Color(0, 0, 0, 0))
		return
	var r := (color.r * a + under.r * under.a * (1.0 - a)) / out_a
	var g := (color.g * a + under.g * under.a * (1.0 - a)) / out_a
	var b := (color.b * a + under.b * under.a * (1.0 - a)) / out_a
	image.set_pixel(x, y, Color(r, g, b, out_a))

## One 128x128 frame. swing in [-1, 1]: -1 left foot forward, +1 right forward.
## bob drops the upper body on contact; glow dims the screen (idle breath).
func _frame(swing: float, bob: float, dim_screen: bool) -> Image:
	var image := Image.create_empty(SIZE, SIZE, false, Image.FORMAT_RGBA8)
	var lift: float = -2.0 * (1.0 - absf(swing)) + bob
	var hip_y := 86.0 + lift
	var shoulder_y := 52.0 + lift
	var head_y := 30.0 + lift
	# Ground shadow (stays planted while the body bobs).
	_paint(image, [_r(64, 121, 17, 3.2, 3)], Color(0.02, 0.02, 0.03), 0.45, -1.0, 2.0)
	# Back leg (opposite phase), slightly darker.
	_paint(image, [
		_s(66, hip_y, 66 + 11.0 * -swing, hip_y + 15.0, 3.6),
		_s(66 + 11.0 * -swing, hip_y + 15.0, 64 + 6.0 * -swing, 116.0 + 1.5 * absf(swing), 3.0),
		_r(64 + 8.0 * -swing, 119.0, 6.0, 2.6, 2.0),
	], PANTS.darkened(0.25), 1.0)
	# Front leg.
	_paint(image, [
		_s(62, hip_y, 62 + 11.0 * swing, hip_y + 15.0, 3.8),
		_s(62 + 11.0 * swing, hip_y + 15.0, 60 + 7.0 * swing, 116.0 + 1.5 * absf(swing), 3.2),
		_r(60 + 8.0 * swing, 119.0, 6.4, 2.8, 2.0),
	], PANTS, 1.0)
	_paint(image, [_r(60 + 8.0 * swing, 119.0, 6.4, 2.8, 2.0)], SHOES, 0.9)
	_paint(image, [_r(64 + 8.0 * -swing, 119.0, 6.0, 2.6, 2.0)], SHOES.darkened(0.2), 0.9)
	# Torso: hoodie with zip line and hood collar.
	_paint(image, [_r(64, (shoulder_y + hip_y) * 0.5 + 3.0, 13.0, 19.5, 8.0)], JACKET, 1.0)
	_paint(image, [_r(64, shoulder_y + 1.0, 10.5, 5.0, 3.0)], JACKET_DARK, 1.0)
	_paint(image, [_s(64, shoulder_y + 5.0, 64, hip_y - 1.0, 1.1)], TRIM, 0.75)
	# Messenger bag strap across the chest.
	_paint(image, [_s(57, shoulder_y + 2.0, 72, hip_y - 6.0, 2.0)], STRAP, 0.9)
	# Back arm swings with the opposite leg.
	_paint(image, [
		_s(55, shoulder_y + 4.0, 51 + 9.0 * -swing, shoulder_y + 16.0, 3.4),
		_s(51 + 9.0 * -swing, shoulder_y + 16.0, 54 + 13.0 * -swing, shoulder_y + 27.0, 2.8),
		_c(55 + 13.0 * -swing, shoulder_y + 28.0, 3.0),
	], JACKET, 1.0)
	# Front arm hugs the laptop.
	_paint(image, [
		_s(73, shoulder_y + 4.0, 80, shoulder_y + 13.0, 3.4),
		_s(80, shoulder_y + 13.0, 79, shoulder_y + 22.0, 2.8),
		_c(79, shoulder_y + 23.0, 3.0),
	], JACKET, 1.0)
	# Laptop: open, screen toward the hero (we see the back and the glow edge).
	_paint(image, [_r(86, (shoulder_y + 9.0), 9.0, 7.0, 1.5)], LAPTOP, 1.0)
	_paint(image, [_r(89.5, (shoulder_y + 8.0), 4.6, 5.4, 1.0)], SCREEN,
		0.55 if dim_screen else 0.9)
	_paint(image, [_r(86, (shoulder_y + 17.0), 10.0, 2.0, 1.0)], LAPTOP.darkened(0.15), 1.0)
	_paint(image, [_c(93.5, shoulder_y + 17.5, 1.4)], Color(1.0, 0.72, 0.3), 0.9)
	# Head: hair cap under the face circle, ear, eyes, small smile.
	_paint(image, [_c(63, head_y - 2.0, 11.5)], HAIR, 1.0)
	_paint(image, [_r(60, head_y - 8.0, 9.0, 3.4, 3.0)], HAIR, 1.0)
	_paint(image, [_c(65.5, head_y + 2.5, 10.0)], SKIN, 1.0)
	_paint(image, [_c(72.5, head_y + 3.5, 2.2)], SKIN_SHADE, 0.9)
	_paint(image, [_c(68.5, head_y + 1.0, 1.25), _c(73.5, head_y + 1.0, 1.25)],
		Color(0.10, 0.09, 0.10), 0.95)
	_paint(image, [_s(69.0, head_y + 6.0, 73.5, head_y + 6.0, 0.7)], SKIN_SHADE, 0.7)
	return image
