extends SceneTree
## Independent validator regression for V-001 (not part of the agent's 86 checks).
## Run after importing game/ with the pinned Godot build.
## Expected to FAIL against caf1cce: Guard must halve only the next incoming hit.

func _initialize() -> void:
	var state := RZCombatState.new()
	state.actors.append(RZActorState.make("hero", "Hero", "hero", 100, 12, 3, 6, 6))
	# Deliberately reverse input order; stable actor IDs determine first hit.
	state.actors.append(RZActorState.make("enemy_b", "B", "enemy", 35, 9, 1))
	state.actors.append(RZActorState.make("enemy_a", "A", "enemy", 35, 9, 1))
	var original_hash := state.state_hash()
	var result := RZCombatResolver.resolve(state, RZCombatCommand.make(1, "hero", "guard"))
	var hits: Array = []
	for event in result.events:
		if event.type == "damage":
			hits.append(event.payload.amount)
	var hp: int = result.state.actor_by_id("hero").hp
	print("GUARD CONTRACT: expected hits=[3, 6], actual=", hits)
	print("GUARD CONTRACT: expected hero_hp=91, actual=", hp)
	print("INPUT STATE UNCHANGED: ", state.state_hash() == original_hash)
	if result.accepted and hits == [3, 6] and hp == 91 and state.state_hash() == original_hash:
		print("GUARD CONTRACT PASSED")
		quit(0)
	else:
		printerr("GUARD CONTRACT FAILED: matches neither single-hit requirement nor its acceptance outcome")
		quit(1)
