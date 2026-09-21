extends SceneTree
## Deterministic stage backdrops - one painted region per encounter (RZ-037).
##
##   cd runtime-zero
##   source tools/env.sh
##   godot --headless --path game --script "$PWD/tools/make_stage_art.gd"
##
## Writes game/assets/backdrops/{intrusion,load_spike,server_cathedral}.png
## (1280x720 RGBA8) and prints sha256. Same contract as the other placeholder
## generators: pure math, no randomness, byte-identical on re-run; the RZ-016+
## pipeline can replace any of them with reviewed generated art.

const WIDTH := 1280
const HEIGHT := 720
const OUT_DIR := "res://assets/backdrops"

const CYAN := Color(0.35, 0.85, 1.0)
const AMBER := Color(1.0, 0.72, 0.3)
const VIOLET := Color(0.75, 0.35, 0.95)
const MAGENTA := Color(0.95, 0.25, 0.55)

func _initialize() -> void:
	var dir := DirAccess.open("res://")
	if dir != null and not dir.dir_exists("assets/backdrops"):
		dir.make_dir_recursive("assets/backdrops")
	var stages := {
		"intrusion": _paint_intrusion(),
		"load_spike": _paint_load_spike(),
		"server_cathedral": _paint_server_cathedral(),
	}
	for name in stages:
		var image: Image = stages[name]
		var path: String = OUT_DIR + "/" + str(name) + ".png"
		var err: Error = image.save_png(path)
		if err != OK:
			printerr("stage art: save failed for ", path, ": ", err)
			continue
		print("stage art: %s sha256=%s" % [path, FileAccess.get_sha256(path)])
	quit(0)

# ------------------------------------------------------------------ helpers

func _hash01(a: int, b: int) -> float:
	var h := a * 73856093 ^ b * 196314165
	h = (h ^ (h >> 13)) * 1274126177
	h = h ^ (h >> 16)
	return float(abs(h) % 100000) / 100000.0

func _mix(image: Image, x: int, y: int, color: Color, alpha: float) -> void:
	if x < 0 or x >= WIDTH or y < 0 or y >= HEIGHT:
		return
	var under := image.get_pixel(x, y)
	var a := clampf(alpha, 0.0, 1.0)
	image.set_pixel(x, y, Color(
		under.r + (color.r - under.r) * a,
		under.g + (color.g - under.g) * a,
		under.b + (color.b - under.b) * a,
		1.0))

## Vertical gradient sky: rows from top color to horizon color.
func _sky(image: Image, top: Color, horizon: Color, horizon_y: int, power := 1.5) -> void:
	for y in horizon_y:
		var t: float = pow(float(y) / float(horizon_y), power)
		var c := top.lerp(horizon, t)
		for x in WIDTH:
			image.set_pixel(x, y, c)

func _ground(image: Image, horizon_y: int, near: Color, far: Color) -> void:
	for y in range(horizon_y, HEIGHT):
		var t: float = float(y - horizon_y) / float(HEIGHT - horizon_y)
		var c := far.lerp(near, pow(t, 0.8))
		for x in WIDTH:
			image.set_pixel(x, y, c)

## Glow band centered on the horizon.
func _horizon_glow(image: Image, y_center: int, color: Color, strength := 0.18) -> void:
	for y in range(y_center - 40, y_center + 44):
		var d: float = absf(float(y - y_center)) / 42.0
		var alpha: float = strength * (1.0 - d)
		if alpha <= 0.0:
			continue
		for x in WIDTH:
			var cx: float = 1.0 - absf(float(x) / float(WIDTH - 1) - 0.5) * 1.5
			if cx > 0.0:
				_mix(image, x, y, color, alpha * cx)

