extends SceneTree
## Deterministic placeholder SFX generator (RZ-010).
##
##   cd runtime-zero
##   source tools/env.sh
##   godot --headless --path game --script "$PWD/tools/make_sfx.gd"
##
## Writes 16-bit mono WAV cues to game/assets/audio/ and prints their sha256.
## Pure math + integer hashes: no randomness, no downloads, no external tools;
## re-running reproduces identical files. These are *placeholder* cues with real
## provenance (this generator); the audio phase (RZ-023+) replaces them with
## generated, reviewed assets. Kept short, quiet and distinct (no essential
## information is audio-only - every cue has a text/log counterpart).

const OUT_DIR := "res://assets/audio"
const RATE := 22050

func _initialize() -> void:
	var dir := DirAccess.open("res://")
	if dir != null and not dir.dir_exists("assets/audio"):
		dir.make_dir_recursive("assets/audio")
	var ok := true
	ok = _write("ui_click", _ui_click()) and ok
	ok = _write("hit", _hit()) and ok
	ok = _write("guard", _guard()) and ok
	ok = _write("skill", _skill()) and ok
	ok = _write("telegraph", _telegraph()) and ok
	ok = _write("victory", _victory()) and ok
	ok = _write("defeat", _defeat()) and ok
	quit(0 if ok else 1)

# ---------------------------------------------------------------- synth cores

func _hash01(a: int, b: int) -> float:
	var h := a * 73856093 ^ b * 19349663
	h = (h ^ (h >> 13)) * 1274126177
	h = h ^ (h >> 16)
	return float(abs(h) % 100000) / 100000.0

## Short attack, exponential decay; `curve` shapes the envelope.
static func _env(t: float, attack: float, decay: float) -> float:
	if t < attack:
		return t / maxf(attack, 0.0001)
	return exp(-(t - attack) / maxf(decay, 0.0001))

func _tone(freq: float, duration: float, attack: float, decay: float,
		volume: float, noise_mix := 0.0, seed := 1) -> PackedFloat32Array:
	var count := int(RATE * duration)
	var samples := PackedFloat32Array()
	samples.resize(count)
	for i in count:
		var t := float(i) / float(RATE)
		var value := sin(TAU * freq * t)
		if noise_mix > 0.0:
			value = value * (1.0 - noise_mix) \
				+ (_hash01(i + seed * 7717, seed) * 2.0 - 1.0) * noise_mix
		samples[i] = value * _env(t, attack, decay) * volume
	return samples

func _sequence(notes: Array, note_duration: float, volume: float) -> PackedFloat32Array:
	var samples := PackedFloat32Array()
	for index in notes.size():
		var freq: float = notes[index]
		var part := _tone(freq, note_duration, 0.004, note_duration * 0.55, volume,
			0.05, index + 3)
		samples.append_array(part)
	return samples

# ---------------------------------------------------------------- cues

func _ui_click() -> PackedFloat32Array:
	return _tone(1100.0, 0.07, 0.002, 0.025, 0.35, 0.25, 11)

func _hit() -> PackedFloat32Array:
	return _tone(150.0, 0.24, 0.003, 0.085, 0.55, 0.35, 17)

func _guard() -> PackedFloat32Array:
	var base := _tone(620.0, 0.26, 0.004, 0.10, 0.40, 0.10, 23)
	var overtone := _tone(1240.0, 0.26, 0.002, 0.06, 0.20, 0.0, 29)
	for i in base.size():
		base[i] = clampf(base[i] + overtone[i], -1.0, 1.0)
	return base

func _skill() -> PackedFloat32Array:
	var count := int(RATE * 0.34)
	var samples := PackedFloat32Array()
	samples.resize(count)
	for i in count:
		var t := float(i) / float(RATE)
		var freq := 300.0 + 600.0 * (t / 0.34)
		samples[i] = sin(TAU * freq * t) * _env(t, 0.006, 0.12) * 0.45
	return samples

func _telegraph() -> PackedFloat32Array:
	var samples := PackedFloat32Array()
	samples.append_array(_tone(880.0, 0.09, 0.003, 0.03, 0.40, 0.0, 31))
	samples.append_array(_tone(0.0, 0.05, 0.05, 0.05, 0.0, 0.0, 37))
	samples.append_array(_tone(880.0, 0.09, 0.003, 0.03, 0.40, 0.0, 41))
	return samples

func _victory() -> PackedFloat32Array:
	return _sequence([523.25, 659.25, 783.99], 0.14, 0.42)

func _defeat() -> PackedFloat32Array:
	return _sequence([392.0, 311.13, 261.63], 0.20, 0.42)

# ---------------------------------------------------------------- WAV writer

func _write(name: String, samples: PackedFloat32Array) -> bool:
	var path := OUT_DIR + "/" + name + ".wav"
	var err := _save_wav(path, samples)
	if err != OK:
		printerr("sfx: failed to write ", path, " (", err, ")")
		return false
	print("sfx written: %s  sha256=%s" % [path, FileAccess.get_sha256(path)])
	return true

func _save_wav(path: String, samples: PackedFloat32Array) -> Error:
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	for i in samples.size():
		var value := int(clampf(samples[i], -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, value)
	var byte_rate := RATE * 2
	var header := PackedByteArray()
	header.append_array("RIFF".to_ascii_buffer())
	header.append_array(_u32(36 + data.size()))
	header.append_array("WAVEfmt ".to_ascii_buffer())
	header.append_array(_u32(16))          # fmt chunk size
	header.append_array(_u16(1))           # PCM
	header.append_array(_u16(1))           # mono
	header.append_array(_u32(RATE))        # sample rate
	header.append_array(_u32(byte_rate))   # byte rate
	header.append_array(_u16(2))           # block align
	header.append_array(_u16(16))          # bits per sample
	header.append_array("data".to_ascii_buffer())
	header.append_array(_u32(data.size()))
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_buffer(header)
	file.store_buffer(data)
	file.close()
	return OK

func _u32(value: int) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(4)
	out.encode_u32(0, value)
	return out

func _u16(value: int) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize(2)
	out.encode_u16(0, value)
	return out
