# Decision register

Treat status as part of every requirement. Record new decisions with date, author, rationale, alternatives and impacted ticket IDs. Do not reinterpret examples from conversation as final product approvals.

| ID | Status | Decision / constraint | Gate |
|---|---|---|---|
| D-001 | Confirmed | Add a separate RPG folder in MHTaleb/gaming; reuse the existing local ticket board where practical. | This specification |
| D-002 | Confirmed | Address implementation instructions to Copilot/DeepSeek; agents install missing required tools locally. | RZ-001 onward |
| D-003 | Confirmed direction | Godot/GDScript, local image/audio generation, deterministic headless simulation, Python analysis and custom MCP adapters. | Verify versions/capabilities before install |
| D-004 | User-reported | Lenovo LOQ with RTX 4060. Design conservatively around approximately 8 GB VRAM until measured. RAM/SSD unknown. | RZ-001 |
| D-005 | Confirmed constraint | No paid per-generation image/music APIs; keep models outside Git. | Every asset task |
| D-006 | Provisional | Runtime Zero is the working title; technological dark fantasy theme with software-inspired enemies and equipment. | RZ-003 / RZ-012 |
| D-007 | Provisional | Small single-player 2D encounter RPG, turn-based prototype, landscape presentation, desktop development then Android. | RZ-003 / RZ-012 |
| D-008 | Provisional | One hero, three encounters, three initial equipment choices; expand benchmark builds later. | RZ-012 |
| D-009 | Unresolved | Final combat model, movement/exploration, campaign size, narrative, monetization, final art style and target Android device range. | RZ-012 before content expansion |
| D-010 | Capability unverified | Exact Copilot/DeepSeek integration and tool calling on the user's installed versions/account. | RZ-002 and RZ-021 |
| D-011 | Deferred | Multiplayer, backend, ads, purchases, LoRA training, offline local coding model, store release. | Separate owner-authorized scope |

## Missing context rule

No Runtime Zero or Godot RPG design was found in the inspected main-branch Markdown. The supplied discussion emphasizes tooling and gives illustrative names, rather than a full game specification. Do not copy Packet Defense's tower-defense rules, economy, multiplayer or commercial SDKs into this RPG.

RZ-003: ask Housseyn for an earlier design if available, while continuing setup and engine scaffolding. If none is supplied, explicitly record use of the provisional prototype, then build it. Do not repeatedly block setup on creative questions. RZ-012 requires actual owner feedback before the prototype is treated as the production direction.

Use illustrative names such as Memory Leak, Null Pointer, Server Cathedral and Springforge as replaceable content IDs/display names. Do not invent claims about brands or use third-party logos.
