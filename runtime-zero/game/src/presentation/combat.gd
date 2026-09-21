extends Control
## Combat scene (RZ-007). Presentation only: widgets render an RZCombatSession,
## player input becomes session.request_action() and returned domain events
## drive the log and cosmetic animation. Combat state is never mutated here
## (docs/ARCHITECTURE.md: "UI must not directly change HP, inventory or RNG").
##
## Modes (command line after `--`):
##   --encounter <id>       fight a specific content encounter (default encounter_1)
##   --equipment <id>       apply one equipment choice (preview; RZ-008 owns the real loadout)
##   --capture <path>       save one PNG and quit (shared with tools/demo.sh, RZ-031)
##   --combat-smoke <dir>   scripted Attack/Guard/Skill desktop run, one PNG per action
##
## Input policy: every source (mouse, touch, keyboard shortcut, smoke script)
## goes through submit_action(). An accepted action starts one debounce window
## (double-click / double-tap protection); commands that still arrive for an
## already-resolved turn are rejected by the domain as stale.
##
## Animation policy: state applies synchronously, tweens only decorate. Reduced
## motion disables all non-essential motion; no essential information is carried
## by animation or color alone (text states every value).

const TITLE_SCENE := "res://scenes/title.tscn"
const DEFAULT_ENCOUNTER := "encounter_1"
const SMOKE_STEP_DELAY := 0.4
const LOG_LINE_LIMIT := 200

var session: RZCombatSession = null
var selected_target_id: String = ""
var reduced_motion := false
## After an accepted action, input inside this window is ignored. Tests set 0.
var debounce_ms := 300

var _last_accepted_ms := -1000000
var _enemy_rows := {}
var _log_lines: Array[Label] = []

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var encounter_id := _arg_value(args, "--encounter")
	if encounter_id.is_empty():
		encounter_id = DEFAULT_ENCOUNTER
	session = RZCombatSession.start(encounter_id, _arg_value(args, "--equipment"))
	_connect_ui()
	if session.state == null:
		_show_fatal()
		return
	_refresh_all()
	print("[rz] combat ready: encounter=%s turn=%d" % [encounter_id, session.state.turn_index])
	%AttackButton.grab_focus()
	var capture := RZCapture.requested_path()
	if not capture.is_empty():
		await _run_single_capture(capture)
		return
	var smoke_dir := _arg_value(args, "--combat-smoke")
	if not smoke_dir.is_empty():
		await _run_smoke(smoke_dir)

# ---------------------------------------------------------------- input

## The single input path for buttons, keyboard shortcuts, tests and the smoke
## script. Returns the resolver result (or a debounce ignore marker).
func submit_action(action_id: String) -> Dictionary:
	if session == null or session.state == null:
		return {"accepted": false, "reason": RZCombatResolver.REASON_TERMINAL,
			"state": null, "events": []}
	var now := Time.get_ticks_msec()
	if now - _last_accepted_ms < debounce_ms:
		set_status("Double input ignored - one action per turn.")
		return {"accepted": false, "reason": "debounced", "state": session.state,
			"events": []}
	var target := ""
	if action_id != RZRules.ACTION_GUARD:
		target = selected_target_id
	var result := session.request_action(action_id, target)
	if result.get("accepted", false):
		_last_accepted_ms = now
		_append_events(result.events)
		_refresh_all()
		_animate(result.events)
	else:
		set_status(RZCombatText.reason_text(str(result.get("reason", ""))))
	return result

func set_status(text: String) -> void:
	%StatusLabel.text = text

func _on_retry() -> void:
	if session == null:
		return
	if session.reset():
		selected_target_id = ""
		_last_accepted_ms = -1000000
		_clear_log()
		set_status("Rematch - the encounter restarted.")
		_refresh_all()

## Clean in-game quit: the same shutdown path as the window's close button.
func _quit() -> void:
	print("[rz] quit requested")
	get_tree().quit(0)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		print("[rz] window close requested")

func _select_target(actor_id: String) -> void:
	selected_target_id = actor_id
	_update_selection_styles()

