extends SceneTree
## Headless presentation/UI test suite (RZ-007).
##   godot --headless --path game --script res://tests/presentation_tests.gd
## Nonzero exit on any failure. Exercises the same session, text formatter and
## combat scene the game uses; no GPU, assets or wall-clock dependency.

const COMBAT_SCENE := "res://scenes/combat.tscn"
const TITLE_SCENE := "res://scenes/title.tscn"

var _checks := 0
var _failures := 0

func _initialize() -> void:
	_test_session_builds_from_content()
	_test_equipment_effects()
	_test_session_failures_are_explicit()
	_test_skill_gating_and_energy()
	_test_stale_turn_rejection()
	_test_victory_flow()
	_test_defeat_flow()
	_test_stalled_flow()
	_test_intent_mirrors_boss_cycle()
	_test_reason_mapping_is_complete()
	_test_event_lines()
	await _test_scene_widgets_and_keyboard()
	await _test_scene_attack_and_double_input()
	await _test_scene_skill_disabled_state()
	await _test_scene_terminal_and_retry()
	await _test_animation_timing_does_not_change_outcomes()
	await _test_title_scene_links_to_combat()
	await _test_title_input_paths()
	if _failures == 0:
		print("ALL PRESENTATION TESTS PASSED (%d checks)" % _checks)
		quit(0)
	else:
		printerr("PRESENTATION TESTS FAILED: %d of %d checks failed" % [_failures, _checks])
		quit(1)

# ---------------------------------------------------------------- helpers

func _expect(condition: bool, label: String) -> void:
	_checks += 1
	if condition:
		print("  ok  ", label)
	else:
		_failures += 1
		printerr("  FAIL ", label)

## Scene scripts complete _ready after the first processed frame in this
## harness (headless --script mode), so every scene test waits one frame.
func _open_combat() -> Control:
	var scene: PackedScene = load(COMBAT_SCENE)
	var node: Control = scene.instantiate()
	root.add_child(node)
	await process_frame
	return node

func _open_title() -> Control:
	var scene: PackedScene = load(TITLE_SCENE)
	var node: Control = scene.instantiate()
	root.add_child(node)
	await process_frame
	return node

func _close(node: Node) -> void:
	root.remove_child(node)
	node.free()

func _attack_until_terminal(session: RZCombatSession, limit: int) -> int:
	var turns := 0
	while not session.terminal() and turns < limit:
		var target := session.enemies()[0].id
		session.request_action(RZRules.ACTION_ATTACK, target)
		turns += 1
	return turns

func _guard_until_terminal(session: RZCombatSession, limit: int) -> int:
	var turns := 0
	while not session.terminal() and turns < limit:
		session.request_action(RZRules.ACTION_GUARD)
		turns += 1
	return turns

func _has_line(lines: Array, fragment: String) -> bool:
	for line in lines:
		if str(line).contains(fragment):
			return true
	return false

func _log_texts(node: Control) -> Array:
	var out: Array = []
	for child in node.get_node("%LogBox").get_children():
		out.append(child.text)
	return out

# ---------------------------------------------------------------- session

func _test_session_builds_from_content() -> void:
	var session := RZCombatSession.start("encounter_1")
	_expect(session.state != null and session.errors.is_empty(),
		"encounter_1 loads from content without errors")
	var hero := session.hero()
	_expect(hero.hp == 100 and hero.max_hp == 100 and hero.attack == 12 and hero.defense == 3,
		"hero uses the provisional baseline (100/12/3)")
	_expect(hero.energy == 6 and hero.energy_cap == 6, "hero starts at 6/6 energy")
	_expect(session.enemies().size() == 1 and session.enemies()[0].id == "enemy_1",
		"encounter_1 fields one actor enemy_1")
	var enemy := session.enemies()[0]
	_expect(enemy.hp == 35 and enemy.attack == 9 and enemy.defense == 1,
		"Memory Leak stats come from content (35/9/1)")
	_expect(enemy.display_name == "Memory Leak", "enemy display name is loaded")
	_expect(session.encounter_title() == "Intrusion", "encounter title is loaded")
	var two := RZCombatSession.start("encounter_2")
	_expect(two.enemies().size() == 2 and two.enemies()[0].id == "enemy_1"
		and two.enemies()[1].id == "enemy_2", "encounter_2 fields enemy_1 and enemy_2")
	var boss := RZCombatSession.start("encounter_3")
	var boss_actor := boss.enemies()[0]
	_expect(boss_actor.kind == RZRules.KIND_BOSS and boss_actor.hp == 90
		and boss_actor.display_name == "Server Cathedral",
		"encounter_3 fields the boss from content")

