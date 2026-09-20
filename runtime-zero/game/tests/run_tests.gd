extends SceneTree
## Headless combat test entry point (RZ-005).
##   godot --headless --path game --script res://tests/run_tests.gd
## Nonzero exit on any failure. Tests instantiate the same domain services the
## game uses; no scene tree, GPU or wall-clock dependency.

var _checks := 0
var _failures := 0

func _initialize() -> void:
	_test_attack_mitigation_and_clamps()
	_test_skill_cost_and_bounds()
	_test_invalid_commands_consume_nothing()
	_test_guard_halves_and_expires()
	_test_enemy_order_and_dead_skip()
	_test_terminal_states()
	_test_boss_telegraph_and_heavy()
	_test_round_cap_stall()
	_test_determinism_and_event_sequence()
	if _failures == 0:
		print("ALL TESTS PASSED (%d checks)" % _checks)
		quit(0)
	else:
		printerr("TESTS FAILED: %d of %d checks failed" % [_failures, _checks])
		quit(1)

# ---------------------------------------------------------------- fixtures

func _hero() -> RZActorState:
	return RZActorState.make("hero", "Hero", "hero", 100, 12, 3, 6, 6)

func _basic_state() -> RZCombatState:
	var state := RZCombatState.new()
	state.actors.append(_hero())
	state.actors.append(RZActorState.make("memory_leak", "Memory Leak", "enemy", 35, 9, 1))
	return state

func _boss_state() -> RZCombatState:
	var state := RZCombatState.new()
	state.actors.append(_hero())
	state.actors.append(RZActorState.make("server_cathedral", "Server Cathedral", "boss", 90, 12, 2))
	return state

func _two_enemy_state() -> RZCombatState:
	var state := RZCombatState.new()
	state.actors.append(_hero())
	# Deliberately appended out of ID order: resolution must sort by actor ID.
	state.actors.append(RZActorState.make("enemy_b", "Null Pointer", "enemy", 35, 9, 1))
	state.actors.append(RZActorState.make("enemy_a", "Memory Leak", "enemy", 35, 9, 1))
	return state

func _cmd(state: RZCombatState, action: String, target: String = "") -> RZCombatCommand:
	return RZCombatCommand.make(state.turn_index, "hero", action, target)

func _resolve(state: RZCombatState, action: String, target: String = "") -> Dictionary:
	return RZCombatResolver.resolve(state, _cmd(state, action, target))

func _types(events: Array) -> Array:
	var out: Array = []
	for event in events:
		out.append(event.type)
	return out

func _all_sequence_numbers(events: Array) -> Array:
	var out: Array = []
	for event in events:
		out.append(event.sequence)
	return out

# ---------------------------------------------------------------- tests

func _test_attack_mitigation_and_clamps() -> void:
	var state := _basic_state()
	var before := state.state_hash()
	var result := _resolve(state, "attack", "memory_leak")
	_expect(result.accepted, "attack accepted")
	var next: RZCombatState = result.state
	_expect(next.state_hash() != before, "accepted command changes state")
	var enemy := next.actor_by_id("memory_leak")
	_expect_eq(enemy.hp, 24, "attack damage = max(1, 12-1) = 11")
	_expect_eq(next.turn_index, 2, "accepted command advances the round")
	_expect_eq(next.actor_by_id("hero").energy, 6, "energy regen is capped at 6")

	# Lethal hit clamps at zero and produces ordered defeat+victory terminal events.
	var kill_state := _basic_state()
	kill_state.actor_by_id("memory_leak").hp = 5
	var kill := _resolve(kill_state, "attack", "memory_leak")
	_expect_eq(kill.state.actor_by_id("memory_leak").hp, 0, "hp clamps at zero, never negative")
	_expect_eq(kill.state.outcome, RZCombatState.Outcome.VICTORY, "all enemies dead -> victory")
	var kill_types := _types(kill.events)
	_expect(kill_types.has("defeated"), "defeated event emitted")
	_expect_eq(kill_types[kill_types.size() - 1], "victory", "victory evaluated after the action")

func _test_skill_cost_and_bounds() -> void:
	var state := _basic_state()
	var result := _resolve(state, "skill", "memory_leak")
	_expect(result.accepted, "skill accepted with 6 energy")
	var next: RZCombatState = result.state
	_expect_eq(next.actor_by_id("hero").energy, 4, "skill costs 3 then +1 round regen")
	_expect_eq(next.actor_by_id("memory_leak").hp, 12, "skill damage = max(1, 24-1) = 23")
	var skill_event: RZCombatEvent = result.events[0]
	_expect_eq(skill_event.payload.energy_cost, 3, "skill event records its cost")

	var broke := _basic_state()
	broke.actor_by_id("hero").energy = 0
	var before := broke.state_hash()
	var rejected := _resolve(broke, "skill", "memory_leak")
	_expect(not rejected.accepted, "skill without energy is rejected")
	_expect_eq(rejected.reason, RZCombatResolver.REASON_INSUFFICIENT_ENERGY, "rejection reason is insufficient_energy")
	_expect_eq(rejected.state.state_hash(), before, "rejected skill consumes nothing")
	_expect_eq(rejected.events.size(), 0, "rejected skill emits no events")

