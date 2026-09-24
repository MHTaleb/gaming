#!/usr/bin/env bash
# Environment inventory for glad-to-see-you (read-only; never installs anything).
# Usage: ./scripts/check-environment.sh
set -u

export PATH="$HOME/.local/bin:$PATH"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDITOR_ROOT="$HOME/Unity/Hub/Editor/6000.3.24f1/Editor"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }

echo "== glad-to-see-you: environment check =="
echo "project: $PROJECT_DIR"
echo

echo "-- Core tooling --"
command -v git >/dev/null 2>&1 && ok "git $(git --version | awk '{print $3}')" || bad "git missing"
if command -v git-lfs >/dev/null 2>&1; then
  ok "git-lfs $(git-lfs version | awk '{print $1}')"
else
  warn "git-lfs not on PATH (expected at ~/.local/bin/git-lfs; LFS files cannot be committed without it)"
fi
command -v node >/dev/null 2>&1 && ok "node $(node --version)" || warn "node missing (needed for Meshy MCP via npx)"
command -v npm  >/dev/null 2>&1 && ok "npm $(npm --version)" || warn "npm missing"
command -v uv  >/dev/null 2>&1 && ok "uv $(uv --version 2>/dev/null | awk '{print $2}')" || warn "uv missing (~/.local/bin/uv; needed for Blender/Unity MCP)"
command -v uvx >/dev/null 2>&1 && ok "uvx present" || warn "uvx missing"
command -v python3 >/dev/null 2>&1 && ok "python3 $(python3 --version | awk '{print $2}')" || warn "python3 missing"
command -v code >/dev/null 2>&1 && ok "VS Code $(code --version 2>/dev/null | head -1)" || warn "VS Code CLI missing"

echo
echo "-- Unity --"
if [ -x "$EDITOR_ROOT/Unity" ]; then
  ok "Unity editor installed: $EDITOR_ROOT/Unity"
  if "$EDITOR_ROOT/Unity" -batchmode -quit -nographics -logFile /tmp/gts-unity-check.log 2>/tmp/gts-unity-check-stderr.log; then
    ok "editor process starts (may still require license activation)"
  else
    if grep -q "GLIBC_2" /tmp/gts-unity-check-stderr.log /tmp/gts-unity-check.log 2>/dev/null; then
      warn "editor CANNOT run on this distro (glibc too old — VERIFIED). Upgrade: scripts/upgrade-wsl-distro.sh — or use a Windows editor. See Documentation/DEVELOPMENT_SETUP.md §3."
    else
      warn "editor exited with an error (likely license activation required — see DEVELOPMENT_SETUP.md §3)"
    fi
  fi
  [ -d "$EDITOR_ROOT/Data/PlaybackEngines/AndroidPlayer" ] && ok "Android playback engine present" || warn "Android module NOT installed (install via Unity Hub)"
else
  bad "Unity editor not found at $EDITOR_ROOT (run scripts/install-unity-editor.sh)"
fi

echo
echo "-- Blender --"
if command -v blender >/dev/null 2>&1; then
  ok "blender: $(command -v blender) — $(blender --version 2>/dev/null | head -1)"
else
  warn "blender missing (~/.local/bin/blender; run scripts/setup-dev-environment.sh)"
fi

echo
echo "-- Project sanity --"
[ -f "$PROJECT_DIR/Packages/manifest.json" ] && ok "Packages/manifest.json present" || bad "Packages/manifest.json missing"
if [ -f "$PROJECT_DIR/ProjectSettings/ProjectVersion.txt" ]; then
  ok "ProjectVersion: $(grep m_EditorVersion: "$PROJECT_DIR/ProjectSettings/ProjectVersion.txt" | awk '{print $2}')"
else
  bad "ProjectSettings/ProjectVersion.txt missing"
fi
[ -f "$PROJECT_DIR/Assets/_Game/Scripts/GladToSeeYou.Runtime.asmdef" ] && ok "runtime asmdef present" || bad "runtime asmdef missing"

echo
echo "Done. Full install/verify flow: Documentation/DEVELOPMENT_SETUP.md"
