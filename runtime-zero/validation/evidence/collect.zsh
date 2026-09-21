#!/usr/bin/env zsh
# RV-001 V-003 evidence collector (committed so every invoked probe body is inspectable).
#
# Usage (from runtime-zero/):
#   zsh validation/evidence/collect.zsh
#
# Writes raw logs to reports/local/validation-002/ (ignored by Git), then sanitized
# copies to validation/evidence/002/ (committed) and prints their SHA-256 values.
#
# Every log records: UTC start, the exact executed commands, each substantive step's
# own exit code, and UTC end. A deliberate nonzero probe ("expected-failure") proves
# that a recorded exit code is the command's own and that a trailing echo cannot hide
# an earlier failure. Sanitization replaces $HOME paths, Windows user names and the
# hostname; command output is otherwise unmodified.
set -u
cd "$(dirname "$0")/../.." || exit 1
RAW=reports/local/validation-002
DEST=validation/evidence/002
# Only the ignored raw directory exists while probes run; $DEST is created during
# sanitization so the source-identity probe sees a clean working tree.
mkdir -p "$RAW"

# step <label> <command...>: prints the command, runs it and records ITS exit code.
# Marks the surrounding probe failed when the step fails, so failures propagate.
_rz_steps_failed=0
step() {
	local label="$1"; shift
	printf 'step: %s\n  command: ' "$label"
	printf '%q ' "$@"
	printf '\n'
	local result
	if "$@"; then result=0; else result=$?; fi
	printf '  exit_code=%s\n\n' "$result"
	[ "$result" = "0" ] || _rz_steps_failed=1
	return "$result"
}

run_log() {
	local label="$1"; shift
	local result
	{
		date -u '+start=%Y-%m-%dT%H:%M:%SZ'
		printf 'collector: validation/evidence/collect.zsh (committed)\n'
		printf 'probe: '
		printf '%q ' "$@"
		printf '\n---\n'
		if "$@"; then result=0; else result=$?; fi
		printf '\n---\nexit_code=%s\n' "$result"
		date -u '+end=%Y-%m-%dT%H:%M:%SZ'
	} > "$RAW/$label.log" 2>&1
	printf '%-22s exit %s\n' "$label" "$result"
	printf '%s %s\n' "$label" "$result" >> "$RAW/exit-summary.txt"
	return 0
}

# --- probe bodies (exact commands are visible above in each log) ---

source_identity() {
	_rz_steps_failed=0
	step "branch" git rev-parse --abbrev-ref HEAD
	step "head" git rev-parse HEAD
	step "git status --short (empty = clean)" git status --short
	printf 'cwd: %s\n' "$(pwd)"
	return $_rz_steps_failed
}

terminal() (
	_rz_steps_failed=0
	echo "live session terminal: this executor session's long-lived VS Code WSL terminal."
	echo "It may include session-scoped PATH additions made during earlier work; treat"
	echo "'before' as informational only. The fresh-terminal and controlled probes below"
	echo "cover the unmodified cases."
	echo "inherited NVM_BIN: ${NVM_BIN:-unset}"
	echo "before activation:"
	step "node before" sh -c 'command -v node || echo "node: not found on PATH"'
	step "uv before" sh -c 'command -v uv || echo "uv: not found on PATH"'
	step "godot before" sh -c 'command -v godot || echo "godot: not found on PATH"'
	echo "after activation:"
	step "source tools/env.sh" source tools/env.sh
	step "node path" command -v node
	step "uv path" command -v uv
	step "godot path" command -v godot
	step "node version" node --version
	step "uv version" uv --version
	step "godot version" godot --version
	return $_rz_steps_failed
)

fresh_terminal() (
	_rz_steps_failed=0
	echo "fresh-terminal equivalence: PATH restored to the value recorded from a newly"
	echo "opened VS Code WSL terminal at this session's start: Node 20 first, ~/.local/bin"
	echo "and any selected tools absent. Windows-interop PATH entries are elided because"
	echo "they contain no node/uv/godot and cannot affect selection."
	export NVM_BIN="$HOME/.nvm/versions/node/v20.20.0/bin"
	export PATH="$HOME/.vscode-server/data/User/globalStorage/github.copilot-chat/debugCommand:$HOME/.vscode-server/data/User/globalStorage/github.copilot-chat/copilotCli:$HOME/.vscode-server/bin/7debcd0e2acdea1c52de81bf9ee1620444407dda/bin/remote-cli:$HOME/.sdkman/candidates/java/current/bin:$HOME/.nvm/versions/node/v20.20.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/usr/lib/wsl/lib"
	echo "before activation:"
	step "node before" sh -c 'command -v node || echo "node: not found on PATH"'
	step "node version before" node --version
	step "uv before" sh -c 'command -v uv || echo "uv: not found on PATH"'
	step "godot before" sh -c 'command -v godot || echo "godot: not found on PATH"'
	step "source tools/env.sh" source tools/env.sh
	step "node after" command -v node
	step "node version after" node --version
	step "uv after" command -v uv
	step "godot after" command -v godot
	return $_rz_steps_failed
)

