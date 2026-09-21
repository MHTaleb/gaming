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
const RESULT_SCENE := "res://scenes/result.tscn"
const DEFAULT_ENCOUNTER := "encounter_1"
const SMOKE_STEP_DELAY := 0.4
const LOG_LINE_LIMIT := 200
const CHARACTER_ART_DIR := "res://assets/characters"
## One painted backdrop per encounter region (tools/make_stage_art.gd).
const REGION_BACKDROPS: Array = [
	"res://assets/backdrops/intrusion.png",
	"res://assets/backdrops/load_spike.png",
	"res://assets/backdrops/server_cathedral.png",
]
const BACKDROP_DIM := Color(1, 1, 1, 0.55)

var session: RZCombatSession = null
var selected_target_id: String = ""
var reduced_motion := false
## After an accepted action, input inside this window is ignored. Tests set 0.
var debounce_ms := 300

var _last_accepted_ms := -1000000
var _enemy_rows := {}
var _log_lines: Array[Label] = []
var _outcome_reported := false
var _terminal_visual := false

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var encounter_id := _arg_value(args, "--encounter")
	var equipment_id := _arg_value(args, "--equipment")
	if encounter_id.is_empty() and RZRun.active:
		encounter_id = RZRun.encounter_id
		if equipment_id.is_empty():
			equipment_id = RZRun.equipment_id
	if encounter_id.is_empty():
		encounter_id = DEFAULT_ENCOUNTER
	session = RZCombatSession.start(encounter_id, equipment_id)
	_apply_region_backdrop(encounter_id)
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

# ---------------------------------------------------------------- backdrop

## The stage behind the fight matches the region the ticket sits in.
func _apply_region_backdrop(encounter_id: String) -> void:
	var index := 0
	if RZRun.active:
		index = RZRun.encounter_number() - 1
	elif encounter_id.begins_with("encounter_"):
		index = int(encounter_id.trim_prefix("encounter_")) - 1
	if index < 0 or index >= REGION_BACKDROPS.size():
		return
	var texture := load(str(REGION_BACKDROPS[index])) as Texture2D
	if texture != null:
		%Backdrop.texture = texture
		%Backdrop.modulate = BACKDROP_DIM

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

## Run-aware ways out of the fight: advancing goes through the result screen so
## rewards are granted exactly once; leaving the title ends the run.
func _continue() -> void:
	if RZRun.active:
		get_tree().change_scene_to_file(RESULT_SCENE)

func _go_title() -> void:
	if RZRun.active:
		RZRun.reset()
	get_tree().change_scene_to_file(TITLE_SCENE)

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
	%ContinueButton.pressed.connect(_continue)
	%TitleButton.pressed.connect(_go_title)
	%QuitButton.pressed.connect(_quit)
	%ReducedMotion.toggled.connect(func(pressed: bool) -> void:
		reduced_motion = pressed
		RZRun.set_setting("reduced_motion", pressed))
	%ReducedMotion.set_pressed_no_signal(RZRun.setting("reduced_motion"))
	reduced_motion = %ReducedMotion.button_pressed
	%MuteCheck.set_pressed_no_signal(RZRun.setting("mute"))
	%MuteCheck.toggled.connect(func(pressed: bool) -> void:
		RZRun.set_setting("mute", pressed)
		if pressed:
			RZAudio.stop_all())
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
	if RZRun.active:
		%BannerLabel.text = "Ticket %d — %s" % [RZRun.encounter_number(),
			session.encounter_title()]
	else:
		%BannerLabel.text = session.encounter_title()
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
	row.add_theme_stylebox_override("panel", _row_style(enemy.kind))
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 10)
	row.add_child(margin)
	var card := VBoxContainer.new()
	card.add_theme_constant_override("separation", 6)
	margin.add_child(card)
	# Character sprite (RZ-034): drawn procedurally in the landing-art language;
	# a later asset ticket replaces the files without touching combat logic.
	var art_path := _enemy_art_path(enemy)
	var chip_control: Control
	if not art_path.is_empty():
		var sprite := TextureRect.new()
		sprite.name = "Chip"
		sprite.custom_minimum_size = Vector2(96, 96)
		sprite.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		sprite.mouse_filter = Control.MOUSE_FILTER_IGNORE
		sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		sprite.texture = load(art_path)
		chip_control = sprite
	else:
		# Fallback for unknown content ids: identity color chip (never color-only
		# information; names and labels always carry it too).
		var fallback := ColorRect.new()
		fallback.name = "Chip"
		fallback.custom_minimum_size = Vector2(96, 96)
		fallback.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
		fallback.color = _kind_color(enemy.kind)
		chip_control = fallback
	card.add_child(chip_control)
	var name_label := Label.new()
	name_label.text = "%s [%s]" % [enemy.display_name, enemy.id]
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	card.add_child(name_label)
	var hp_row := HBoxContainer.new()
	hp_row.alignment = BoxContainer.ALIGNMENT_CENTER
	hp_row.add_theme_constant_override("separation", 8)
	card.add_child(hp_row)
	var hp_bar := ProgressBar.new()
	hp_bar.custom_minimum_size = Vector2(150, 20)
	hp_bar.show_percentage = false
	hp_bar.max_value = enemy.max_hp
	hp_bar.value = enemy.hp
	hp_bar.add_theme_stylebox_override("background", _bar_style(Color(0.05, 0.06, 0.1, 0.9)))
	hp_bar.add_theme_stylebox_override("fill", _bar_style(Color(0.85, 0.32, 0.3)))
	hp_row.add_child(hp_bar)
	var hp_text := Label.new()
	hp_text.text = RZCombatText.hp_text(enemy)
	hp_text.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hp_row.add_child(hp_text)
	var intent_label := Label.new()
	intent_label.text = "Intent: " + RZCombatText.intent_text(enemy)
	intent_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	card.add_child(intent_label)
	var target_button := Button.new()
	target_button.custom_minimum_size = Vector2(150, 48)
	target_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	target_button.pressed.connect(_select_target.bind(enemy.id))
	card.add_child(target_button)
	return {"row": row, "hp_text": hp_text, "name": name_label, "intent": intent_label,
		"target_button": target_button, "chip": chip_control}

