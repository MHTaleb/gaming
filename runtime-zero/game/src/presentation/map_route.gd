extends Control
## Route board for the work map (RZ-035): draws the winding stone path and the
## stone states (current / visited / ahead) plus the ticket pennant. Pure
## canvas drawing - no textures - so stone states are data, not assets.

const DISC_RADIUS := 36.0

var route: Array = []
var disc_index := 0

func configure(p_route: Array, p_disc_index: int) -> void:
	route = p_route
	disc_index = p_disc_index
	queue_redraw()

func _disc_state(index: int) -> String:
	if index == disc_index:
		return "current"
	if index < disc_index:
		return "visited"
	return "ahead"

func _hash01(a: int, b: int) -> float:
	var h := a * 73856093 ^ b * 196314165
	h = (h ^ (h >> 13)) * 1274126177
	h = h ^ (h >> 16)
	return float(abs(h) % 100000) / 100000.0

func _draw() -> void:
	if route.is_empty():
		return
	var points := PackedVector2Array()
	for point in route:
		points.append(point)
	draw_polyline(points, Color(0.32, 0.26, 0.18, 0.85), 10.0, true)
	draw_polyline(points, Color(0.85, 0.7, 0.4, 0.35), 3.0, true)
	for index in route.size():
		var center: Vector2 = route[index]
		var ring := Color(0.32, 0.33, 0.38)
		var base := Color(0.45, 0.46, 0.5)
		var inner := Color(0.56, 0.57, 0.61)
		match _disc_state(index):
			"current":
				ring = Color(0.9, 0.98, 1.0)
				base = Color(0.35, 0.68, 0.85)
				inner = Color(0.55, 0.88, 1.0)
			"visited":
				ring = Color(0.72, 0.9, 0.78)
				base = Color(0.4, 0.52, 0.45)
				inner = Color(0.55, 0.7, 0.6)
		draw_circle(center, DISC_RADIUS, ring)
		draw_circle(center, DISC_RADIUS - 6.0, base)
		draw_circle(center, DISC_RADIUS - 16.0, inner)
		for speck in 7:
			var angle: float = TAU * _hash01(index * 31 + speck, 7)
			var radius := 8.0 + 16.0 * _hash01(index * 17 + speck, 11)
			draw_circle(center + Vector2(cos(angle), sin(angle)) * radius, 1.7,
				Color(0.22, 0.23, 0.27, 0.55))
		if index == route.size() - 1:
			draw_line(center + Vector2(0, -46), center + Vector2(0, -72),
				Color(0.9, 0.75, 0.4), 3.0)
			draw_colored_polygon(PackedVector2Array([
				center + Vector2(0, -72), center + Vector2(26, -64),
				center + Vector2(0, -56)]), Color(0.95, 0.7, 0.3))
