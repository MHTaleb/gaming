extends SceneTree
## Deterministic procedural enemy art (RZ-034; operator/hero frames come from
## tools/make_character_anim.gd since RZ-036):
##   game/assets/characters/{memory_leak,server_cathedral}.png

const SIZE := 128
const OUT_DIR := "res://assets/characters"

# Palette (matches tools/make_landing_art.gd).
const NAVY := Color(0.10, 0.13, 0.21)
const NAVY_LIGHT := Color(0.15, 0.19, 0.30)
const DARK := Color(0.05, 0.07, 0.11)
const CYAN := Color(0.35, 0.85, 1.0)
const CYAN_BRIGHT := Color(0.72, 0.95, 1.0)
const AMBER := Color(1.0, 0.72, 0.3)
const VIOLET := Color(0.34, 0.17, 0.36)

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	_make_dir()
	var results := {
		"memory_leak": _paint_memory_leak(),
		"server_cathedral": _paint_server_cathedral(),
	}
	var ok := true
	for name in results:
		var image: Image = results[name]
		var path: String = OUT_DIR + "/" + str(name) + ".png"
		var err: Error = image.save_png(path)
		if err != OK:
			printerr("combat art: save failed for ", path, ": ", err)
			ok = false
			continue
		print("combat art: %s sha256=%s" % [path, FileAccess.get_sha256(path)])
	var sheet := _arg_value(args, "--sheet")
	if not sheet.is_empty():
		var err2: Error = _contact_sheet(results).save_png(sheet)
		print("combat art: sheet %s err=%d" % [sheet, err2])
	quit(0 if ok else 1)

func _make_dir() -> void:
	var dir := DirAccess.open("res://")
	if dir != null and not dir.dir_exists("assets/characters"):
		dir.make_dir_recursive("assets/characters")

func _arg_value(args: PackedStringArray, flag: String) -> String:
	for index in args.size():
		if args[index] == flag and index + 1 < args.size():
			return args[index + 1]
	return ""

# ------------------------------------------------------------------ shapes

func _c(x: float, y: float, r: float) -> Dictionary:
	return {"k": "circle", "x": x, "y": y, "r": r}

func _r(x: float, y: float, hw: float, hh: float, rad: float) -> Dictionary:
	return {"k": "rrect", "x": x, "y": y, "hw": hw, "hh": hh, "rad": rad}

func _s(ax: float, ay: float, bx: float, by: float, th: float) -> Dictionary:
	return {"k": "seg", "ax": ax, "ay": ay, "bx": bx, "by": by, "th": th}

func _cone(cx: float, y_top: float, y_base: float, half_base: float) -> Dictionary:
	return {"k": "cone", "x": cx, "y_top": y_top, "y_base": y_base, "hb": half_base}

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
		"cone":
			var halfw: float = (py - shape.y_top) * (shape.hb / (shape.y_base - shape.y_top))
			return maxf(absf(px - shape.x) - halfw,
				maxf(shape.y_top - py, py - shape.y_base))
	return 1e9

## Union coverage of a shape list with anti-aliasing, blended src-over.
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

func _hash01(a: int, b: int) -> float:
	var h := a * 73856093 ^ b * 19349663
	h = (h ^ (h >> 13)) * 1274126177
	h = h ^ (h >> 16)
	return float(abs(h) % 100000) / 100000.0

# ------------------------------------------------------------------ sprites