## Translucent row panel with a kind-tinted left edge (stage stays visible).
func _row_style(kind: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.09, 0.14, 0.62)
	style.border_width_left = 3
	var tint := _kind_color(kind)
	style.border_color = Color(tint.r, tint.g, tint.b, 0.5)
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_right = 6
	style.corner_radius_bottom_left = 6
	return style

func _bar_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.corner_radius_top_left = 4
	style.corner_radius_top_right = 4
	style.corner_radius_bottom_right = 4
	style.corner_radius_bottom_left = 4
	return style

## Character art by content display name slug (RZ-034); empty when no sprite
## exists yet - the caller falls back to the colored chip.
func _enemy_art_path(enemy: RZActorState) -> String:
	var path := "%s/%s.png" % [CHARACTER_ART_DIR, _slug(enemy.display_name)]
	if ResourceLoader.exists(path):
		return path
	return ""

func _slug(text: String) -> String:
	var out := ""
	for ch in text.to_lower():
		if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9"):
			out += ch
		elif not out.is_empty() and not out.ends_with("_"):
			out += "_"
	return out.trim_suffix("_")

## Placeholder identity colors (fallback chips only; color is never the only
## signal - names and labels carry the same information).
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
	if not terminal:
		_terminal_visual = false
	var run_active := RZRun.active
	%ContinueButton.visible = terminal and run_active
	%RetryButton.visible = terminal and not run_active
	if terminal:
		%TerminalTitle.text = RZCombatText.outcome_title(session.state.outcome)
		%TerminalDetail.text = RZCombatText.outcome_detail(session.state.outcome)
		if not _terminal_visual:
			_terminal_visual = true
			_terminal_flourish()
		if not _outcome_reported:
			_outcome_reported = true
			if run_active:
				var outcome := "victory"
				if session.state.outcome == RZCombatState.Outcome.STALLED:
					outcome = "stalled"
				elif session.state.outcome != RZCombatState.Outcome.VICTORY:
					outcome = "defeat"
				RZRun.report_outcome(outcome)

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
		var cue := RZAudioService.cue_for_event(event.type)
		if not cue.is_empty():
			RZAudio.play(cue)

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
				_pulse_actor(event.target_id)
				_spawn_floater(event.target_id, "-%d" % int(event.payload.get("amount", 0)),
					Color(1.0, 0.5, 0.45))
				if event.actor_id == RZCombatSession.HERO_ID:
					_pulse_chip(%HeroChip)
			"guard_started":
				_flash_actor(event.actor_id, Color(0.55, 0.8, 1.0))
			"guard_halved":
				_spawn_floater(event.target_id, "guarded", Color(0.6, 0.85, 1.0))
			"boss_telegraph":
				_flash_actor(event.actor_id, Color(1.0, 0.8, 0.35))
				_pulse_actor(event.actor_id)
			"defeated":
				_flash_actor(event.target_id, Color(0.85, 0.3, 0.3), 0.5)
				_pulse_actor(event.target_id, 1.06)

func _actor_anchor(actor_id: String) -> Control:
	if actor_id == RZCombatSession.HERO_ID:
		return %HeroChip
	var entry: Dictionary = _enemy_rows.get(actor_id, {})
	return entry.get("chip", null)

## Cosmetic scale pulse on the art chip of an actor (impact feedback).
func _pulse_actor(actor_id: String, amount := 1.12) -> void:
	var chip := _actor_anchor(actor_id)
	if chip != null:
		_pulse_chip(chip, amount)

func _pulse_chip(chip: Control, amount := 1.12) -> void:
	if not is_instance_valid(chip):
		return
	if chip.pivot_offset == Vector2.ZERO:
		chip.pivot_offset = chip.size / 2.0
	var tween := create_tween()
	tween.tween_property(chip, "scale", Vector2(amount, amount), 0.07)
	tween.tween_property(chip, "scale", Vector2.ONE, 0.13)

## Victory/defeat banner flourish; skipped entirely under reduced motion.
func _terminal_flourish() -> void:
	if reduced_motion:
		return
	var title: Label = %TerminalTitle
	title.pivot_offset = title.size / 2.0
	title.modulate.a = 0.0
	title.scale = Vector2(0.92, 0.92)
	var tween := create_tween()
	tween.tween_property(title, "modulate:a", 1.0, 0.16)
	tween.parallel().tween_property(title, "scale", Vector2.ONE, 0.22) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

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
