#!/usr/bin/env bash
# Owner-controlled swap between the shipped procedural stage art (RZ-036,
# deterministic, hash-pinned) and the SDXL-Turbo candidates generated locally
# by tools/make_ai_backdrops.py (RZ-037).
#
#   tools/use_ai_backdrops.sh copy     # try the AI candidates in-game
#   tools/use_ai_backdrops.sh revert   # restore the procedural art (re-run)
#
# Review material is validation/evidence/037/map-with-ai-backdrop.png and
# combat-with-ai-backdrop.png (committed); the candidates themselves live in
# validation/evidence/037/candidates/ which the repo .gitignore keeps out of
# history by design. If the folder is missing (fresh clone), regenerate with:
#   1. ~/ai/comfy-venv/bin/python ~/ai/ComfyUI/main.py --port 8188   (once)
#   2. python3 tools/make_ai_backdrops.py validation/evidence/037/candidates
# The procedural art stays the shipped default until the owner approves the AI
# look at the RZ-012 style gate; until then this script is the deliberate,
# reversible opt-in for playtesting.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
CANDIDATES="$ROOT/validation/evidence/037/candidates"
TARGET="$ROOT/game/assets/backdrops"

usage() {
	sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

MODE="${1:-}"
case "$MODE" in
copy)
	for region in intrusion load_spike server_cathedral; do
		source_png="$CANDIDATES/${region}_sdxl.png"
		if [[ ! -f "$source_png" ]]; then
			echo "missing candidate: $source_png" >&2
			echo "candidates/ is gitignored by repo convention; regenerate:" >&2
			echo "  1. ~/ai/comfy-venv/bin/python ~/ai/ComfyUI/main.py --port 8188" >&2
			echo "  2. python3 tools/make_ai_backdrops.py validation/evidence/037/candidates" >&2
			exit 1
		fi
		cp "$source_png" "$TARGET/${region}.png"
	done
	# Godot serves textures from its import cache: re-import, or the game
	# keeps showing the previous art (verified in RZ-037).
	source "$ROOT/tools/env.sh" >/dev/null
	godot --headless --path "$ROOT/game" --import >/dev/null 2>&1
	echo "AI candidates copied into game/assets/backdrops/ and re-imported."
	echo "Run:  tools/demo.sh run        (or 'capture <png> map' / 'capture <png> combat')"
	echo "Revert with: tools/use_ai_backdrops.sh revert"
	;;
revert)
	# The procedural generator is deterministic: re-running restores the
	# hash-pinned art exactly (see validation/evidence/036/art-hashes.txt).
	source "$ROOT/tools/env.sh" >/dev/null
	godot --headless --path "$ROOT/game" --script "$ROOT/tools/make_stage_art.gd" 2>&1 | grep sha256
	godot --headless --path "$ROOT/game" --import >/dev/null 2>&1
	echo "Procedural stage art restored (hashes above) and re-imported."
	;;
*)
	usage
	exit 1
	;;
esac