func _connect_ui() -> void:
	%AttackButton.pressed.connect(submit_action.bind(RZRules.ACTION_ATTACK))
	%GuardButton.pressed.connect(submit_action.bind(RZRules.ACTION_GUARD))
	%SkillButton.pressed.connect(submit_action.bind(RZRules.ACTION_SKILL))
	%RetryButton.pressed.connect(_on_retry)
	%TitleButton.pressed.connect(func() -> void: get_tree().change_scene_to_file(TITLE_SCENE))
	%QuitButton.pressed.connect(_quit)
	%ReducedMotion.toggled.connect(func(pressed: bool) -> void: reduced_motion = pressed)
	%AttackButton.tooltip_text = RZCombatText.action_summary(RZRules.ACTION_ATTACK)
	%GuardButton.tooltip_text = RZCombatText.action_summary(RZRules.ACTION_GUARD)
	%SkillButton.tooltip_text = RZCombatText.action_summary(RZRules.ACTION_SKILL)
	_give_shortcut(%AttackButton, KEY_1)
	_give_shortcut(%GuardButton, KEY_2)
	_give_shortcut(%SkillButton, KEY_3)

func _give_shortcut(button: Button, keycode: Key) -> void:
	var shortcut := Shortcut.new()
	var event := InputEventKey.new()
	event.physical_keycode = keycode
	shortcut.events = [event]
	button.shortcut = shortcut
	button.shortcut_in_tooltip = false

# ---------------------------------------------------------------- rendering

func _refresh_all() -> void:
	var combat := session.state
	%EncounterLabel.text = "Encounter: %s (%s)" % [session.encounter_title(),
		str(session.encounter.get("id", ""))]
	%TurnLabel.text = "Round %d / %d" % [combat.turn_index, combat.max_rounds]
	var hero := session.hero()
	%HeroNameLabel.text = hero.display_name
	%HeroHPBar.max_value = hero.max_hp
	%HeroHPBar.value = hero.hp
	%HeroHPText.text = RZCombatText.hp_text(hero)
	%HeroEnergyBar.max_value = maxi(hero.energy_cap, 1)
	%HeroEnergyBar.value = hero.energy
	%HeroEnergyText.text = RZCombatText.energy_text(hero)
	%HeroGuardLabel.text = RZCombatText.guard_state_text(hero)
	_rebuild_enemy_rows()
	_update_action_buttons()
	_update_terminal()
	if not session.terminal() and %StatusLabel.text.begins_with("Double input"):
		set_status("")

func _rebuild_enemy_rows() -> void:
	_enemy_rows.clear()
	for child in %EnemiesBox.get_children():
		%EnemiesBox.remove_child(child)
		child.free()
	for enemy in session.enemies():
		var entry := _build_enemy_row(enemy)
		%EnemiesBox.add_child(entry.row)
		_enemy_rows[enemy.id] = entry
	_ensure_valid_target()
	_update_selection_styles()

func _build_enemy_row(enemy: RZActorState) -> Dictionary:
	var row := PanelContainer.new()
	row.name = "Row_" + enemy.id
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 6)
	row.add_child(margin)
	var box := HBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	margin.add_child(box)
	# Placeholder character chip: shape and text carry the identity; a later
	# asset ticket replaces it without touching combat logic (RZ-016+).
	var chip := ColorRect.new()
	chip.name = "Chip"
	chip.custom_minimum_size = Vector2(56, 56)
	chip.color = _kind_color(enemy.kind)
	box.add_child(chip)
	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_child(info)
	var name_label := Label.new()
	name_label.text = "%s [%s]" % [enemy.display_name, enemy.id]
	info.add_child(name_label)
	var hp_row := HBoxContainer.new()
	hp_row.add_theme_constant_override("separation", 8)
	info.add_child(hp_row)
	var hp_bar := ProgressBar.new()
	hp_bar.custom_minimum_size = Vector2(240, 20)
	hp_bar.show_percentage = false
	hp_bar.max_value = enemy.max_hp
	hp_bar.value = enemy.hp
	hp_row.add_child(hp_bar)
	var hp_text := Label.new()
	hp_text.text = RZCombatText.hp_text(enemy)
	hp_row.add_child(hp_text)
	var intent_label := Label.new()
	intent_label.text = "Intent: " + RZCombatText.intent_text(enemy)
	info.add_child(intent_label)
	var target_button := Button.new()
	target_button.custom_minimum_size = Vector2(150, 48)
	target_button.pressed.connect(_select_target.bind(enemy.id))
	box.add_child(target_button)
	return {"row": row, "hp_text": hp_text, "name": name_label, "intent": intent_label,
		"target_button": target_button}

