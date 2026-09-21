class_name RZAudioService
extends Node
## Placeholder cue playback (RZ-010).
##
## Cues are deterministic generated WAVs (`tools/make_sfx.gd`) served by a small
## fixed voice pool. Playback respects the persisted mute setting, degrades
## silently when a stream is missing, and never raises. Essential information is
## never audio-only: every cue has a text/log counterpart (see DEMO.md).

const CUE_DIR := "res://assets/audio"
const CUE_NAMES := ["ui_click", "hit", "guard", "skill", "telegraph", "victory",
	"defeat"]
const VOICES := 4

var streams := {}

var _pool: Array[AudioStreamPlayer] = []
var _next := 0

func _ready() -> void:
	for cue_name in CUE_NAMES:
		var stream: AudioStream = load("%s/%s.wav" % [CUE_DIR, cue_name])
		if stream != null:
			streams[cue_name] = stream
	for i in VOICES:
		var player := AudioStreamPlayer.new()
		player.volume_db = -6.0
		add_child(player)
		_pool.append(player)

## Maps a domain event to its cue ("" = intentionally silent). Static so the
## mapping is unit-testable without instantiating the scene tree.
static func cue_for_event(type: String) -> String:
	match type:
		"damage", "defeated":
			return "hit"
		"guard_started", "guard_halved", "guard_expired":
			return "guard"
		"skill_used":
			return "skill"
		"boss_telegraph":
			return "telegraph"
		"victory":
			return "victory"
		"defeat", "stalled":
			return "defeat"
	return ""

## Plays a cue unless muted (or the cue is unknown/empty). Returns whether a
## sound was started. The mute flag is read from the profile at runtime: autoload
## scripts cannot reference other autoload identifiers at compile time.
func play(cue: String) -> bool:
	if cue.is_empty() or not streams.has(cue):
		return false
	var profile := get_node_or_null("/root/RZRun")
	if profile != null and bool(profile.setting("mute")):
		return false
	var player: AudioStreamPlayer = _pool[_next]
	_next = (_next + 1) % _pool.size()
	player.stream = streams[cue]
	player.play()
	return player.playing

## Stops every voice (used when sound is muted and during teardown).
func stop_all() -> void:
	for player in _pool:
		player.stop()
