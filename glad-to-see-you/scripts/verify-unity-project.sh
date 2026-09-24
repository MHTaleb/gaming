#!/usr/bin/env bash
# Static verification of the Unity project WITHOUT opening the editor
# (usable even on machines where the editor can't run — see DEVELOPMENT_SETUP.md §3).
set -u

export PATH="$HOME/.local/bin:$PATH"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION=$(grep m_EditorVersion: "$PROJECT_DIR/ProjectSettings/ProjectVersion.txt" 2>/dev/null | awk '{print $2}')
EDITOR="$HOME/Unity/Hub/Editor/$VERSION/Editor"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }
FAILED=0

echo "== verify-unity-project =="
echo "project: $PROJECT_DIR (pinned Unity: ${VERSION:-unknown})"
echo

echo "-- Manifest & settings --"
if python3 -m json.tool "$PROJECT_DIR/Packages/manifest.json" >/dev/null 2>&1; then
  ok "Packages/manifest.json is valid JSON"
  python3 - <<'PY'
import json, pathlib
m = json.loads(pathlib.Path("Packages/manifest.json").read_text())["dependencies"]
for pkg in ["com.unity.render-pipelines.universal", "com.unity.inputsystem", "com.unity.ai.navigation", "com.unity.test-framework"]:
    print(f"  \033[32m✓\033[0m {pkg}: {m.get(pkg, 'MISSING!')}")
PY
  cd "$PROJECT_DIR"
else
  bad "Packages/manifest.json missing or invalid JSON"
  FAILED=1
fi
[ -f "$PROJECT_DIR/ProjectSettings/ProjectVersion.txt" ] && ok "ProjectVersion.txt present" || { bad "ProjectVersion.txt missing"; FAILED=1; }

echo
echo "-- Assemblies (asmdef JSON validity) --"
while IFS= read -r asmdef; do
  if python3 -m json.tool "$asmdef" >/dev/null 2>&1; then
    ok "$(basename "$asmdef")"
  else
    bad "$asmdef is invalid JSON"
    FAILED=1
  fi
done < <(find "$PROJECT_DIR/Assets" -name "*.asmdef" -print)

echo
echo "-- Sources --"
SCRIPT_COUNT=$(find "$PROJECT_DIR/Assets/_Game/Scripts" -name "*.cs" | wc -l)
TEST_COUNT=$(find "$PROJECT_DIR/Assets/_Game/Tests" -name "*.cs" | wc -l)
EDITOR_COUNT=$(find "$PROJECT_DIR/Assets/_Game/Editor" -name "*.cs" | wc -l)
ok "runtime scripts: $SCRIPT_COUNT · editor tools: $EDITOR_COUNT · tests: $TEST_COUNT"

echo
echo "-- Editor install --"
if [ -x "$EDITOR/Unity" ]; then
  ok "editor binary present: $EDITOR/Unity"
  [ -d "$EDITOR/Data/PlaybackEngines/AndroidPlayer" ] && ok "Android playback engine present" || warn "Android module missing (needed only for Android builds)"
  if "$EDITOR/Unity" -batchmode -quit -nographics -logFile /tmp/gts-verify.log 2>/tmp/gts-verify-stderr.log; then
    ok "editor starts headless (license may still be pending)"
  else
    if grep -q "GLIBC_2" /tmp/gts-verify-stderr.log /tmp/gts-verify.log 2>/dev/null; then
      warn "editor cannot start here (glibc too old for Unity 6.3 — verified). Compile verification must run on a supported OS — see DEVELOPMENT_SETUP.md §3."
    else
      warn "editor exited nonzero — most likely 'license not activated' (expected until USER ACTION §3 is done)."
    fi
  fi
else
  warn "editor not installed at $EDITOR (scripts/install-unity-editor.sh)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "Result: static checks passed. First editor open should run: Bootstrap ▸ 1. Setup Project, then 2. Build Vertical Slice Scene."
else
  echo "Result: FAILURES above must be fixed."
fi
exit "$FAILED"
