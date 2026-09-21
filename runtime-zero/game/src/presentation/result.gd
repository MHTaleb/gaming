extends Control
## Result screen (RZ-008): outcome, reward, and the way onward.
##
## The victory advance happens HERE, exactly once per fight: RZRun.advance()
## consumes the reported victory, so duplicate clicks or a re-entered result
## screen cannot grant a second reward or skip an encounter. Defeat and stall
## record nothing; retry rebuilds the same encounter with full HP and energy.

const TITLE_SCENE := "res://scenes/title.tscn"
const LOADOUT_SCENE := "res://scenes/loadout.tscn"
const COMBAT_SCENE := "res://scenes/combat.tscn"

func _ready() -> void:
	print("[rz] result ready: outcome=%s complete=%s" % [RZRun.last_outcome, str(RZRun.run_complete)])
	%NextButton.pressed.connect(_next)
	%RetryButton.pressed.connect(_retry)
	%ReplayButton.pressed.connect(_replay)
	%TitleButton.pressed.connect(_title)
	%NextButton.visible = false
	%RetryButton.visible = false
	%ReplayButton.visible = false
	match RZRun.last_outcome:
		"victory":
			_show_victory()
		"stalled":
			%OutcomeTitle.text = "STALLED"
			%OutcomeDetail.text = "Round cap reached in %s - not a win. No progress recorded." % RZRun.last_encounter_title
			%RetryButton.visible = true
		_:
			%OutcomeTitle.text = "DEFEAT"
			%OutcomeDetail.text = "The hero has fallen in %s. No progress recorded; retry the fight or return to the title." % RZRun.last_encounter_title
			%RetryButton.visible = true

func _show_victory() -> void:
	var advanced: Dictionary = RZRun.advance()
	if not advanced.get("ok", false):
		%OutcomeTitle.text = "VICTORY"
		%OutcomeDetail.text = "%s cleared - already advanced." % RZRun.last_encounter_title
		%ReplayButton.visible = true
		return
	if advanced.get("complete", false):
		%OutcomeTitle.text = "RUN COMPLETE"
		%OutcomeDetail.text = "All %d encounters cleared. Reward %s%s." % [
			RZRun.encounter_count(), RZRun.last_reward_id,
			" granted" if RZRun.last_reward_granted else " (already recorded - granted once)"]
		%ReplayButton.visible = true
		return
	var next := RZRun.current_encounter()
	%OutcomeTitle.text = "VICTORY"
	%OutcomeDetail.text = "%s cleared. Reward %s%s.\nNext: %s (encounter %d of %d)." % [
		RZRun.last_encounter_title, RZRun.last_reward_id,
		" granted" if RZRun.last_reward_granted else " (already recorded - granted once)",
		str(next.get("title", "")), RZRun.encounter_number(), RZRun.encounter_count()]
	%NextButton.visible = true

func _next() -> void:
	RZAudio.play("ui_click")
	get_tree().change_scene_to_file(COMBAT_SCENE)

func _retry() -> void:
	RZAudio.play("ui_click")
	RZRun.retry()
	get_tree().change_scene_to_file(COMBAT_SCENE)

func _replay() -> void:
	RZAudio.play("ui_click")
	RZRun.reset()
	get_tree().change_scene_to_file(LOADOUT_SCENE)

func _title() -> void:
	RZAudio.play("ui_click")
	RZRun.reset()
	get_tree().change_scene_to_file(TITLE_SCENE)