func _test_equipment_effects() -> void:
	var plating := RZCombatSession.start("encounter_1", "guard_plating")
	var plate_hero := plating.hero()
	_expect(plate_hero.max_hp == 125 and plate_hero.hp == 125,
		"guard_plating raises max HP to 125 and starts full")
	var booster := RZCombatSession.start("encounter_1", "power_booster")
	_expect(booster.hero().attack == 15, "power_booster raises attack to 15")
	var battery := RZCombatSession.start("encounter_1", "battery_cell")
	_expect(battery.hero().energy_cap == 9 and battery.hero().energy == 6,
		"battery_cell raises the energy cap; fixture start energy stays 6")

func _test_session_failures_are_explicit() -> void:
	var missing := RZCombatSession.start("encounter_nope")
	_expect(missing.state == null and not missing.errors.is_empty(),
		"unknown encounter fails closed with diagnostics")
	var bad_item := RZCombatSession.start("encounter_1", "cursed_usb")
	_expect(bad_item.state == null and not bad_item.errors.is_empty(),
		"unknown equipment fails closed with diagnostics")

func _test_skill_gating_and_energy() -> void:
	# Two leaks: the first dies on the second skill, the fight continues, and
	# the energy pool keeps regenerating toward the 3-energy skill cost.
	var session := RZCombatSession.start("encounter_2")
	var target := "enemy_1"
	var first := session.request_action(RZRules.ACTION_SKILL, target)
	_expect(first.accepted and session.hero().energy == 4,
		"skill spends 3 of 6 energy and regen leaves 4")
	var second := session.request_action(RZRules.ACTION_SKILL, target)
	_expect(second.accepted and session.hero().energy == 2,
		"second skill drains to 2 after regen")
	var before_hash := session.state.state_hash()
	var third := session.request_action(RZRules.ACTION_SKILL, target)
	_expect(not third.accepted and third.reason == RZCombatResolver.REASON_INSUFFICIENT_ENERGY,
		"skill below 3 energy is rejected as insufficient_energy")
	_expect(session.state.state_hash() == before_hash, "rejected skill changes no state")
	_expect(RZCombatText.reason_text(third.reason).contains("Not enough energy"),
		"insufficient energy maps to readable text")

func _test_stale_turn_rejection() -> void:
	var session := RZCombatSession.start("encounter_1")
	var target := session.enemies()[0].id
	var first := session.request_action(RZRules.ACTION_ATTACK, target)
	_expect(first.accepted, "first attack of the turn is accepted")
	var after_hash := session.state.state_hash()
	var stale := RZCombatResolver.resolve(session.state,
		RZCombatCommand.make(session.state.turn_index - 1, RZCombatSession.HERO_ID,
			RZRules.ACTION_ATTACK, target))
	_expect(not stale.accepted and stale.reason == RZCombatResolver.REASON_STALE_TURN,
		"a command for the resolved turn is rejected as stale")
	_expect(session.state.state_hash() == after_hash, "stale input changes no state")
	_expect(stale.events.is_empty(), "stale input emits no events")

# ---------------------------------------------------------------- flows

func _test_victory_flow() -> void:
	var session := RZCombatSession.start("encounter_1")
	var turns := _attack_until_terminal(session, 10)
	_expect(session.terminal() and session.state.outcome == RZCombatState.Outcome.VICTORY,
		"attacking clears encounter_1 to VICTORY")
	_expect(turns == 4, "victory takes exactly 4 attacks against 35 HP (11 damage per hit)")
	_expect(session.hero().hp == 82, "hero takes 3 unguarded hits (82 HP left)")
	var terminal := session.request_action(RZRules.ACTION_ATTACK, "enemy_1")
	_expect(not terminal.accepted and terminal.reason == RZCombatResolver.REASON_TERMINAL,
		"commands after victory are rejected as combat_over")
	var stalled_text := RZCombatText.outcome_title(RZCombatState.Outcome.VICTORY)
	_expect(stalled_text == "VICTORY", "victory title is shown")