## Placeholder identity colors (real art arrives in RZ-016+; color is never the
## only signal - names and labels carry the same information).
func _kind_color(kind: String) -> Color:
	match kind:
		RZRules.KIND_BOSS:
			return Color(0.72, 0.45, 0.95)
		RZRules.KIND_HERO:
			return Color(0.45, 0.7, 1.0)
	return Color(0.9, 0.42, 0.35)

func _ensure_valid_target() -> void:
	var living := session.enemies()
	if living.is_empty():
		selected_target_id = ""
		return
	for enemy in living:
		if enemy.id == selected_target_id:
			return
	selected_target_id = living[0].id

func _update_selection_styles() -> void:
	for enemy_id in _enemy_rows:
		var entry: Dictionary = _enemy_rows[enemy_id]
		var selected: bool = enemy_id == selected_target_id
		var row: PanelContainer = entry.row
		row.modulate = Color(1.0, 0.95, 0.7) if selected else Color.WHITE
		var target_button: Button = entry.target_button
		target_button.disabled = selected
		target_button.text = "Targeted" if selected else "Target"

func _update_action_buttons() -> void:
	var terminal := session.terminal()
	var has_targets := not session.enemies().is_empty()
	%AttackButton.disabled = terminal or not has_targets
	%GuardButton.disabled = terminal
	%SkillButton.disabled = terminal or not session.can_use_skill()
	if terminal:
		%SkillHintLabel.text = ""
	else:
		%SkillHintLabel.text = RZCombatText.skill_disabled_reason(session.hero())

func _update_terminal() -> void:
	var terminal := session.terminal()
	%TerminalTitle.visible = terminal
	%TerminalDetail.visible = terminal
	if terminal:
		%TerminalTitle.text = RZCombatText.outcome_title(session.state.outcome)
		%TerminalDetail.text = RZCombatText.outcome_detail(session.state.outcome)

func _show_fatal() -> void:
	var message := "Combat data failed to load:\n" + "\n".join(session.errors)
	printerr(message)
	set_status(message)
	%TerminalTitle.text = "CONTENT ERROR"
	%TerminalTitle.visible = true
	%TerminalDetail.text = "Fix the content pack and relaunch (see game/content/README.md)."
	%TerminalDetail.visible = true
	%AttackButton.disabled = true
	%GuardButton.disabled = true
	%SkillButton.disabled = true

# ---------------------------------------------------------------- log

func _append_events(events: Array) -> void:
	var names := session.display_names()
	for event in events:
		_append_log_line(RZCombatText.event_line(event, names))

func _append_log_line(text: String) -> void:
	var line := Label.new()
	line.text = text
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	%LogBox.add_child(line)
	_log_lines.append(line)
	while _log_lines.size() > LOG_LINE_LIMIT:
		var oldest: Label = _log_lines.pop_front()
		oldest.free()
	%LogScroll.set_deferred("scroll_vertical", 1000000)

func _clear_log() -> void:
	for line in _log_lines:
		line.free()
	_log_lines.clear()

# ---------------------------------------------------------------- animation (cosmetic)

