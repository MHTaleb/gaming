extends Control
## Loadout screen (RZ-008): pick exactly one equipment choice, then begin the
## three-encounter run. Options and effect text come from the validated content
## pack; nothing here changes combat rules. Keyboard: Tab moves focus, Enter
## selects and then begins with the focused Begin button.
##
## Verification hooks:
##   --auto-begin <equipment_id>   select and begin after a short beat
##   --capture <path>              save a PNG of this screen and quit

const TITLE_SCENE := "res://scenes/title.tscn"
const COMBAT_SCENE := "res://scenes/combat.tscn"
const AUTO_BEGIN_DELAY := 0.3

var _selected_id := ""
var _cards := {}

func _ready() -> void:
	print("[rz] loadout ready")
	var equipment: Array = RZRun.list_equipment()
	var box: HBoxContainer = %OptionsBox
	var first: Button = null
	for entry in equipment:
		var card := _build_card(entry)
		box.add_child(card)
		_cards[str(entry.get("id", ""))] = card
		if first == null:
			first = card
	%BeginButton.pressed.connect(_begin)
	%BackButton.pressed.connect(_back)
	%BeginButton.disabled = true
	if not RZRun.last_equipment.is_empty() and _cards.has(RZRun.last_equipment):
		_select(RZRun.last_equipment)
	if _selected_id.is_empty() and first != null:
		first.grab_focus()
	elif _cards.has(_selected_id):
		var selected_card: Button = _cards[_selected_id]
		selected_card.grab_focus()
	var args := OS.get_cmdline_user_args()
	var auto := _arg_value(args, "--auto-begin")
	if not auto.is_empty():
		await get_tree().create_timer(AUTO_BEGIN_DELAY).timeout
		_select(auto)
		_begin()
		return
	var capture := RZCapture.requested_path()
	if not capture.is_empty():
		await _run_capture(capture)

func _build_card(entry: Dictionary) -> Button:
	var card := Button.new()
	card.name = "Card_" + str(entry.get("id", ""))
	card.toggle_mode = true
	card.custom_minimum_size = Vector2(330, 170)
	# The content description already states the effect in plain language.
	card.text = "%s\n\n%s" % [str(entry.get("display_name", "")),
		str(entry.get("description", ""))]
	card.pressed.connect(_select.bind(str(entry.get("id", ""))))
	return card

## Exactly one choice stays selected; picking another replaces it.
func _select(equipment_id: String) -> void:
	if not _cards.has(equipment_id):
		return
	_selected_id = equipment_id
	for id in _cards:
		var card: Button = _cards[id]
		card.button_pressed = id == _selected_id
	%BeginButton.disabled = false
	%SummaryLabel.text = "Selected: %s - the choice lasts the whole run." % equipment_id
	RZAudio.play("ui_click")

func _begin() -> void:
	if _selected_id.is_empty():
		return
	var result := RZRun.begin(_selected_id)
	if not result.get("ok", false):
		%SummaryLabel.text = "Could not start: " + ", ".join(result.get("errors", []))
		return
	print("[rz] run begin: equipment=%s encounter=%s" % [RZRun.equipment_id, RZRun.encounter_id])
	get_tree().change_scene_to_file(COMBAT_SCENE)

func _back() -> void:
	get_tree().change_scene_to_file(TITLE_SCENE)

func _run_capture(path: String) -> void:
	var err: Error = await RZCapture.save_after_frames(get_viewport(), path)
	if err == OK:
		print("capture saved: ", ProjectSettings.globalize_path(path))
	get_tree().quit(0 if err == OK else 1)

func _arg_value(args: PackedStringArray, flag: String) -> String:
	for index in args.size():
		if args[index] == flag and index + 1 < args.size():
			return args[index + 1]
	return ""