func _test_invalid_commands_consume_nothing() -> void:
	var state := _basic_state()
	var cases := [
		[RZCombatCommand.make(state.turn_index, "hero", "dance", "memory_leak"), RZCombatResolver.REASON_UNKNOWN_ACTION],
		[RZCombatCommand.make(99, "hero", "attack", "memory_leak"), RZCombatResolver.REASON_STALE_TURN],
		[RZCombatCommand.make(state.turn_index, "hero", "attack", ""), RZCombatResolver.REASON_TARGET_MISSING],
		[RZCombatCommand.make(state.turn_index, "ghost", "attack", "memory_leak"), RZCombatResolver.REASON_ACTOR_MISSING],
		[RZCombatCommand.make(state.turn_index, "memory_leak", "attack", "hero"), RZCombatResolver.REASON_NOT_HERO],
	]
	for pair in cases:
		var before := state.state_hash()
		var result := RZCombatResolver.resolve(state, pair[0])
		_expect(not result.accepted, "rejected: " + pair[1])
		_expect_eq(result.reason, pair[1], "reason: " + pair[1])
		_expect_eq(result.state.state_hash(), before, "no state change for " + pair[1])
		_expect_eq(result.events.size(), 0, "no events for " + pair[1])

	var hero_dead := _basic_state()
	hero_dead.actor_by_id("hero").hp = 0
	_expect_eq(_resolve(hero_dead, "attack", "memory_leak").reason, RZCombatResolver.REASON_ACTOR_DEAD,
		"dead actor cannot act")

	var target_dead := _basic_state()
	target_dead.actor_by_id("memory_leak").hp = 0
	_expect_eq(_resolve(target_dead, "attack", "memory_leak").reason, RZCombatResolver.REASON_TARGET_DEAD,
		"dead target is rejected")

	var duplicate := _resolve(state, "attack", "memory_leak")
	_expect(duplicate.accepted, "setup command accepted")
	var replayed := RZCombatResolver.resolve(duplicate.state,
		RZCombatCommand.make(1, "hero", "attack", "memory_leak"))
	_expect(not replayed.accepted, "replaying an old turn index is rejected")
	_expect_eq(replayed.reason, RZCombatResolver.REASON_STALE_TURN, "duplicate input is stale, not re-executed")

func _test_guard_halves_and_expires() -> void:
	var state := _basic_state()
	var first := _resolve(state, "guard")
	_expect(first.accepted, "guard accepts an empty target")
	var after_first: RZCombatState = first.state
	_expect_eq(after_first.actor_by_id("hero").hp, 97, "6 damage halved to 3 (floor, min 1)")
	_expect(after_first.actor_by_id("hero").guard_active, "guard stays active until the hero's next turn")
	var halved: RZCombatEvent = null
	for event in first.events:
		if event.type == "guard_halved":
			halved = event
			break
	_expect(halved != null, "guard_halved event emitted")
	if halved != null:
		_expect_eq(halved.payload.before, 6, "halving records the before value")
		_expect_eq(halved.payload.after, 3, "halving records the after value")

	var second := _resolve(after_first, "guard")
	var after_second: RZCombatState = second.state
	var guard_events := _types(second.events)
	_expect(guard_events.has("guard_expired"), "previous guard expires at the hero's next turn")
	_expect_eq(after_second.actor_by_id("hero").hp, 94, "second guard halves again (no stacking, no quartering)")
	_expect(after_second.actor_by_id("hero").guard_active, "re-guarding starts fresh")

func _test_enemy_order_and_dead_skip() -> void:
	var state := _two_enemy_state()
	state.actor_by_id("enemy_a").hp = 5
	var result := _resolve(state, "attack", "enemy_a")
	_expect(result.accepted, "attack with two enemies accepted")
	var next: RZCombatState = result.state
	var damage_sources: Array = []
	for event in result.events:
		if event.type == "damage":
			damage_sources.append(event.actor_id)
	_expect(damage_sources.has("enemy_b"), "living enemy_b acts after enemy_a dies")
	_expect(not damage_sources.has("enemy_a"), "defeated enemy_a does not act")
	_expect_eq(result.events[0].actor_id, "hero", "hero acts before the enemy phase")
	_expect_eq(next.actor_by_id("hero").hp, 94, "only one enemy attack landed (6 damage)")

	# Stable ID order with both alive.
	var both := _two_enemy_state()
	var second_result := _resolve(both, "guard")
	var order: Array = []
	for event in second_result.events:
		if event.type == "damage":
			order.append(event.actor_id)
	_expect_eq(order, ["enemy_a", "enemy_b"], "enemies resolve in stable actor-ID order")

