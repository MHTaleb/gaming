class_name RZCombatEvent
extends RefCounted
## One ordered, immutable domain event: {sequence, turn_index, type, actor_id,
## target_id, payload} (DATA_CONTRACTS). Sequence numbers strictly increase.

var sequence: int = 0
var turn_index: int = 0
var type: String = ""
var actor_id: String = ""
var target_id: String = ""
var payload: Dictionary = {}

static func make(p_sequence: int, p_turn_index: int, p_type: String, p_actor_id: String,
		p_target_id: String, p_payload: Dictionary = {}) -> RZCombatEvent:
	var event := RZCombatEvent.new()
	event.sequence = p_sequence
	event.turn_index = p_turn_index
	event.type = p_type
	event.actor_id = p_actor_id
	event.target_id = p_target_id
	event.payload = p_payload
	return event

func to_dict() -> Dictionary:
	return {
		"sequence": sequence,
		"turn_index": turn_index,
		"type": type,
		"actor_id": actor_id,
		"target_id": target_id,
		"payload": payload,
	}