## Memory Leak - wobbling violet blob with amber eyes and data drips.
func _paint_memory_leak() -> Image:
	var image := Image.create_empty(SIZE, SIZE, false, Image.FORMAT_RGBA8)
	var body: Array = [
		_c(64, 66, 29), _c(46, 76, 15), _c(84, 74, 14), _c(62, 90, 15),
		_c(50, 58, 10), _c(80, 56, 11),
	]
	_paint(image, [_r(64, 120, 22, 4, 3)], DARK, 0.4, -1.0, 2.0)
	_paint(image, body, AMBER, 0.16, 2.4, 2.0)
	_paint(image, body, VIOLET, 1.0)
	# Eyes with dark pupils and angry brows.
	_paint(image, [_c(54, 62, 5.2), _c(74, 62, 5.2)], AMBER, 0.95)
	_paint(image, [_c(55, 63, 2.2), _c(75, 63, 2.2)], DARK, 1.0)
	_paint(image, [_s(46, 52, 60, 56, 1.6), _s(82, 52, 68, 56, 1.6)], DARK, 0.8)
	# Drips with droplets.
	var drips: Array = [
		_s(48, 96, 48, 112, 2.0), _s(60, 102, 60, 118, 2.0),
		_s(72, 100, 72, 114, 2.0), _s(84, 92, 84, 106, 2.0),
	]
	_paint(image, drips, VIOLET, 0.9)
	_paint(image, [_c(48, 114, 2.0), _c(60, 120, 2.0), _c(72, 116, 2.0),
		_c(84, 108, 2.0)], AMBER, 0.6)
	# Data sparks inside the blob (deterministic).
	for i in 22:
		var x := int(40 + _hash01(i, 71) * 48)
		var y := int(46 + _hash01(i, 73) * 48)
		_blend(image, x, y, CYAN, 0.35)
		if _hash01(i, 79) > 0.6:
			_blend(image, x + 1, y, CYAN, 0.2)
	return image

## Server Cathedral - boss: dark tower, spire, amber windows, glowing gate.
func _paint_server_cathedral() -> Image:
	var image := Image.create_empty(SIZE, SIZE, false, Image.FORMAT_RGBA8)
	var tower: Array = [
		_r(64, 88, 28, 44, 5), _r(64, 124, 33, 4, 2), _r(64, 117, 30, 3, 2),
		_s(36, 74, 30, 112, 3.2), _s(92, 74, 98, 112, 3.2),
		_c(30, 114, 2.6), _c(98, 114, 2.6),
	]
	_paint(image, [_r(64, 126, 34, 4, 2)], DARK, 0.4, -1.0, 2.0)
	_paint(image, tower, CYAN, 0.16, 2.2, 2.0)
	_paint(image, [_cone(64, 10, 46, 22)], CYAN, 0.16, 2.2, 2.0)
	_paint(image, tower, NAVY, 1.0)
	_paint(image, [_cone(64, 10, 46, 22)], NAVY, 1.0)
	# Spire slots and a scan line.
	_paint(image, [_s(64, 18, 64, 42, 1.1)], CYAN, 0.55)
	_paint(image, [_s(57, 26, 57, 40, 1.0), _s(71, 26, 71, 40, 1.0)], CYAN, 0.32)
	# Amber windows.
	var windows: Array = [
		_r(52, 64, 2.2, 3.4, 1.0), _r(64, 64, 2.2, 3.4, 1.0), _r(76, 64, 2.2, 3.4, 1.0),
		_r(52, 82, 2.2, 3.4, 1.0), _r(76, 82, 2.2, 3.4, 1.0), _r(64, 82, 2.2, 3.4, 1.0),
	]
	_paint(image, windows, AMBER, 0.8)
	# Gate: dark arch with a cyan core.
	_paint(image, [_c(64, 108, 9.0), _r(64, 114, 9.0, 10.0, 2.0)], DARK, 1.0)
	_paint(image, [_c(64, 106, 3.4)], CYAN, 0.85)
	_paint(image, [_s(64, 100, 64, 112, 0.9)], CYAN_BRIGHT, 0.5)
	return image

# ------------------------------------------------------------------ sheet

func _contact_sheet(sprites: Dictionary) -> Image:
	var order := ["operator", "memory_leak", "server_cathedral"]
	var sheet := Image.create_empty(SIZE * order.size(), SIZE, false, Image.FORMAT_RGBA8)
	sheet.fill(Color(0.05, 0.06, 0.09))
	for i in order.size():
		var sprite: Image = sprites[order[i]]
		sheet.blit_rect(sprite, Rect2i(0, 0, SIZE, SIZE), Vector2i(i * SIZE, 0))
	return sheet
