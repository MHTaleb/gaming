extends SceneTree
## Deterministic procedural landing background - placeholder key art (RZ-032).
##
##   cd runtime-zero
##   source tools/env.sh
##   godot --headless --path game --script "$PWD/tools/make_landing_art.gd"
##
## Writes game/assets/branding/landing_background.png (1280x720, RGBA8) and
## prints its sha256. Pure math and integer hashes: no randomness, no external
## tools, no model downloads; re-running reproduces the identical PNG.
##
## This is placeholder art, explicitly allowed by docs/ART_BIBLE.md ("flat
## layered shapes") and it follows the palette contract: graphite/navy
## background, cyan technology accents, amber warnings, no UI-like text. The
## RZ-016+ graphics pipeline replaces it with generated, reviewed art.

const WIDTH := 1280
const HEIGHT := 720
const HORIZON := 432
const OUTPUT := "res://assets/branding/landing_background.png"

const SKY_TOP := Color(0.043, 0.055, 0.094)
const SKY_HORIZON := Color(0.086, 0.121, 0.196)
const GROUND_HORIZON := Color(0.031, 0.043, 0.071)
const GROUND_BOTTOM := Color(0.016, 0.022, 0.038)
const CYAN := Color(0.35, 0.85, 1.0)
const AMBER := Color(1.0, 0.72, 0.3)
const TOWER_DARK := Color(0.012, 0.016, 0.028)
const WINDOW_DARK := Color(0.06, 0.09, 0.14)

func _initialize() -> void:
	var image := Image.create_empty(WIDTH, HEIGHT, false, Image.FORMAT_RGBA8)
	_paint_backdrop(image)
	_paint_horizon_glow(image)
	_paint_grid(image)
	_paint_skyline(image)
	_paint_motes(image)
	_paint_vignette_and_scanlines(image)
	var dir := DirAccess.open("res://")
	if dir != null and not dir.dir_exists("assets/branding"):
		dir.make_dir_recursive("assets/branding")
	var err := image.save_png(OUTPUT)
	if err != OK:
		printerr("landing art: save failed: ", err)
		quit(1)
		return
	print("landing art written: ", ProjectSettings.globalize_path(OUTPUT))
	print("landing art sha256: ", FileAccess.get_sha256(OUTPUT))
	quit(0)

# ------------------------------------------------------------------ helpers

## Deterministic 0..1 hash for grid-free "random" detail placement.
func _hash01(a: int, b: int) -> float:
	var h := a * 73856093 ^ b * 19349663
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

# ------------------------------------------------------------------ layers

## One full pass: sky/ground gradient with a subtle horizontal falloff.
func _paint_backdrop(image: Image) -> void:
	var edge := PackedFloat32Array()
	edge.resize(WIDTH)
	for x in WIDTH:
		var e: float = absf(float(x) / float(WIDTH - 1) - 0.5) * 2.0
		edge[x] = 1.0 - 0.18 * e * e
	for y in HEIGHT:
		var base: Color
		if y <= HORIZON:
			base = SKY_TOP.lerp(SKY_HORIZON, pow(float(y) / float(HORIZON), 1.6))
		else:
			var g := float(y - HORIZON) / float(HEIGHT - HORIZON)
			base = GROUND_HORIZON.lerp(GROUND_BOTTOM, pow(g, 0.75))
		for x in WIDTH:
			image.set_pixel(x, y, Color(base.r * edge[x], base.g * edge[x],
				base.b * edge[x], 1.0))

## A restrained cyan light band on the horizon (one consistent light source).
func _paint_horizon_glow(image: Image) -> void:
	for y in range(HORIZON - 26, HORIZON + 30):
		var d: float = absf(float(y - HORIZON)) / 28.0
		var alpha: float = 0.10 * (1.0 - d)
		if alpha <= 0.0:
			continue
		for x in WIDTH:
			var cx: float = 1.0 - absf(float(x) / float(WIDTH - 1) - 0.5) * 1.6
			if cx > 0.0:
				_mix(image, x, y, CYAN, alpha * cx)

