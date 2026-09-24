#!/usr/bin/env bash
# Idempotent, user-space setup of dev tooling (no sudo, detect-before-install).
# Installs: git-lfs, Blender 5.2.2, uv tool 'mcp-for-blender'.
# Unity editor install is separate: scripts/install-unity-editor.sh
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
BIN="$HOME/.local/bin"
APPS="$HOME/apps"

log()  { printf '\033[36m[setup]\033[0m %s\n' "$1"; }
skip() { printf '\033[33m[skip]\033[0m %s\n' "$1"; }

mkdir -p "$BIN" "$APPS"

# --- git-lfs ---------------------------------------------------------------
if command -v git-lfs >/dev/null 2>&1; then
  skip "git-lfs already installed: $(git-lfs version)"
else
  log "installing git-lfs (user-space, latest release)…"
  LATEST=$(curl -s https://api.github.com/repos/git-lfs/git-lfs/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4)
  TMP=$(mktemp -d)
  curl -sL "https://github.com/git-lfs/git-lfs/releases/download/${LATEST}/git-lfs-linux-amd64-${LATEST}.tar.gz" -o "$TMP/git-lfs.tar.gz"
  tar -xzf "$TMP/git-lfs.tar.gz" -C "$TMP"
  cp "$TMP"/git-lfs-*/git-lfs "$BIN/"
  chmod +x "$BIN/git-lfs"
  rm -rf "$TMP"
  log "git-lfs installed: $("$BIN/git-lfs" version)"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d "$REPO_ROOT/.git" ]; then
  (cd "$REPO_ROOT" && git lfs install --local >/dev/null 2>&1) && log "git-lfs filters enabled for this repo (local)" || true
fi

# --- Blender ---------------------------------------------------------------
if command -v blender >/dev/null 2>&1; then
  skip "blender already installed: $(blender --version | head -1)"
else
  BLENDER_VERSION="5.2.2"
  ARCHIVE="blender-${BLENDER_VERSION}-linux-x64.tar.xz"
  if [ -x "$APPS/blender-${BLENDER_VERSION}-linux-x64/blender" ]; then
    skip "blender archive already extracted in $APPS"
  else
    log "downloading Blender ${BLENDER_VERSION} (~380 MB)…"
    curl -L --fail -o "$APPS/$ARCHIVE" "https://download.blender.org/release/Blender5.2/${ARCHIVE}"
    log "extracting…"
    tar -xJf "$APPS/$ARCHIVE" -C "$APPS"
  fi
  ln -sf "$APPS/blender-${BLENDER_VERSION}-linux-x64/blender" "$BIN/blender"
  log "blender linked: $("$BIN/blender" --version | head -1)"
fi

# --- uv tools (MCP servers) ------------------------------------------------
if command -v uv >/dev/null 2>&1; then
  if uv tool list 2>/dev/null | grep -q "mcp-for-blender"; then
    skip "uv tool mcp-for-blender already installed"
  else
    log "installing uv tool: mcp-for-blender…"
    uv tool install mcp-for-blender
  fi
else
  log "uv not found. Install it first: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

# --- Meshy MCP (no install needed; verify resolvable) ----------------------
if command -v npm >/dev/null 2>&1; then
  MESHY_VERSION=$(npm view @meshy-ai/meshy-mcp-server version 2>/dev/null || echo "unknown")
  log "Meshy MCP server resolves via npm (latest: ${MESHY_VERSION}) — runs via npx from .vscode/mcp.json"
fi

echo
log "Done. Run scripts/check-environment.sh to verify, then scripts/install-unity-editor.sh for Unity."
log "Remember: export PATH=\"$HOME/.local/bin:\$PATH\" in your shells (or add to ~/.zshrc)."