func _test_terminal_states() -> void:
	var finish_state := _basic_state()
	finish_state.actor_by_id("memory_leak").hp = 1
	var finish := _resolve(finish_state, "attack", "memory_leak")
	_expect_eq(finish.state.outcome, RZCombatState.Outcome.VICTORY, "victory reached")
	var after: String = finish.state.state_hash()
	var blocked := RZCombatResolver.resolve(finish.state, _cmd(finish.state, "attack", "memory_leak"))
	_expect(not blocked.accepted, "commands after victory are rejected")
	_expect_eq(blocked.reason, RZCombatResolver.REASON_TERMINAL, "reason is combat_over")
	_expect_eq(blocked.state.state_hash(), after, "terminal combat cannot be mutated")

	var defeat_state := _basic_state()
	defeat_state.actor_by_id("hero").hp = 3
	var defeat := _resolve(defeat_state, "attack", "memory_leak")
	_expect_eq(defeat.state.outcome, RZCombatState.Outcome.DEFEAT, "hero death -> defeat")
	_expect_eq(defeat.state.actor_by_id("hero").hp, 0, "hero hp clamps at zero")
	_expect(_types(defeat.events).has("defeat"), "defeat event emitted")

func _test_boss_telegraph_and_heavy() -> void:
	var state := _boss_state()
	var rounds := 0
	while not state.actor_by_id("server_cathedral").telegraph_pending and rounds < 3:
		var result := _resolve(state, "guard")
		state = result.state
		rounds += 1
	_expect(state.actor_by_id("server_cathedral").telegraph_pending, "telegraph set after three normal attacks")
	_expect_eq(rounds, 3, "telegraph needs exactly three normal attacks")
	_expect_eq(state.actor_by_id("hero").hp, 88, "3 guarded normal hits: 9 -> 4 each")

	var heavy := _resolve(state, "guard")
	var heavy_state: RZCombatState = heavy.state
	_expect(not heavy_state.actor_by_id("server_cathedral").telegraph_pending, "telegraph consumed by the heavy attack")
	var heavy_event: RZCombatEvent = null
	for event in heavy.events:
		if event.type == "damage" and event.actor_id == "server_cathedral":
			heavy_event = event
	_expect(heavy_event != null, "heavy attack damage event exists")
	if heavy_event != null:
		_expect_eq(heavy_event.payload.kind, "heavy", "heavy attack is marked heavy")
		# raw 24 - defense 3 = 21; guard floor(21/2) = 10.
		_expect_eq(heavy_event.payload.amount, 10, "heavy damage is doubled attack, guarded with floor")
	_expect_eq(heavy_state.actor_by_id("hero").hp, 78, "heavy hit applied exactly once")

func _test_round_cap_stall() -> void:
	_expect_eq(RZRules.ROUND_CAP, 50, "default round cap pinned at 50")
	var state := _basic_state()
	state.max_rounds = 3
	for i in 3:
		var result := _resolve(state, "guard")
		_expect(result.accepted, "guard %d accepted before the cap" % (i + 1))
		state = result.state
	_expect_eq(state.outcome, RZCombatState.Outcome.STALLED, "round cap ends the combat explicitly")
	_expect(state.outcome != RZCombatState.Outcome.VICTORY, "stall is never a win")
	var stall_result := _resolve(state, "guard")
	_expect(not stall_result.accepted, "stalled combat rejects further commands")

func _test_determinism_and_event_sequence() -> void:
	var first_events: Array = []
	var first_state := _basic_state()
	for action in ["attack", "skill", "attack"]:
		var result := _resolve(first_state, action, "memory_leak")
		_expect(result.accepted, "scripted action accepted: " + action)
		first_state = result.state
		first_events.append_array(result.events)

	var second_state := _basic_state()
	var second_events: Array = []
	for action in ["attack", "skill", "attack"]:
		var result := _resolve(second_state, action, "memory_leak")
		second_state = result.state
		second_events.append_array(result.events)

	_expect_eq(first_state.outcome, RZCombatState.Outcome.VICTORY, "scripted sequence wins")
	_expect_eq(first_state.state_hash(), second_state.state_hash(), "same inputs -> identical final state")
	_expect_eq(JSON.stringify(first_events.map(func(e): return e.to_dict())),
		JSON.stringify(second_events.map(func(e): return e.to_dict())),
		"same inputs -> identical event stream")

	var sequences := _all_sequence_numbers(first_events)
	var monotonic := true
	for i in sequences.size():
		if sequences[i] != i + 1:
			monotonic = false
	_expect(monotonic and sequences.size() > 0, "event sequence numbers strictly increase from 1")

# ---------------------------------------------------------------- harness

func _expect(condition: bool, label: String) -> void:
	_checks += 1
	if condition:
		print("  ok  " + label)
	else:
		_failures += 1
		printerr("  FAIL " + label)

func _expect_eq(actual: Variant, expected: Variant, label: String) -> void:
	_checks += 1
	if typeof(actual) == typeof(expected) and actual == expected:
		print("  ok  " + label)
	else:
		_failures += 1
		printerr("  FAIL " + label + " (expected %s, got %s)" % [str(expected), str(actual)])