## Vignette + subtle scanlines (shared finishing pass).
func _finish(image: Image, strength := 0.34) -> void:
	var cx := WIDTH * 0.5
	var cy := HEIGHT * 0.5
	var max_d: float = sqrt(cx * cx + cy * cy)
	for y in HEIGHT:
		var dy := y - cy
		var scan := 0.985 if y % 3 == 0 else 1.0
		for x in WIDTH:
			var dx := x - cx
			var d: float = sqrt(dx * dx + dy * dy) / max_d
			var v: float = (1.0 - strength * pow(d, 2.1)) * scan
			var c := image.get_pixel(x, y)
			image.set_pixel(x, y, Color(c.r * v, c.g * v, c.b * v, 1.0))

# ------------------------------------------------------------------ stages

## Region 1 - Intrusion: a rain-dark corporate skyline, cyan windows everywhere.
func _paint_intrusion() -> Image:
	var image := Image.create_empty(WIDTH, HEIGHT, false, Image.FORMAT_RGBA8)
	_sky(image, Color(0.028, 0.04, 0.075), Color(0.09, 0.14, 0.24), 430)
	_ground(image, 430, Color(0.03, 0.045, 0.075), Color(0.06, 0.09, 0.14))
	_horizon_glow(image, 430, CYAN, 0.16)
	# Two skyline clusters + one centre tower; lit windows via hash.
	_cluster(image, 20, 420, 8, 60, 230)
	_cluster(image, 880, 1270, 8, 70, 260)
	_tower(image, 640, 150, 74, 430)
	for i in 260:
		var x := int(_hash01(i, 29) * WIDTH)
		var y := int(_hash01(i, 31) * 400)
		_mix(image, x, y, CYAN, 0.03 + 0.25 * _hash01(i, 37) * _hash01(i, 37))
	# Faint radial floor lines, vanishing at the gate.
	for k in range(-9, 10):
		var fx := 640.0 + k * 96.0
		for y in range(470, HEIGHT):
			var g := float(y - 470) / float(HEIGHT - 470)
			var x := int(round(640.0 + (fx - 640.0) * g * 1.6))
			_mix(image, x, y, CYAN, 0.05 * (1.0 - g))
	_finish(image)
	return image

func _cluster(image: Image, x_start: int, x_end: int, count: int, min_h: int, max_h: int) -> void:
	var span := x_end - x_start
	for i in count:
		var x := x_start + int(span * (float(i) + 0.2 + 0.6 * _hash01(i, 3)) / float(count))
		var w := 40 + int(60 * _hash01(i, 7))
		var h := min_h + int((max_h - min_h) * _hash01(i, 11))
		_tower(image, x + w / 2, h, w, 430)

func _tower(image: Image, cx: int, h: int, w: int, base_y: int) -> void:
	var top := base_y - h
	var body := Color(0.012, 0.018, 0.032)
	for y in range(top, base_y):
		for x in range(cx - w / 2, cx + w / 2):
			_mix(image, x, y, body, 0.94)
	for x in range(cx - w / 2, cx + w / 2):
		_mix(image, x, top, CYAN, 0.14)
	# Window grid.
	var cols: int = maxi(2, w / 18)
	var rows: int = maxi(3, h / 22)
	for cxi in cols:
		for cyi in rows:
			var wx := cx - w / 2 + 6 + cxi * 18
			var wy := top + 10 + cyi * 22
			if wx >= cx + w / 2 - 3:
				continue
			var hv := _hash01(cx * 131 + cxi, cyi * 17 + 5)
			if hv > 0.80:
				_mix(image, wx, wy, CYAN, 0.55)
				_mix(image, wx + 1, wy, CYAN, 0.3)
			elif hv > 0.74:
				_mix(image, wx, wy, AMBER, 0.4)
			else:
				_mix(image, wx, wy, Color(0.05, 0.08, 0.13), 0.4)

