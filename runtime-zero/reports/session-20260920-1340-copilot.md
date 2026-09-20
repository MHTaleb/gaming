# Session handoff

- **Agent/client/model:** GitHub Copilot in VS Code (DeepSeek V4.1 Flash selected by the user; one writer at a time; the `vizards.deepseek-v4-for-copilot` 0.9.2 extension is installed — backend-per-response identity is not verifiable from inside the session)
- **Environment:** Lenovo 83GS (LOQ) — WSL2 Ubuntu 20.04.6, local laptop, not remote, not CI. Windows 11 build 26200, 23.7 GiB host RAM, RTX 4050 Laptop GPU (6141 MiB VRAM, driver 581.86), 94.4 GB free on C:, WSLg working.
- **Branch and implementation commits:** `codex/runtime-zero-impl` (based on the spec branch, not merged anywhere): `7366f8d` RZ-001, `b79116d` RZ-002, `21163a8` RZ-003, `ab36b9f` RZ-004, `64017a1` RZ-005. Nothing pushed to `main`; PR #1 untouched.
- **Tickets completed / doing / blocked:** **RZ-001, RZ-002, RZ-003, RZ-004, RZ-005 = done with evidence.** Nothing is `doing`; nothing is `blocked`. 5 of 30 tickets (17%); `node tools/backlog.js --ready` → **RZ-006**.

## Changed paths and behavior

| Ticket | Paths | Behavior |
|---|---|---|
| RZ-001 | `reports/environment.md` | Measured machine inventory: GPU is **RTX 4050 / 6144 MB**, superseding the reported 4060/8 GB (D-004); budgets recorded |
| RZ-002 | `config/toolchain.lock.json`, `reports/environment.md` | uv 0.12.17, uv-managed Python 3.12.14, Godot 4.7.2 (sha512-verified), Godot/Python VS Code extensions; deferred tools explicit |
| RZ-003 | `docs/DECISIONS.md`, `reports/design-reconciliation.md` | Owner ask recorded as asked-not-answered; provisional prototype explicitly adopted; RZ-012 stays the gate |
| RZ-004 | `game/project.godot`, `game/scenes/title.tscn`, `game/src/**`, `reports/prototype-log.md` | Godot project, GL Compatibility, 1280×720 landscape; headless import clean; GUI launch renders title |
| RZ-005 | `game/src/domain/*.gd`, `game/tests/run_tests.gd`, `reports/prototype-log.md` | Pure deterministic combat core: commands, events, resolver, 86 passing checks |

## Commands run, exit codes, measured outcomes

- `python3 tools/doctor.py` → exit 0 (read-only inventory JSON)
- `powershell.exe …` Win32 + `wsl.exe --status/--list --verbose` → Lenovo 83GS, WSL2, volumes measured
- `nvidia-smi --query-gpu=…` → RTX 4050 Laptop, 6141 MiB, 581.86
- sha256/sha512 checks → uv tarball, Godot zip (both matched official sums)
- `env -i … zsh -ic 'node -v'` → v22.23.2 (nvm default; VS Code terminals still show v20 via inherited `NVM_BIN` — restart window or `nvm use default`)
- `node tools/verify.js` → exit 0 (30 tickets valid, 8/8 tests) — re-run green after every status change
- `node tools/backlog.js --ready/--summary` → RZ-006 ready; 5/30 done
- Live board probe (`reports/local/board-probe.mjs`) → 200/200/405/404 as expected; server stopped after
- `~/.local/bin/godot --headless --path game --editor --quit` → exit 0
- `~/.local/bin/godot --path game --quit-after 300 -- --smoke-shot` → exit 0, title rendered (WSLg, OpenGL 3.3 via D3D12)
- `~/.local/bin/godot --headless --path game --script res://tests/run_tests.gd` → exit 0, **ALL TESTS PASSED (86 checks)**

## Evidence artifacts and hashes

- Commit-tracked: `reports/environment.md`, `config/toolchain.lock.json`, `reports/design-reconciliation.md`, `reports/prototype-log.md`
- Ignored raw: `reports/local/rz-004-title-smoke.png` (sha256 `1304aa63480204d73240bdb079ffe758e011c2fc4b285a7a6d48bce7f413669e`), `reports/local/board-probe.mjs`

## Human reviews obtained or pending

- RZ-003 owner ask: **asked, not answered** (user unavailable, will review later) — nothing was approved.
- **Pending owner gates:** RZ-012 playtest of the P1 slice; the pinned Guard interpretation (`reports/prototype-log.md`, RZ-005) wants a yes/no at that review.

## Services still running / how to stop

- None started by this session (board server stopped; ports 8090/8188/8001 free).
- Pre-existing from 2026-09-19, **left untouched**: `node tools/serve.js` pid **289144**, cwd `packet-defense/`. Stop with `kill 289144` if unwanted.

## Known failures / skipped checks and why

- System `python3.8-venv` is unusable (`ensurepip` missing → needs `sudo apt install python3.8-venv`); project route is uv, so not blocking. Recorded in the lock.
- `sudo` requires a password → opportunistic apt installs are deferred; user-space tooling chosen instead.
- `~/.local/bin` not on PATH (`.zshrc` line 2 commented); tools invoked by full path. One-line opt-in offered, not applied.
- WSLg cosmetic warnings (V-Sync unsupported, libxkbcommon symbols) — no functional impact observed.
- Deferred by phase: ffmpeg (P5), ComfyUI/SDXL (P3), audio backends (P5), Android SDK/JDK/templates (P6). No model weights downloaded.

## Next eligible ticket and exact first action

**RZ-006 — Validate and load RPG content data.** First action: create `game/content/` (three encounters, three equipment items, normal + boss enemy data matching DATA_CONTRACTS field shapes) and `game/src/infrastructure/content_repository.gd` with schema/reference validation and clear diagnostics, plus `game/tests/content_tests.gd` (duplicate/missing IDs, malformed stats, invalid links, unsupported schema versions fail). Then:

```
~/.local/bin/godot --headless --path game --editor --quit   # refresh class cache
~/.local/bin/godot --headless --path game --script res://tests/run_tests.gd
node tools/verify.js
```

Do not start RZ-013+ or any P2+ work before RZ-012 owner review.
