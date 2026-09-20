class_name RZCombatCommand
extends RefCounted
## One player intent: {turn_index, actor_id, action_id, target_id} (DATA_CONTRACTS).
## The resolver validates the command; nothing here mutates state.

var turn_index: int = 0
var actor_id: String = ""
var action_id: String = ""
## Empty for guard; the target enemy's actor id for attack and skill.
var target_id: String = ""

static func make(p_turn_index: int, p_actor_id: String, p_action_id: String,
		p_target_id: String = "") -> RZCombatCommand:
	var command := RZCombatCommand.new()
	command.turn_index = p_turn_index
	command.actor_id = p_actor_id
	command.action_id = p_action_id
	command.target_id = p_target_id
	return command

func to_dict() -> Dictionary:
	return {
		"schema_version": RZRules.SCHEMA_VERSION,
		"turn_index": turn_index,
		"actor_id": actor_id,
		"action_id": action_id,
		"target_id": target_id,
	}
