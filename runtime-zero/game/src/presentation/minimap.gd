extends Control
## Mini map for the work map (RZ-035): a scaled overview of the region route
## with the stone states and the engineer's position. Pure canvas drawing -
## the data comes from the map scene, no textures and no own state.

var source: Node = null
var _signature := ""

func _process(_delta: float) -> void:
	if source == null or not is_instance_valid(source):
		return
	var state: Dictionary = source.call("minimap_state")
	var signature := "%s|%s|%s|%s" % [state.index, state.active, state.walking,
		state.route.size()]
	if signature != _signature:
		_signature = signature
		queue_redraw()

func _draw() -> void:
	if source == null or not is_instance_valid(source):
		return
	var state: Dictionary = source.call("minimap_state")
	var route: Array = state.route
	if route.is_empty():
		return
	# Fit the full 1280x720 board into this control with a small margin.
	var scale := minf((size.x - 12.0) / 1280.0, (size.y - 12.0) / 720.0)
	var origin := (size - Vector2(1280.0, 720.0) * scale) / 2.0
	var points := PackedVector2Array()
	for point in route:
		points.append(point * scale + origin)
	draw_polyline(points, Color(0.85, 0.7, 0.4, 0.5), 2.0, true)
	var index := int(state.index)
	for i in points.size():
		var color := Color(0.55, 0.56, 0.6)
		if not state.active or i < index:
			color = Color(0.45, 0.8, 0.5)
		elif i == index:
			color = Color(0.4, 0.85, 1.0)
		draw_circle(points[i], 4.5, color)
	var character := clampi(int(state.character), 0, points.size() - 1)
	draw_circle(points[character], 3.0, Color(1.0, 0.72, 0.3))
