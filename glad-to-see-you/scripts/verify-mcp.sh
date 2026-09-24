#!/usr/bin/env bash
# Offline verification of MCP wiring (no live connectivity — that needs Unity/Blender running + a Meshy key).
# Live activation steps: Documentation/MCP_SETUP.md.
set -u

export PATH="$HOME/.local/bin:$PATH"
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }

echo "== verify-mcp =="

echo
echo "-- Runner tooling --"
command -v uvx >/dev/null 2>&1 && ok "uvx: $(command -v uvx)" || bad "uvx missing (install uv, or fix PATH to include ~/.local/bin)"
command -v npx >/dev/null 2>&1 && ok "npx: $(command -v npx)" || warn "npx not on PATH (Meshy MCP runs via npx — fix PATH for VS Code's environment if needed)"

echo
echo "-- Blender MCP (mcp-for-blender) --"
if command -v uv >/dev/null 2>&1; then
  if uv tool list 2>/dev/null | grep -q mcp-for-blender; then
    ok "$(uv tool list | grep mcp-for-blender | head -1)"
  else
    bad "mcp-for-blender not installed (run scripts/setup-dev-environment.sh)"
  fi
else
  warn "uv missing; cannot check uv tools"
fi

echo
echo "-- Meshy MCP (@meshy-ai/meshy-mcp-server) --"
if command -v npm >/dev/null 2>&1; then
  VERSION=$(npm view @meshy-ai/meshy-mcp-server version 2>/dev/null || echo "")
  [ -n "$VERSION" ] && ok "npm resolves @meshy-ai/meshy-mcp-server@$VERSION" || bad "npm cannot resolve the Meshy package (network?)"
else
  warn "npm missing"
fi

echo
echo "-- Unity MCP (pinned tag v10.2.0) --"
if git ls-remote --tags https://github.com/CoplayDev/unity-mcp.git 2>/dev/null | grep -q "refs/tags/v10.2.0$"; then
  ok "CoplayDev/unity-mcp tag v10.2.0 reachable (pinned in .vscode/mcp.json)"
else
  warn "could not reach the pinned Unity MCP tag (network or tag moved)"
fi

echo
echo "-- Config file --"
CONFIG="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.vscode/mcp.json"
if [ -f "$CONFIG" ]; then
  python3 -m json.tool "$CONFIG" >/dev/null 2>&1 && ok "$CONFIG is valid JSON" || bad "$CONFIG is invalid JSON"
else
  warn "workspace .vscode/mcp.json not found (expected at repo root)"
fi

echo
echo "USER ACTION checklist (cannot be done by script):"
echo "  1. Unity running → Package Manager → add: https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#v10.2.0"
echo "     then Window ▸ MCP for Unity ▸ Configure All Detected Clients."
echo "  2. Blender running → install addon from ahujasid/mcp-for-blender → sidebar ▸ BlenderMCP ▸ Start MCP Server."
echo "  3. Meshy: provide an API key when VS Code prompts (\"MCP: List Servers\" ▸ meshy ▸ Start) — paid credits, owner approval required per generation."
echo "  Then in VS Code: MCP: List Servers → Start each → ask 'read the Unity console' / 'list Blender scene objects'."