func _test_defeat_flow() -> void:
	var session := RZCombatSession.start("encounter_2")
	var turns := _guard_until_terminal(session, 20)
	_expect(session.state.outcome == RZCombatState.Outcome.DEFEAT,
		"guarding alone against two leaks ends in DEFEAT")
	_expect(session.hero().hp == 0, "defeat leaves the hero at 0 HP")
	_expect(turns == 12, "defeat lands on turn 12 with 3+6 damage per guarded round")

func _test_stalled_flow() -> void:
	var hero := RZActorState.make(RZCombatSession.HERO_ID, "Operator", RZRules.KIND_HERO, 100, 12, 3, 6, 6)
	var boss := RZActorState.make("boss_1", "Server Cathedral", RZRules.KIND_BOSS, 90, 12, 2)
	var state := RZCombatState.new()
	state.actors.append(hero)
	state.actors.append(boss)
	state.max_rounds = 2
	var session := RZCombatSession.from_state(state)
	session.request_action(RZRules.ACTION_GUARD)
	var second := session.request_action(RZRules.ACTION_GUARD)
	_expect(session.state.outcome == RZCombatState.Outcome.STALLED,
		"round cap ends the fight as STALLED")
	_expect(RZCombatText.outcome_detail(RZCombatState.Outcome.STALLED).contains("not a win"),
		"stalled text states it is not a win")
	_expect(not second.events.is_empty(), "the stalled round still emits its events")

# ---------------------------------------------------------------- text

func _test_intent_mirrors_boss_cycle() -> void:
	var minor := RZCombatSession.start("encounter_1")
	_expect(RZCombatText.intent_text(minor.enemies()[0]) == "Attack",
		"basic enemy intent is Attack")
	var session := RZCombatSession.start("encounter_3")
	var boss := session.enemies()[0]
	_expect(RZCombatText.intent_text(boss) == "Attack", "boss starts with a normal attack intent")
	session.request_action(RZRules.ACTION_GUARD)
	_expect(RZCombatText.intent_text(session.enemies()[0]) == "Attack",
		"after one normal the intent stays Attack")
	session.request_action(RZRules.ACTION_GUARD)
	_expect(RZCombatText.intent_text(session.enemies()[0]).contains("telegraphed after this one"),
		"third normal arms the telegraph and the intent says so")
	session.request_action(RZRules.ACTION_GUARD)
	_expect(RZCombatText.intent_text(session.enemies()[0]) == "Heavy attack incoming (x2)",
		"telegraphed turn shows the heavy intent")
	var result := session.request_action(RZRules.ACTION_GUARD)
	var halved: RZCombatEvent = null
	for event in result.events:
		if event.type == "guard_halved":
			halved = event
	_expect(halved != null and int(halved.payload.get("before", 0)) == 21
		and int(halved.payload.get("after", 0)) == 10,
		"the telegraphed heavy lands as 21 damage halved to 10 by the guard")
	_expect(RZCombatText.intent_text(session.enemies()[0]) == "Attack",
		"after the heavy the cycle restarts at Attack")

func _test_reason_mapping_is_complete() -> void:
	var reasons := [
		RZCombatResolver.REASON_UNKNOWN_ACTION, RZCombatResolver.REASON_STALE_TURN,
		RZCombatResolver.REASON_ACTOR_MISSING, RZCombatResolver.REASON_ACTOR_DEAD,
		RZCombatResolver.REASON_NOT_HERO, RZCombatResolver.REASON_TARGET_MISSING,
		RZCombatResolver.REASON_TARGET_DEAD, RZCombatResolver.REASON_INSUFFICIENT_ENERGY,
		RZCombatResolver.REASON_TERMINAL,
	]
	var seen := {}
	var all_ok := true
	for reason in reasons:
		var text := RZCombatText.reason_text(reason)
		if text.is_empty() or text.begins_with("Unknown"):
			all_ok = false
		seen[text] = true
	_expect(all_ok, "every resolver reason maps to a real sentence")
	_expect(seen.size() >= 7, "reason sentences cover the distinct failure families")
	_expect(RZCombatText.action_label(RZRules.ACTION_SKILL).contains("%d" % RZRules.SKILL_ENERGY_COST),
		"skill label states its energy cost")
	_expect(RZCombatText.skill_disabled_reason(RZCombatSession.start("encounter_1").hero()) == "",
		"skill has no disabled reason at 6 energy")
	_expect(not RZCombatText.action_summary(RZRules.ACTION_GUARD).is_empty(),
		"guard has a plain-language summary")

