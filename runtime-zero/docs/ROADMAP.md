# Dependency and phase orders

Backlog JSON is the authoritative task list. All game/studio work starts incomplete. Promote `later` to `next` only when prerequisites and phase gates are satisfied, then run validation. Priority scoring never overrides dependencies or the following gates.

| Phase | Tickets | Exit gate |
|---|---|---|
| P0 Environment and decisions | RZ-001–003 | Measured machine; minimal toolchain installed; provisional design recorded |
| P1 Playable slice | RZ-004–012 | Three encounters, loadouts, saves, replay/tests and owner playtest |
| P2 Level laboratory | RZ-013–015 | Real benchmark mechanics, shared-core simulator, statistical reports and approved thresholds |
| P3 Graphics factory | RZ-016–019 | Provenance, local SDXL PNG, reference controls and in-game approved art |
| P4 Studio integration | RZ-020–022 | Bounded adapters, tested stdio MCP and cross-backend GPU queue |
| P5 Audio | RZ-023–025 | Local music/SFX, processed loops and in-game reviewed audio |
| P6 Android vertical slice | RZ-026–028 | Installed debug APK, measured device QA and reviewed playable slice |
| P7 Optional expansion | RZ-029–030 | Owner-approved scope/dataset; do not auto-start |

RZ-012 is the creative approval gate. If feedback rejects the combat model, create corrective tickets and update affected specs before RZ-013 and later production work. RZ-028 is a vertical-slice handoff, not store release. Maintain momentum on setup/engineering work while waiting for optional creative material, but do not bypass explicit human gates.

One ticket should fit a verifiable session. When an implementation ticket proves too large, split it into numbered child tickets, retain traceability and make the original completion depend on the children. Do not represent a broad epic as finished after writing a scaffold.