controlled() (
	_rz_steps_failed=0
	echo "controlled case (explicitly labelled): Node 20 first, user tool directory absent from PATH"
	export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:/usr/local/bin:/usr/bin:/bin"
	echo "before activation:"
	step "node before" node --version
	step "uv before" sh -c 'command -v uv || echo "uv: not found on PATH"'
	step "godot before" sh -c 'command -v godot || echo "godot: not found on PATH"'
	step "source tools/env.sh (first activation)" source tools/env.sh
	step "first: command -v node" command -v node
	step "first: node --version" node --version
	step "first: command -v uv" command -v uv
	step "first: command -v godot" command -v godot
	step "source tools/env.sh (second activation)" source tools/env.sh
	step "second: command -v node" command -v node
	step "second: node --version" node --version
	step "second: command -v uv" command -v uv
	step "second: command -v godot" command -v godot
	return $_rz_steps_failed
)

spec() (
	_rz_steps_failed=0
	step "source tools/env.sh" source tools/env.sh
	step "node tools/verify.js" node tools/verify.js
	return $_rz_steps_failed
)

import_project() (
	_rz_steps_failed=0
	step "source tools/env.sh" source tools/env.sh
	step "godot --headless --path game --editor --quit" godot --headless --path game --editor --quit
	return $_rz_steps_failed
)

combat() (
	_rz_steps_failed=0
	step "source tools/env.sh" source tools/env.sh
	step "godot --headless --path game --script res://tests/run_tests.gd" godot --headless --path game --script res://tests/run_tests.gd
	return $_rz_steps_failed
)

guard_contract() (
	_rz_steps_failed=0
	step "source tools/env.sh" source tools/env.sh
	step "godot --headless --path game --script <validator guard_contract.gd>" godot --headless --path game --script "$PWD/validation/guard_contract.gd"
	return $_rz_steps_failed
)

managed_python() (
	_rz_steps_failed=0
	step "source tools/env.sh" source tools/env.sh
	step "uv python find 3.12" uv python find 3.12
	local venv="/tmp/rz-rv001-python-probe"
	step "remove stale probe dir" rm -rf "$venv"
	step "uv venv --python 3.12" uv venv "$venv" --python 3.12
	step "probe python -V" "$venv/bin/python" -V
	step "probe trivial import" "$venv/bin/python" -c "import json, sys; print('trivial import ok:', json.dumps({'python': sys.version.split()[0], 'ok': True}))"
	step "remove probe venv" rm -rf "$venv"
	return $_rz_steps_failed
)

expected_failure() {
	echo "deliberate nonzero probe (labelled expected failure): verifies exit codes propagate"
	sh -c 'echo "deliberate-check ran"; exit 3'
	return $?
}

client_probe() {
	_rz_steps_failed=0
	echo "RZ-RV-001-EVIDENCE client-tool probe executed by this Copilot/DeepSeek agent session"
	step "implementation commit" git rev-parse HEAD
	printf 'utc=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
	return $_rz_steps_failed
}

sanitize() {
	local f
	mkdir -p "$DEST"
	for f in "$RAW"/*.log; do
		sed -e "s#${HOME}#\$HOME#g" \
			-e "s#/mnt/c/Users/[^/]*#/mnt/c/Users/<winuser>#g" \
			-e "s#$(hostname)#<host>#g" "$f" > "$DEST/$(basename "$f")"
	done
	echo "sanitized copie(s) in $DEST:"
	(cd "$DEST" && sha256sum *.log)
}

# --- run (raw logs -> sanitized copies) ---
rm -f "$RAW/exit-summary.txt"
run_log source source_identity
run_log terminal terminal
run_log fresh-terminal fresh_terminal
run_log controlled controlled
run_log launcher-contract python3 validation/launcher_contract.py
run_log spec spec
run_log import import_project
run_log combat combat
run_log guard-contract guard_contract
run_log managed-python managed_python
run_log expected-failure expected_failure
run_log client-tool client_probe
sanitize
echo "--- exit summary (expected-failure is a deliberate nonzero probe) ---"
cat "$RAW/exit-summary.txt"
