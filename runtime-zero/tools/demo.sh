#!/usr/bin/env bash
# Runtime Zero demo runner (RZ-031).
#
# One documented command to try the current build or to produce a hash-recorded
# capture for a reviewer without laptop access. Everything runs through
# tools/env.sh (pinned Godot 4.7.2, PATH normalized for bash and zsh).
#
#   tools/demo.sh run [title|combat] [extra godot args...]
#       Opens the current build on the desktop (WSLg). Ctrl+C/Q to quit.
#       Verification example: tools/demo.sh run --quit-after 300
#
#   tools/demo.sh capture <png-path> [title|combat|map]
#       Saves one PNG of the scene, prints its sha256 and exits. The map capture
#       starts a demo run so the work map has tickets to show.
#
#   tools/demo.sh smoke <dir>
#       Scripted Attack/Guard/Skill run of the combat scene: one PNG per action
#       plus a state summary; used for milestone captures and evidence.
#
#   RZ_GL=hardware tools/demo.sh run
#       Use the native WSLg GL path instead of Mesa software rendering. The
#       native D3D12 path crashes intermittently after ~20 s on this machine
#       (RZ-033); the runner therefore defaults to software rendering on WSL.
#
# The runner adds no gameplay state, no network calls and no credentials, and it
# does not bypass the RZ-012 owner review gate: it only plays the current build.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

usage() {
	sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

if [[ $# -lt 1 || "$1" == "--help" || "$1" == "-h" ]]; then
	usage
	exit 0
fi

MODE="$1"
shift

if [[ ! -f "$ROOT/tools/env.sh" ]]; then
	echo "demo: tools/env.sh missing under $ROOT" >&2
	exit 1
fi
# shellcheck source=/dev/null
source "$ROOT/tools/env.sh" >/dev/null
cd "$ROOT"

if [[ -z "${DISPLAY:-}" ]]; then
	echo "demo: no DISPLAY - the game opens a window; run this from a WSLg terminal (echo \$DISPLAY should print :0)" >&2
	exit 1
fi

# Rendering path (RZ-033): the native WSLg D3D12 GL path crashes intermittently
# after ~20 s of runtime (Mesa swrast interop; reproduced with a minimal Godot
# project, 3 of 4 runs, so it is the environment, not the game). Default to
# Mesa's software rasterizer; RZ_GL=hardware opts back into the native path.
if [[ "${RZ_GL:-software}" != "hardware" ]] && grep -qi microsoft /proc/version 2>/dev/null; then
	export LIBGL_ALWAYS_SOFTWARE=1
fi

case "$MODE" in
run)
	SCENE="title"
	if [[ $# -gt 0 && ( "$1" == "title" || "$1" == "combat" ) ]]; then
		SCENE="$1"
		shift
	fi
	CODE=0
	if [[ "$SCENE" == "combat" ]]; then
		godot --path game res://scenes/combat.tscn "$@" || CODE=$?
	else
		godot --path game "$@" || CODE=$?
	fi
	if [[ $CODE -ge 128 ]]; then
		echo "demo: the engine exited with code $CODE (crash/abort)." >&2
		echo "demo: the runner already uses the stable software rendering path; if this" >&2
		echo "demo: repeats, run 'wsl --shutdown' in Windows PowerShell and reopen the terminal." >&2
		echo "demo: Godot saved a log under ~/.local/share/godot/app_userdata/Runtime Zero/logs/" >&2
	fi
	exit $CODE
	;;
capture)
	if [[ $# -lt 1 ]]; then
		echo "demo: capture needs a png path (tools/demo.sh capture <png-path> [title|combat])" >&2
		exit 1
	fi
	PNG="$1"
	SCENE="title"
	if [[ $# -gt 1 && ( "$2" == "title" || "$2" == "combat" || "$2" == "map" ) ]]; then
		SCENE="$2"
	fi
	mkdir -p "$(dirname "$PNG")"
	ABS="$(cd "$(dirname "$PNG")" && pwd)/$(basename "$PNG")"
	if [[ "$SCENE" == "combat" ]]; then
		godot --path game res://scenes/combat.tscn -- --capture "$ABS"
	elif [[ "$SCENE" == "map" ]]; then
		godot --path game res://scenes/map.tscn -- --demo-run --capture "$ABS"
	else
		godot --path game -- --capture "$ABS"
	fi
	echo "demo: capture scene=$SCENE file=$ABS"
	sha256sum "$ABS"
	;;
smoke)
	if [[ $# -lt 1 ]]; then
		echo "demo: smoke needs a directory (tools/demo.sh smoke <dir>)" >&2
		exit 1
	fi
	DIR="$1"
	mkdir -p "$DIR"
	ABS_DIR="$(cd "$DIR" && pwd)"
	godot --path game res://scenes/combat.tscn -- --combat-smoke "$ABS_DIR"
	echo "demo: smoke captures under $ABS_DIR"
	for png in "$ABS_DIR"/*.png; do
		sha256sum "$png"
	done
	;;
*)
	echo "demo: unknown mode '$MODE' (run|capture|smoke)" >&2
	usage >&2
	exit 1
	;;
esac