## Region 2 - Load Spike: a corrupted data plain, glitch bands and spike ruins.
func _paint_load_spike() -> Image:
	var image := Image.create_empty(WIDTH, HEIGHT, false, Image.FORMAT_RGBA8)
	_sky(image, Color(0.09, 0.025, 0.12), Color(0.34, 0.08, 0.30), 420, 2.0)
	_ground(image, 420, Color(0.10, 0.03, 0.12), Color(0.22, 0.05, 0.20))
	_horizon_glow(image, 420, MAGENTA, 0.22)
	# Jagged spike ruins along the horizon.
	for i in 14:
		var cx := int(30 + _hash01(i, 13) * 1220)
		var h := 60 + int(200 * _hash01(i, 17))
		var w := 14 + int(30 * _hash01(i, 19))
		_spike(image, cx, h, w, 424)
	# Broken data grid: sparse dashed lines with occasional shifts.
	for row in 9:
		var y := 470 + row * 26
		var dash := 26 + int(14 * _hash01(row, 23))
		var shift := int(40 * (_hash01(row, 29) - 0.5))
		var x := shift
		while x < WIDTH:
			var seg := 8 + int(10 * _hash01(x / 7 + row, 31))
			for sx in range(x, mini(x + seg, WIDTH)):
				_mix(image, sx, y, VIOLET, 0.12)
			x += dash
	# Glitch bands: horizontal slices shifted sideways.
	for i in 7:
		var by := 60 + int(_hash01(i, 41) * 520)
		var bh := 2 + int(_hash01(i, 43) * 5)
		var off := int((_hash01(i, 47) - 0.5) * 60)
		var tint: Color = CYAN if i % 3 == 0 else MAGENTA
		for y in range(by, by + bh):
			for x in WIDTH:
				var src_x: int = clampi(x + off, 0, WIDTH - 1)
				var under := image.get_pixel(src_x, y)
				image.set_pixel(x, y, Color(
					under.r * 0.6 + tint.r * 0.4 * 0.5,
					under.g * 0.6 + tint.g * 0.4 * 0.5,
					under.b * 0.6 + tint.b * 0.4 * 0.5, 1.0))
	# Floating debris sparks.
	for i in 120:
		var x := int(_hash01(i, 53) * WIDTH)
		var y := int(80 + _hash01(i, 59) * 430)
		_mix(image, x, y, AMBER, 0.05 + 0.3 * _hash01(i, 61) * _hash01(i, 61))
	_finish(image, 0.38)
	return image

func _spike(image: Image, cx: int, h: int, w: int, base_y: int) -> void:
	var top := base_y - h
	var body := Color(0.05, 0.02, 0.07)
	for y in range(top, base_y):
		var t := float(y - top) / float(h)
		var half := int(w * (1.0 - t) * 0.5) + 2
		for x in range(cx - half, cx + half):
			_mix(image, x, y, body, 0.95)
	for x in range(cx - w / 2, cx + w / 2):
		_mix(image, x, top + 2, VIOLET, 0.12)

