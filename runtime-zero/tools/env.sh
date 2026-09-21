# Runtime Zero project-local toolchain activation (RV-001 V-002; corrected 2026-09-21).
#
# Usage (bash or zsh), from runtime-zero/:
#   source tools/env.sh
#
# Guarantees after activation, on first AND repeated sourcing:
#   1. $RZ_NODE_BIN (newest nvm-managed Node >= 22) is the FIRST PATH entry, so
#      bare `node` always resolves to the selected Node - even if ~/.local/bin
#      contains another node, or an inherited Node 20 precedes everything.
#   2. $HOME/.local/bin is the SECOND entry, so `uv` and `godot` resolve to the
#      selected user-space tools even when competing installations for the same
#      names appear earlier on the inherited PATH.
#   3. All other PATH entries are preserved; exact duplicates of those two
#      directories are removed (explicit colon parsing, valid in bash and zsh)
#      and re-inserted at the front, stable on repeated activation. No global
#      shell config or shell option is changed.
# Exports RZ_NODE_BIN, RZ_GODOT, RZ_UV. Silent unless RZ_ENV_VERBOSE=1.
# Independent regression (validator-owned): python validation/launcher_contract.py

_rz_node_dir="$(find "$HOME/.nvm/versions/node" -maxdepth 1 -type d -name 'v2[2-9].*' 2>/dev/null | sort -V | tail -n 1)"

if [ -z "$_rz_node_dir" ] || [ ! -x "$_rz_node_dir/bin/node" ]; then
	printf 'env.sh: no nvm-managed Node >= 22 found under ~/.nvm/versions/node; run "nvm install 22"\n' >&2
	return 1 2>/dev/null || exit 1
fi

export RZ_NODE_BIN="$_rz_node_dir/bin"
export RZ_GODOT="$HOME/.local/bin/godot"
export RZ_UV="$HOME/.local/bin/uv"

if [ ! -x "$RZ_GODOT" ]; then
	printf 'env.sh: pinned Godot missing at %s (see config/toolchain.lock.json)\n' "$RZ_GODOT" >&2
	return 1 2>/dev/null || exit 1
fi
if [ ! -x "$RZ_UV" ]; then
	printf 'env.sh: uv missing at %s (see config/toolchain.lock.json)\n' "$RZ_UV" >&2
	return 1 2>/dev/null || exit 1
fi

# Deterministic PATH precedence: remove exact duplicates of the selected
# directories wherever they sit, then pin [selected Node][~/.local/bin][rest].
# Parsing is an explicit colon-remainder loop: ordinary zsh does not split
# unquoted scalars, so implicit word splitting is deliberately NOT used. No IFS,
# glob or word-splitting state is changed outside this function's locals.
_rz_pin_path_dir() {
	local target="$1" segment cleaned=""
	local rest=":$PATH:"
	while [ -n "$rest" ]; do
		if [ "$rest" = ":" ]; then
			rest=""
			break
		fi
		rest="${rest#:}"
		case "$rest" in
			*:*) segment="${rest%%:*}"; rest=":${rest#*:}" ;;
			*) segment="$rest"; rest="" ;;
		esac
		[ "$segment" = "$target" ] && continue
		if [ -z "$cleaned" ]; then cleaned="$segment"; else cleaned="$cleaned:$segment"; fi
	done
	if [ -z "$cleaned" ]; then PATH="$target"; else PATH="$target:$cleaned"; fi
}
_rz_pin_path_dir "$HOME/.local/bin"
_rz_pin_path_dir "$RZ_NODE_BIN"
unset -f _rz_pin_path_dir

if [ "${RZ_ENV_VERBOSE:-0}" = "1" ]; then
	printf 'env.sh: node=%s | uv=%s | godot=%s\n' \
		"$(node --version)" "$("$RZ_UV" --version 2>/dev/null)" "$("$RZ_GODOT" --version 2>/dev/null)"
fi

unset _rz_node_dir
