# Session handoff — evening continuation (RZ-034 / RZ-035)

- **Agent/client/model:** GitHub Copilot in VS Code (DeepSeek V4.1 Flash selected by the user; one writer). Validator side remains a separate independent agent — no self-approval was performed.
- **Environment:** Lenovo 83GS WSL2 Ubuntu 20.04.6 + WSLg; Godot 4.7.2.stable.offical.ed1daf0bf (`source tools/env.sh`); software GL default on WSL since RZ-033.
- **Branch / commits:** `codex/runtime-zero-impl`. Previous head `229b164` (RZ-033). This commit: battlefield war + region map with mini map and select-to-fight (RZ-034, RZ-035).
- **Tickets completed:** **RZ-034** (war presentation) and **RZ-035** (region work map) — both done with evidence this session (see backlog). 15/35 tickets done; RZ-012 owner playtest still open (feedback rounds 2–4 recorded in `reports/owner-prototype-review.md`).
- **Changed paths (highlights):**

| Area | Paths | Behavior |
|---|---|---|
| War staging | `game/scenes/combat.tscn`, `game/src/presentation/combat.gd` | Battlefield: hero left / hostiles right on a ground band, HP pills under fighters, mission banner, centered action dock, log panel; impact pulse + banner flourish (reduced-motion aware) |
| Fighter art | `tools/make_combat_art.gd`, `game/assets/characters/*.png` | Deterministic procedural sprites (operator / memory_leak / server_cathedral); byte-identical across runs |
| Work map | `game/scenes/map.tscn`, `game/src/presentation/map.gd`, `map_route.gd`, `minimap.gd` | Region stage with banner/HUD chips/dock; stone route (canvas art) with states; **mini map** with engineer dot; selecting the TICKET stone starts the war immediately (`auto_start`) |
| Flow | `loadout.gd`, `result.gd` | Begin → work map; result Next → work map → next war |
| Tests | `map_tests.gd` (new, 28), `run_flow_tests.gd` (48), `presentation_tests.gd` (112) | Select-to-fight chain, locks, motion modes, minimap, battlefield assertions |
| Docs | `docs/DEMO.md`, `docs/DECISIONS.md` (D-012), `reports/owner-prototype-review.md`, `reports/prototype-log.md` | Owner direction recorded and implemented |

- **Commands / results:** full battery 2026-09-21 evening — combat 96, content 54, presentation 112, run flow 48, save 24, feedback 36, replay 56, map 28 (all exit 0); `validation/guard_contract.gd` passed; `node tools/verify.js` passed (35 tickets). Log: `validation/evidence/035/battery.log`. Captures: `validation/evidence/034/` (battlefield ×2, generator log), `validation/evidence/035/` (map ×2 with mini map).
- **Human review pending:** **RZ-012 owner playtest** — the map/war flow is the new thing to try; feedback goes to `reports/owner-prototype-review.md`. Real art/music phases stay gated.
- **Known notes:** fixture/state hashes unchanged through the visual overhaul (replay suite); map captures require an active run (`--demo-run`); software GL remains the default on WSL (RZ-033).
