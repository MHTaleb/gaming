extends SceneTree
## Headless feedback/audio test suite (RZ-010).
##   godot --headless --path game --script res://tests/feedback_tests.gd
## Covers the generated cue assets, the event->cue mapping, mute behavior and
## persistence, and the settings checkboxes in the real scenes.

const CUE_NAMES := ["ui_click", "hit", "guard", "skill", "telegraph", "victory",
	"defeat"]
const EVENT_TYPES := ["damage", "guard_started", "guard_halved", "guard_expired",
	"skill_used", "defeated", "boss_telegraph", "energy_regenerated", "victory",
	"defeat", "stalled"]

var _checks := 0
var _failures := 0

func _initialize() -> void:
	var run: RZRunService = root.get_node("RZRun")
	var audio: RZAudioService = root.get_node("RZAudio")
	# Autoload _ready lands on the first frame; settle before redirecting saves.
	await process_frame
	run.profile_path = "user://test-feedback-save.json"
	_wipe(run)
	run.reload_profile()
	_test_cue_assets(audio)
	_test_cue_mapping(audio)
	_test_mute_behavior(run, audio)
	await _test_scene_settings_ui(run, audio)
	_wipe(run)
	run.profile_path = RZSaveRepository.DEFAULT_PATH
	run.reload_profile()
	if _failures == 0:
		print("ALL FEEDBACK TESTS PASSED (%d checks)" % _checks)
		quit(0)
	else:
		printerr("FEEDBACK TESTS FAILED: %d of %d checks failed" % [_failures, _checks])
		quit(1)

# ---------------------------------------------------------------- helpers

func _expect(condition: bool, label: String) -> void:
	_checks += 1
	if condition:
		print("  ok  ", label)
	else:
		_failures += 1
		printerr("  FAIL ", label)

func _wipe(run: RZRunService) -> void:
	for suffix in ["", ".bak", ".tmp"]:
		var path: String = run.profile_path + suffix
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

# ---------------------------------------------------------------- tests

func _test_cue_assets(audio: RZAudioService) -> void:
	for cue_name in CUE_NAMES:
		var stream: AudioStream = load("res://assets/audio/%s.wav" % cue_name)
		_expect(stream is AudioStreamWAV and stream.get_length() > 0.03,
			"cue %s decodes with a real duration" % cue_name)
		var audible := false
		if stream is AudioStreamWAV:
			var data: PackedByteArray = (stream as AudioStreamWAV).data
			for i in range(0, data.size() - 1, 2):
				if absi(data.decode_s16(i)) > 300:
					audible = true
					break
		_expect(audible, "cue %s carries audible samples" % cue_name)
		_expect(audio.streams.has(cue_name),
			"the audio service loaded %s" % cue_name)

func _test_cue_mapping(audio: RZAudioService) -> void:
	_expect(RZAudioService.cue_for_event("damage") == "hit", "damage maps to hit")
	_expect(RZAudioService.cue_for_event("guard_halved") == "guard"
		and RZAudioService.cue_for_event("guard_started") == "guard",
		"guard events map to guard")
	_expect(RZAudioService.cue_for_event("skill_used") == "skill",
		"skill maps to skill")
	_expect(RZAudioService.cue_for_event("boss_telegraph") == "telegraph",
		"telegraph maps to telegraph")
	_expect(RZAudioService.cue_for_event("victory") == "victory", "victory maps")
	_expect(RZAudioService.cue_for_event("defeat") == "defeat"
		and RZAudioService.cue_for_event("stalled") == "defeat",
		"defeat and stall share the defeat cue")
	_expect(RZAudioService.cue_for_event("energy_regenerated") == "",
		"energy regen stays silent")
	var all_ok := true
	for type in EVENT_TYPES:
		var cue := RZAudioService.cue_for_event(type)
		if not (cue.is_empty() or audio.streams.has(cue)):
			all_ok = false
	_expect(all_ok, "every combat event type maps to a loaded cue or silence")

func _test_mute_behavior(run: RZRunService, audio: RZAudioService) -> void:
	run.set_setting("mute", true)
	_expect(audio.play("hit") == false, "mute blocks playback")
	run.set_setting("mute", false)
	_expect(audio.play("hit") == true, "an unmuted cue starts")
	_expect(audio.play("does_not_exist") == false,
		"an unknown cue is silent, not an error")
	run.set_setting("mute", true)
	run.reload_profile()
	_expect(run.setting("mute") == true, "mute survives a profile reload")

func _test_scene_settings_ui(run: RZRunService, audio: RZAudioService) -> void:
	run.set_setting("mute", true)
	run.set_setting("reduced_motion", true)
	var title_scene: PackedScene = load("res://scenes/title.tscn")
	var title: Control = title_scene.instantiate()
	root.add_child(title)
	await process_frame
	var mute: CheckBox = title.get_node("%MuteCheck")
	_expect(mute.button_pressed and mute.focus_mode == Control.FOCUS_ALL,
		"title mute checkbox reflects the saved setting and is focusable")
	root.remove_child(title)
	title.free()
	var combat_scene: PackedScene = load("res://scenes/combat.tscn")
	var combat: Control = combat_scene.instantiate()
	root.add_child(combat)
	await process_frame
	var combat_mute: CheckBox = combat.get_node("%MuteCheck")
	var reduced: CheckBox = combat.get_node("%ReducedMotion")
	_expect(combat_mute.button_pressed and reduced.button_pressed,
		"combat checkboxes reflect the saved settings")
	combat_mute.button_pressed = false
	run.reload_profile()
	_expect(run.setting("mute") == false,
		"toggling the checkbox persists the new setting")
	root.remove_child(combat)
	combat.free()
	audio.stop_all()
	await process_frame