func _animate(events: Array) -> void:
	if reduced_motion:
		return
	for event in events:
		match event.type:
			"damage":
				_flash_actor(event.target_id, Color(1.0, 0.4, 0.35))
				_spawn_floater(event.target_id, "-%d" % int(event.payload.get("amount", 0)),
					Color(1.0, 0.5, 0.45))
			"guard_started":
				_flash_actor(event.actor_id, Color(0.55, 0.8, 1.0))
			"guard_halved":
				_spawn_floater(event.target_id, "guarded", Color(0.6, 0.85, 1.0))
			"boss_telegraph":
				_flash_actor(event.actor_id, Color(1.0, 0.8, 0.35))
			"defeated":
				_flash_actor(event.target_id, Color(0.85, 0.3, 0.3), 0.5)

func _actor_anchor(actor_id: String) -> Control:
	if actor_id == RZCombatSession.HERO_ID:
		return %HeroHPText
	var entry: Dictionary = _enemy_rows.get(actor_id, {})
	return entry.get("hp_text", null)

func _flash_actor(actor_id: String, color: Color, duration := 0.35) -> void:
	var anchor := _actor_anchor(actor_id)
	if anchor == null or not is_instance_valid(anchor):
		return
	var tween := create_tween()
	tween.tween_property(anchor, "modulate", color, duration * 0.3)
	tween.tween_property(anchor, "modulate", Color.WHITE, duration * 0.7)

func _spawn_floater(actor_id: String, text: String, color: Color) -> void:
	var anchor := _actor_anchor(actor_id)
	if anchor == null or not is_instance_valid(anchor):
		return
	var floater := Label.new()
	floater.text = text
	floater.add_theme_color_override("font_color", color)
	floater.z_index = 10
	# Parent to the scene root (a plain Control, not a container): free
	# positioning, and safe while the window is still setting up children.
	add_child(floater)
	floater.global_position = anchor.global_position + Vector2(0, -20)
	var tween := create_tween()
	tween.tween_property(floater, "global_position",
		floater.global_position + Vector2(0, -28), 0.5)
	tween.parallel().tween_property(floater, "modulate:a", 0.0, 0.5)
	tween.tween_callback(floater.queue_free)

# ---------------------------------------------------------------- capture and smoke

func _run_single_capture(path: String) -> void:
	var err: Error = await RZCapture.save_after_frames(get_viewport(), path)
	if err == OK:
		print("capture saved: ", ProjectSettings.globalize_path(path))
	else:
		printerr("capture failed: ", path)
	get_tree().quit(0 if err == OK else 1)

func _run_smoke(dir_path: String) -> void:
	var steps: Array = [
		[RZRules.ACTION_ATTACK, "combat-1-attack.png"],
		[RZRules.ACTION_GUARD, "combat-2-guard.png"],
		[RZRules.ACTION_SKILL, "combat-3-skill.png"],
	]
	for step in steps:
		_press_action_button(str(step[0]))
		await get_tree().create_timer(SMOKE_STEP_DELAY).timeout
		var path := dir_path.path_join(str(step[1]))
		var err: Error = await RZCapture.save_after_frames(get_viewport(), path, 3)
		if err != OK:
			printerr("combat smoke: capture failed: ", path)
			get_tree().quit(1)
			return
		print("combat smoke: saved ", path)
	var hero := session.hero()
	print("combat smoke: round=%d hero_hp=%d/%d energy=%d/%d terminal=%s" % [
		session.state.turn_index, hero.hp, hero.max_hp, hero.energy, hero.energy_cap,
		str(session.terminal())])
	print("combat smoke: state_hash=%s" % session.state.state_hash())
	print("combat smoke: OK")
	get_tree().quit(0)

## Emits the very signal a click/tap emits, so the scripted run exercises the
## real button wiring instead of bypassing it.
func _press_action_button(action_id: String) -> void:
	match action_id:
		RZRules.ACTION_ATTACK:
			%AttackButton.pressed.emit()
		RZRules.ACTION_GUARD:
			%GuardButton.pressed.emit()
		RZRules.ACTION_SKILL:
			%SkillButton.pressed.emit()

func _arg_value(args: PackedStringArray, flag: String) -> String:
	for index in args.size():
		if args[index] == flag and index + 1 < args.size():
			return args[index + 1]
	return ""
