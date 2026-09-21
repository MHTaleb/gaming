class_name RZReplayRunner
extends RefCounted
## Canonical replay execution (RZ-011).
##
## A replay is a command list for one encounter; running it through the SAME
## RZCombatSession the UI uses produces a deterministic digest of the final state
## and the ordered event stream. Fixtures pin those digests, so any change to the
## core or content fails the replay suite until it is reviewed and regenerated
## with tools/make_replay_fixtures.gd.
##
## Rejected commands are recorded (not fatal): a replay with an intentionally
## invalid entry stays comparable.

const FORMAT_VERSION := 1

static func play(encounter_id: String, equipment_id: String,
		commands: Array) -> Dictionary:
	var session := RZCombatSession.start(encounter_id, equipment_id)
	if session.state == null:
		return {"ok": false, "errors": session.errors}
	var events: Array = []
	var rejected: Array = []
	for command in commands:
		if typeof(command) != TYPE_DICTIONARY:
			continue
		var result := session.request_action(str(command.get("action", "")),
			str(command.get("target", "")))
		if result.get("accepted", false):
			events.append_array(result.get("events", []))
		else:
			rejected.append(str(result.get("reason", "")))
	var hero := session.hero()
	return {
		"ok": true,
		"outcome": session.state.outcome,
		"turns": session.state.turn_index,
		"hero_hp": hero.hp if hero != null else -1,
		"event_count": events.size(),
		"event_digest": event_digest(events),
		"final_state_hash": session.state.state_hash(),
		"rejected": rejected,
	}

## Stable text digest of an ordered event stream (sequence, turn, type, actors,
## payload). sha256 keeps fixture diffs small.
static func event_digest(events: Array) -> String:
	var lines := PackedStringArray()
	for event in events:
		lines.append("%d|%d|%s|%s|%s|%s" % [event.sequence, event.turn_index,
			event.type, event.actor_id, event.target_id,
			JSON.stringify(event.payload)])
	return "\n".join(lines).sha256_text()