func _test_event_lines() -> void:
	var session := RZCombatSession.start("encounter_1")
	var target := session.enemies()[0].id
	var names := session.display_names()
	var result := session.request_action(RZRules.ACTION_SKILL, target)
	var lines: Array = []
	for event in result.events:
		lines.append(RZCombatText.event_line(event, names))
	_expect(_has_line(lines, "Skill: Operator spends 3 energy (3 left)"),
		"skill line reports the cost and remaining energy")
	_expect(_has_line(lines, "Operator hits Memory Leak for 23 damage"),
		"skill damage line names both actors and the amount")
	_expect(_has_line(lines, "Round end: +1 energy (4 total)"),
		"energy regen line states the actual gain")
	var guard := session.request_action(RZRules.ACTION_GUARD)
	var guard_lines: Array = []
	for event in guard.events:
		guard_lines.append(RZCombatText.event_line(event, session.display_names()))
	_expect(_has_line(guard_lines, "raises a guard"), "guard line explains the action")
	_expect(_has_line(guard_lines, "Guard absorbs part of the hit: 6 -> 3 damage"),
		"guard halving line reports before and after")
	var kill: Dictionary = {}
	while not session.terminal():
		kill = session.request_action(RZRules.ACTION_ATTACK, target)
	var kill_lines: Array = []
	for event in kill.events:
		kill_lines.append(RZCombatText.event_line(event, session.display_names()))
	_expect(_has_line(kill_lines, "Memory Leak is defeated"),
		"defeat line names the defeated enemy")
	var end := RZCombatText.event_line(
		RZCombatEvent.make(1, 1, "victory", "hero", ""), names)
	_expect(end == "VICTORY - all enemies defeated", "victory line is fixed text")
	var unknown := RZCombatText.event_line(RZCombatEvent.make(1, 1, "mystery", "", ""), names)
	_expect(unknown == "event: mystery", "unknown event types degrade to a labeled line")

# ---------------------------------------------------------------- scene

func _test_scene_widgets_and_keyboard() -> void:
	var node := await _open_combat()
	_expect(node.session != null and node.session.state != null, "combat scene boots a session")
	_expect(node.get_node("%TurnLabel").text == "Round 1 / 50", "round label shows turn and cap")
	_expect(node.get_node("%EncounterLabel").text.contains("Intrusion"),
		"header shows the encounter title")
	_expect(node.get_node("%HeroHPText").text == "100 / 100", "hero HP is text, not color-only")
	_expect(node.get_node("%HeroEnergyText").text == "6 / 6", "hero energy is text")
	_expect(node.get_node("%EnemiesBox").get_child_count() == 1, "one enemy row is built")
	var row: Node = node.get_node("%EnemiesBox").get_child(0)
	var intent_labels := 0
	for child in row.find_children("*", "Label", true, false):
		if child.text.begins_with("Intent: Attack"):
			intent_labels += 1
	_expect(intent_labels == 1, "enemy row shows the intent")
	var attack: Button = node.get_node("%AttackButton")
	var guard: Button = node.get_node("%GuardButton")
	var skill: Button = node.get_node("%SkillButton")
	var focus_ok := attack.focus_mode == Control.FOCUS_ALL and guard.focus_mode == Control.FOCUS_ALL \
		and skill.focus_mode == Control.FOCUS_ALL
	_expect(focus_ok, "action buttons are keyboard focusable")
	_expect(attack.custom_minimum_size.y >= 48.0 and guard.custom_minimum_size.y >= 48.0 \
		and skill.custom_minimum_size.y >= 48.0, "action buttons meet the 48 px touch target")
	var shortcuts_ok := attack.get_shortcut() != null and not attack.get_shortcut().get_as_text().is_empty() \
		and guard.get_shortcut().get_as_text().contains("2") \
		and skill.get_shortcut().get_as_text().contains("3")
	_expect(shortcuts_ok, "1/2/3 shortcuts are wired to the three actions")
	_expect(not attack.disabled and not guard.disabled and not skill.disabled,
		"all three actions start available")
	_expect(node.get_node("%QuitButton") != null, "combat header has a Quit button")
	var hero_chip: ColorRect = node.get_node("%HeroChip")
	_expect(hero_chip.custom_minimum_size.x >= 48.0,
		"hero chip is a sized placeholder character")
	var chip: ColorRect = null
	for child in row.find_children("Chip", "ColorRect", true, false):
		chip = child
	_expect(chip != null, "enemy rows show a placeholder character chip")
	var boss_node := await _open_combat()
	boss_node.session = RZCombatSession.start("encounter_3")
	boss_node.call("_refresh_all")
	var boss_row: Node = boss_node.get_node("%EnemiesBox").get_child(0)
	var boss_chip: ColorRect = null
	for child in boss_row.find_children("Chip", "ColorRect", true, false):
		boss_chip = child
	_expect(boss_chip != null and chip != null and boss_chip.color != chip.color,
		"the boss chip is visually distinct from a normal enemy chip")
	_close(boss_node)
	_close(node)

