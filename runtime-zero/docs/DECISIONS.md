# Decision register

Treat status as part of every requirement. Record new decisions with date, author, rationale, alternatives and impacted ticket IDs. Do not reinterpret examples from conversation as final product approvals.

| ID | Status | Decision / constraint | Gate |
|---|---|---|---|
| D-001 | Confirmed | Add a separate RPG folder in MHTaleb/gaming; reuse the existing local ticket board where practical. | This specification |
| D-002 | Confirmed | Address implementation instructions to Copilot/DeepSeek; agents install missing required tools locally. | RZ-001 onward |
| D-003 | Confirmed direction | Godot/GDScript, local image/audio generation, deterministic headless simulation, Python analysis and custom MCP adapters. | Verify versions/capabilities before install |
| D-004 | Owner-confirmed correction, 2026-09-20 | Lenovo LOQ with RTX 4050 Laptop GPU and 6 GB VRAM. Housseyn corrected the earlier RTX 4060 statement and confirmed the agent report. Use a 6 GB GPU budget; runtime/tool measurements still require evidence. | RV-001/V-003 execution evidence |
| D-005 | Confirmed constraint | No paid per-generation image/music APIs; keep models outside Git. | Every asset task |
| D-006 | Provisional | Runtime Zero is the working title; technological dark fantasy theme with software-inspired enemies and equipment. | RZ-003 / RZ-012 |
| D-007 | Provisional | Small single-player 2D encounter RPG, turn-based prototype, landscape presentation, desktop development then Android. | RZ-003 / RZ-012 |
| D-008 | Provisional | One hero, three encounters, three initial equipment choices; expand benchmark builds later. | RZ-012 |
| D-009 | Unresolved | Final combat model, movement/exploration, campaign size, narrative, monetization, final art style and target Android device range. | RZ-012 before content expansion |
| D-010 | Partially probed, 2026-09-20 | The installed client executed real file/terminal/edit tool calls in the implementation session (evidence: `validation/evidence/001-response/client-tool.log`). Which backend served individual responses is user-stated (DeepSeek V4.1 Flash selected), not independently verifiable from inside a session; ordinary terminal access is not MCP functionality. | RZ-021 for MCP exposure; validator review of the probe evidence |
| D-011 | Deferred | Multiplayer, backend, ads, purchases, LoRA training, offline local coding model, store release. | Separate owner-authorized scope |

## Missing context rule

No Runtime Zero or Godot RPG design was found in the inspected main-branch Markdown. The supplied discussion emphasizes tooling and gives illustrative names, rather than a full game specification. Do not copy Packet Defense's tower-defense rules, economy, multiplayer or commercial SDKs into this RPG.

RZ-003: ask Housseyn for an earlier design if available, while continuing setup and engine scaffolding. If none is supplied, explicitly record use of the provisional prototype, then build it. Do not repeatedly block setup on creative questions. RZ-012 requires actual owner feedback before the prototype is treated as the production direction.

Use illustrative names such as Memory Leak, Null Pointer, Server Cathedral and Springforge as replaceable content IDs/display names. Do not invent claims about brands or use third-party logos.

## RZ-003 reconciliation (2026-09-20)

The required owner question was asked once during the setup session (earlier design? changes to the provisional slice? PATH line?); the owner was not available to answer and will review later. Asked, not approved: no design document was supplied, so the provisional prototype in docs/GAME_DESIGN.md (D-006–D-008) is adopted for implementation and stays provisional. D-009 remains Unresolved and D-011 Deferred; RZ-012 remains the gate before content expansion. Details in reports/design-reconciliation.md. If the earlier design appears later, reconcile it here and update affected tickets before treating content as production.