## Region 3 - Server Cathedral: a monumental gate hall, amber rows, cyan core.
func _paint_server_cathedral() -> Image:
	var image := Image.create_empty(WIDTH, HEIGHT, false, Image.FORMAT_RGBA8)
	_sky(image, Color(0.015, 0.025, 0.05), Color(0.05, 0.09, 0.18), 400, 1.8)
	_ground(image, 400, Color(0.02, 0.03, 0.06), Color(0.04, 0.06, 0.11))
	_horizon_glow(image, 400, CYAN, 0.14)
	# Colossal arch: two pillars + arch band + inner darkness.
	_pillar(image, 300, 120, 110, 560)
	_pillar(image, 980, 120, 110, 560)
	for x in range(300, 981):
		var t: float = (float(x) - 300.0) / 680.0
		var lift := int(46.0 * sin(PI * t))
		var y := 150 - lift
		for dy in range(-16, 17):
			_mix(image, x, y + dy, Color(0.03, 0.045, 0.08), 0.95)
		_mix(image, x, y - 16, CYAN, 0.10)
	# Blinkenlight LED grids embedded in the pillars.
	for side: int in [300, 980]:
		for row in 8:
			var wy := 186 + row * 42
			for col in 8:
				var wx := side - 44 + col * 11
				var lit := _hash01(row * 11 + col, side)
				if lit > 0.55:
					var led := AMBER if lit > 0.86 else CYAN
					_mix(image, wx, wy, led, 0.25 + 0.5 * (lit - 0.55))
					_mix(image, wx, wy + 1, led, 0.18)
	# Edge highlight where the pillars face the aisle.
	for y in range(128, 560):
		_mix(image, 354, y, CYAN, 0.05)
		_mix(image, 926, y, CYAN, 0.05)
	# Cross-ribs of the vaulted ceiling.
	for rib in 3:
		var ry := 60 + rib * 26
		for x in range(300, 981):
			var rt: float = (float(x) - 300.0) / 680.0
			var sag := int(8.0 * sin(PI * rt))
			_mix(image, x, ry + sag, Color(0.03, 0.05, 0.09), 0.7)
	# Central energy core beam rising from the gate.
	for x in range(600, 681):
		var d: float = absf(float(x) - 640.0) / 41.0
		var alpha: float = 0.34 * (1.0 - d)
		if alpha <= 0.0:
			continue
		for y in range(180, 640):
			var fall: float = 1.0 - float(y - 180) / 460.0 * 0.55
			_mix(image, x, y, CYAN, alpha * fall)
	# Perspective rows of server racks flanking the aisle.
	for r in 4:
		_rack_row(image, -1, r)
		_rack_row(image, 1, r)
	# Central aisle runner with cyan edge lights.
	for x in range(608, 673):
		var ad: float = absf(float(x) - 640.0) / 33.0
		for y in range(560, HEIGHT):
			_mix(image, x, y, Color(0.03, 0.05, 0.09), 0.5 * (1.0 - ad))
	for y in range(566, HEIGHT, 6):
		_mix(image, 608, y, CYAN, 0.10)
		_mix(image, 672, y, CYAN, 0.10)
	# Steps and reflection band on the floor.
	for step in 4:
		var sy := 560 + step * 22
		_mix_line(image, 300 - step * 60, 980 + step * 60, sy, Color(0.05, 0.07, 0.12), 0.5)
	for i in 90:
		var x := int(340 + _hash01(i, 71) * 600)
		var y := int(600 + _hash01(i, 73) * 110)
		_mix(image, x, y, CYAN, 0.04 + 0.18 * _hash01(i, 79) * _hash01(i, 79))
	_finish(image, 0.4)
	return image

func _pillar(image: Image, cx: int, top: int, w: int, base_y: int) -> void:
	var body := Color(0.02, 0.03, 0.055)
	for y in range(top, base_y):
		for x in range(cx - w / 2, cx + w / 2):
			_mix(image, x, y, body, 0.96)
	for x in range(cx - w / 2, cx + w / 2):
		_mix(image, x, top, CYAN, 0.12)
	_mix_line(image, cx - w / 2, cx + w / 2, top + 8, AMBER, 0.18)

func _rack_row(image: Image, s: int, r: int) -> void:
	var y_base := 548 + r * 34
	var rack_h := 22 + r * 9
	var rack_w := 10 + r * 3
	var gap := 18 + r * 6
	var inner := 96 + r * 26
	for k in 5:
		var cx := 640 + s * (inner + k * (rack_w + gap))
		var x0 := cx - rack_w / 2
		for y in range(y_base - rack_h, y_base):
			for x in range(x0, x0 + rack_w):
				_mix(image, x, y, Color(0.028, 0.045, 0.075), 0.92)
		var step := maxi(2, rack_w / 3)
		for li in 3:
			var lx := x0 + 2 + li * step
			var color := AMBER if _hash01(k * 7 + li, r * 13 + s + 5) > 0.62 else CYAN
			_mix(image, lx, y_base - rack_h + 3, color, 0.55)
		for y in range(y_base - rack_h, y_base):
			_mix(image, x0, y, CYAN, 0.07)
		for rr in 10:
			_mix(image, cx, y_base + 1 + rr, CYAN, 0.06 * (1.0 - float(rr) / 10.0))

func _mix_line(image: Image, x0: int, x1: int, y: int, color: Color, alpha: float) -> void:
	for x in range(x0, x1):
		_mix(image, x, y, color, alpha)