func _test_scene_attack_and_double_input() -> void:
	var node := await _open_combat()
	node.debounce_ms = 0
	node.get_node("%AttackButton").pressed.emit()
	_expect(node.get_node("%TurnLabel").text == "Round 2 / 50", "a button press resolves the round")
	_expect(node.get_node("%HeroHPText").text == "94 / 100", "hero HP text updates after the enemy phase")
	var lines := _log_texts(node)
	_expect(_has_line(lines, "hits Memory Leak for 11 damage"), "the attack lands in the log")
	_expect(_has_line(lines, "Memory Leak hits Operator for 6 damage"),
		"the enemy phase lands in the log")
	var line_count := lines.size()
	node.debounce_ms = 300
	node.get_node("%GuardButton").pressed.emit()
	_expect(node.get_node("%TurnLabel").text == "Round 2 / 50",
		"debounced second press does not resolve another turn")
	_expect(_log_texts(node).size() == line_count, "debounced input adds no log lines")
	_expect(node.get_node("%StatusLabel").text.contains("Double input ignored"),
		"double input is explained in the status line")
	_close(node)

func _test_scene_skill_disabled_state() -> void:
	var node := await _open_combat()
	node.debounce_ms = 0
	# Two leaks keep the fight alive long enough to drain the energy pool.
	node.session = RZCombatSession.start("encounter_2")
	node.call("_refresh_all")
	var session: RZCombatSession = node.session
	session.request_action(RZRules.ACTION_SKILL, session.enemies()[0].id)
	session.request_action(RZRules.ACTION_SKILL, session.enemies()[0].id)
	node.call("_refresh_all")
	var skill: Button = node.get_node("%SkillButton")
	_expect(skill.disabled, "skill button disables below the energy cost")
	_expect(node.get_node("%SkillHintLabel").text.contains("Needs 3 energy"),
		"the disabled skill states the reason")
	var before: String = node.session.state.state_hash()
	var result: Dictionary = node.submit_action(RZRules.ACTION_SKILL)
	_expect(not result.accepted and node.session.state.state_hash() == before,
		"programmatic skill below cost is rejected without state change")
	_expect(node.get_node("%StatusLabel").text.contains("Not enough energy"),
		"rejection reason reaches the status line")
	_close(node)

func _test_scene_terminal_and_retry() -> void:
	var node := await _open_combat()
	node.debounce_ms = 0
	for _index in 4:
		node.submit_action(RZRules.ACTION_ATTACK)
	_expect(node.get_node("%TerminalTitle").visible
		and node.get_node("%TerminalTitle").text == "VICTORY",
		"victory banner appears in the scene")
	_expect(node.get_node("%TerminalDetail").text.contains("All enemies defeated"),
		"victory detail text is shown")
	_expect(node.get_node("%AttackButton").disabled, "actions disable after victory")
	var replay: Dictionary = node.submit_action(RZRules.ACTION_ATTACK)
	_expect(not replay.accepted and node.get_node("%StatusLabel").text.contains("combat is over"),
		"post-victory input is refused with a readable message")
	node.get_node("%RetryButton").pressed.emit()
	_expect(node.get_node("%TurnLabel").text == "Round 1 / 50", "retry restarts the round counter")
	_expect(node.get_node("%HeroHPText").text == "100 / 100", "retry restores full HP")
	_expect(not node.get_node("%TerminalTitle").visible, "retry hides the outcome banner")
	_expect(_log_texts(node).is_empty(), "retry clears the combat log")
	_close(node)

