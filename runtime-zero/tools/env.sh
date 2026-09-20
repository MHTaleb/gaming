# Runtime Zero project-local toolchain activation (RV-001 V-002).
#
# Usage (bash or zsh), from runtime-zero/:
#   source tools/env.sh
#
# Why this exists: VS Code WSL terminals inherit a stale NVM_BIN (Node 20) and
# ~/.local/bin is not on PATH, so documented commands like `godot --version` or
# `uv --version` could not be replayed directly in the intended terminal. This
# script makes the verified, pinned tools win deterministically without editing
# any global shell configuration.
#
# Resolves and exports:
#   node          newest nvm-managed v22+ under ~/.nvm/versions/node (board minimum)
#   uv, godot     user-space binaries in ~/.local/bin (see config/toolchain.lock.json)
#   RZ_NODE_BIN, RZ_UV, RZ_GODOT (absolute paths)
# Idempotent and silent on success; set RZ_ENV_VERBOSE=1 for a resolution report.

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

# Node must come first so it beats an inherited NVM_BIN (v20) from VS Code.
case "$PATH" in "$RZ_NODE_BIN:"*) : ;; *) export PATH="$RZ_NODE_BIN:$PATH" ;; esac
# uv/godot only need to be present; avoid duplicating on repeated sourcing.
case ":$PATH:" in *":$HOME/.local/bin:"*) : ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac

if [ "${RZ_ENV_VERBOSE:-0}" = "1" ]; then
	printf 'env.sh: node=%s | uv=%s | godot=%s\n' \
		"$(node --version)" "$("$RZ_UV" --version 2>/dev/null)" "$("$RZ_GODOT" --version 2>/dev/null)"
fi

unset _rz_node_dir