## Perspective floor: radial lines to a vanishing point plus receding rows.
func _paint_grid(image: Image) -> void:
	var vx := float(WIDTH) / 2.0
	for k in range(-11, 12):
		var fx := vx + k * 118.0
		for y in range(HORIZON, HEIGHT):
			var g := float(y - HORIZON) / float(HEIGHT - HORIZON)
			var x := int(round(vx + (fx - vx) * g))
			var alpha := 0.055 * (1.0 - 0.85 * g)
			_mix(image, x, y, CYAN, alpha)
			_mix(image, x + 1, y, CYAN, alpha * 0.5)
	var step := 10.0
	var row := float(HORIZON) + step
	while row < float(HEIGHT):
		var g := (row - HORIZON) / float(HEIGHT - HORIZON)
		var alpha := 0.05 * (1.0 - 0.8 * g)
		for x in WIDTH:
			_mix(image, x, int(row), CYAN, alpha)
		step *= 1.42
		row += step

## Server-ruin skyline: dark towers with sparse lit windows.
func _paint_skyline(image: Image) -> void:
	_paint_cluster(image, 40, 430, 9)
	_paint_cluster(image, 850, 1240, 9)

func _paint_cluster(image: Image, x_start: int, x_end: int, count: int) -> void:
	var span := x_end - x_start
	for i in count:
		var x := x_start + int(span * (float(i) + 0.15 + 0.7 * _hash01(i, 3)) / float(count))
		var w := 30 + int(46 * _hash01(i, 7))
		var h := 58 + int(172 * _hash01(i, 11))
		var top := HORIZON - h
		for yy in range(top, HORIZON):
			for xx in range(x, mini(x + w, WIDTH)):
				_mix(image, xx, yy, TOWER_DARK, 0.92)
		for xx in range(x, mini(x + w, WIDTH)):
			_mix(image, xx, top, CYAN, 0.10)
		var cols := maxi(2, w / 16)
		var rows := maxi(3, h / 18)
		for cx in cols:
			for cy in rows:
				var wx := x + 6 + cx * 16
				var wy := top + 8 + cy * 18
				if wx >= x + w - 2 or wy >= HORIZON:
					continue
				var hv := _hash01(i * 131 + cx, cy * 17 + 5)
				if hv > 0.82:
					_mix(image, wx, wy, CYAN, 0.55)
					_mix(image, wx + 1, wy, CYAN, 0.35)
				elif hv > 0.78:
					_mix(image, wx, wy, AMBER, 0.45)
				else:
					_mix(image, wx, wy, WINDOW_DARK, 0.35)

## Faint data motes drifting in the sky.
func _paint_motes(image: Image) -> void:
	for i in 180:
		var x := int(_hash01(i, 29) * WIDTH)
		var y := int(_hash01(i, 31) * (HORIZON - 60))
		var bright := _hash01(i, 37)
		var alpha := 0.05 + 0.35 * bright * bright
		_mix(image, x, y, CYAN, alpha)
		if bright > 0.93:
			_mix(image, x + 1, y, CYAN, alpha * 0.6)
			_mix(image, x, y + 1, CYAN, alpha * 0.6)

## Vignette, a slightly darker lower band and very subtle scanlines.
func _paint_vignette_and_scanlines(image: Image) -> void:
	var cx := WIDTH * 0.5
	var cy := HEIGHT * 0.46
	var max_d: float = sqrt(cx * cx + cy * cy)
	for y in HEIGHT:
		var dy := y - cy
		var row_dark := 1.0
		if y > HEIGHT - 90:
			row_dark = 0.92
		if y % 3 == 0:
			row_dark *= 0.985
		for x in WIDTH:
			var dx := x - cx
			var d: float = sqrt(dx * dx + dy * dy) / max_d
			var v: float = (1.0 - 0.38 * pow(d, 2.2)) * row_dark
			var c := image.get_pixel(x, y)
			image.set_pixel(x, y, Color(c.r * v, c.g * v, c.b * v, 1.0))