func _test_animation_timing_does_not_change_outcomes() -> void:
	var plain := await _open_combat()
	plain.debounce_ms = 0
	var animated := await _open_combat()
	animated.debounce_ms = 0
	animated.reduced_motion = false
	for node in [plain, animated]:
		node.submit_action(RZRules.ACTION_ATTACK)
		node.submit_action(RZRules.ACTION_GUARD)
		node.submit_action(RZRules.ACTION_SKILL)
		node.submit_action(RZRules.ACTION_ATTACK)
	_expect(plain.session.state.state_hash() == animated.session.state.state_hash(),
		"same inputs give the same state with animations on or off")
	_expect(animated.session.state.outcome == plain.session.state.outcome,
		"animation never alters the outcome")
	_close(plain)
	_close(animated)

func _test_title_scene_links_to_combat() -> void:
	_expect(ResourceLoader.exists(COMBAT_SCENE), "the combat scene exists as a resource")
	_expect(ResourceLoader.exists("res://scenes/loadout.tscn"),
		"the loadout scene exists as a resource")
	_expect(ResourceLoader.exists("res://scenes/result.tscn"),
		"the result scene exists as a resource")
	var scene: PackedScene = load(TITLE_SCENE)
	var node: Control = scene.instantiate()
	root.add_child(node)
	await process_frame
	var has_hint := node.find_children("StartHint", "Label", true, false).size() == 1
	_expect(has_hint, "title screen shows the start hint")
	var text := ""
	for label in node.find_children("StartHint", "Label", true, false):
		text = label.text
	_expect(text.contains("ENTER"), "start hint names the key")
	_expect(RZCapture.requested_path() == "", "capture path is empty without the flag")
	var capture_err: Error = await RZCapture.save_after_frames(root,
		"user://rz_capture_probe.png")
	_expect(capture_err == ERR_UNAVAILABLE,
		"headless capture refuses instead of faking a saved file")
	_expect(not FileAccess.file_exists("user://rz_capture_probe.png"),
		"the refused capture writes no file")
	_close(node)

## Title interactions must all lead into combat: the Start button, a click
## anywhere on the background, and the ENTER key. Background clicks were
## swallowed by the full-screen ColorRect before this test existed (owner
## report: "only got a screen about the game, nothing else").
func _test_title_input_paths() -> void:
	var title := await _open_title()
	var art: TextureRect = title.get_node("%LandingArt")
	_expect(art.texture != null, "landing art texture is loaded")
	_expect(art.texture.get_width() == 1280 and art.texture.get_height() == 720,
		"landing art matches the design resolution")
	_expect(art.mouse_filter == Control.MOUSE_FILTER_IGNORE,
		"landing art does not swallow clicks")
	var quit_button: Button = title.get_node("%QuitButton")
	_expect(quit_button.focus_mode == Control.FOCUS_ALL \
		and quit_button.custom_minimum_size.y >= 40.0,
		"title has a keyboard-focusable Quit button")
	_expect(title.mouse_filter == Control.MOUSE_FILTER_IGNORE,
		"the title root does not swallow clicks")
	_expect(title.get_node("Background").mouse_filter == Control.MOUSE_FILTER_IGNORE,
		"the title background does not swallow clicks")
	_expect(title.get_node("Center").mouse_filter == Control.MOUSE_FILTER_IGNORE,
		"the title column does not swallow clicks")
	var start: Button = title.get_node("%StartButton")
	_expect(start.custom_minimum_size.y >= 48.0, "start button meets the touch target size")
	_expect(start.focus_mode == Control.FOCUS_ALL, "start button is keyboard focusable")
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = Vector2(40, 680)
	root.push_input(click, true)
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Loadout",
		"a background click opens the loadout screen")
	_expect(current_scene.get_node("%OptionsBox").get_child_count() == 3,
		"the loadout screen reached from the title lists the three choices")
	title.free()
	title = await _open_title()
	var enter := InputEventKey.new()
	enter.keycode = KEY_ENTER
	enter.pressed = true
	root.push_input(enter, true)
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Loadout",
		"pressing ENTER opens the loadout screen")
	title.free()
	title = await _open_title()
	title.get_node("%StartButton").pressed.emit()
	await process_frame
	await process_frame
	_expect(current_scene != null and current_scene.name == "Loadout",
		"the start button opens the loadout screen")
	if is_instance_valid(title):
		title.free()
	if current_scene != null:
		current_scene.free()
		current_scene = null
