# RZ-003 — design reconciliation record

- Ticket: RZ-003 (Reconcile missing RPG design and record prototype choices)
- Date: 2026-09-20, during the setup/implementation session
- Agent: GitHub Copilot (DeepSeek V4.1 Flash selected; one writer)

## What was asked

The one required owner question was asked once, in the coding client, while setup continued:

1. Is there an earlier Runtime Zero / RPG design (notes, chat summary, document) to reconcile?
2. Any changes to the provisional slice before scaffolding (1 hero; 3 encounters 1/2/boss; 3 loadouts +25 HP / +3 ATK / +3 energy; turn-based; landscape; placeholder shapes)?
3. May the commented PATH line in `~/.zshrc` be enabled so `godot`/`uv` resolve as plain commands?

## Outcome

- **No response was available at ask time** (owner not available; will review later). No earlier design
  document was supplied. This is recorded as *asked, not answered* — not as approval.
- Therefore the **explicitly provisional prototype** in `docs/GAME_DESIGN.md` (D-006–D-008) is adopted as
  the implementation basis. It stays provisional; **RZ-012 remains the owner approval gate** before any
  content expansion, and nothing built now counts as production-approved direction.
- The `~/.zshrc` PATH line was **not** changed (no silent user-environment edits). Tools are invoked by
  full path (`~/.local/bin/godot`, `~/.local/bin/uv`); the one-line change stays offered to Housseyn.
- Getting to a playable slice does not wait on creative answers (per DECISIONS.md "Missing context rule").

## Register separation (from docs/DECISIONS.md, unchanged)

| Class | Entries |
|---|---|
| Confirmed | D-001 RPG folder in this repository; D-002 agents install required tools locally; D-003 Godot/GDScript + local generation + deterministic headless simulation + Python analysis + custom MCP; D-005 no paid per-generation APIs, models outside Git |
| Provisional (being built now) | D-006 working title and technological dark-fantasy theme with software-inspired enemies/equipment; D-007 small 2D single-player turn-based encounter RPG, landscape, desktop then Android; D-008 one hero, three encounters, three equipment choices |
| Unresolved (do not expand into) | D-009 final combat model, movement/exploration, campaign size, narrative, monetization, final art style, Android device range |
| Deferred | D-011 multiplayer, backend, ads, purchases, LoRA training, offline local coding model, store release |
| Capability to verify | D-010 Copilot/DeepSeek tool-calling details (partially probed in RZ-002; backend identity not verifiable from inside a session) |

## Scope bounds restated for implementation

- No open-world movement, multiplayer, accounts, ads or purchases in the prototype.
- No Packet Defense mechanics, economy, assets, servers or dependencies. The board UI/validator is the
  only reused infrastructure (source commit recorded in `backlog/README.md`).
- Illustrative content names (Memory Leak, Null Pointer, Server Cathedral, Springforge) are replaceable
  IDs, not lore commitments; no third-party brands or logos.
- Balance numbers in GAME_DESIGN.md are starting fixtures, not proven balance.

## What changes if input arrives later

- If Housseyn supplies an earlier design: reconcile it in `docs/DECISIONS.md` and update affected tickets
  **before** treating any content as more than provisional.
- If RZ-012 playtest feedback rejects the combat model or view: create corrective tickets and update
  affected specs before RZ-013+ production work.
