# Independent RPG Kanban

This board is copied from `packet-defense/backlog/{index.html,board.css,board.js}` at source commit `8473dfccded6b6ae685eb7b936603fe933ccde6b`; its validator starts from `packet-defense/tools/backlog.js`. Only this development UI and validation infrastructure are reused. No sibling gameplay, data, assets, dependencies, Capacitor configuration, servers or economy are part of the RPG.

The copied files are self-contained. Runtime Zero does not import or fetch anything from Packet Defense. It has its own `backlog.json`, branding, server, IDs and agent tasks. Preserve the source attribution if copying the board again.

From runtime-zero:

```bash
node tools/backlog.js
node tools/backlog.js --ready
node tools/backlog.js --summary
node tools/backlog.js --json
node tools/verify.js
node tools/serve.js
```

Open http://127.0.0.1:8090/backlog/. Set `PORT` if necessary. The server binds only to loopback and serves only the board files. The page is a read-only projection of JSON; edit JSON and refresh to update status. Search, filter, open details, and follow dependency buttons. Details include agent steps, expected outputs, verification checks and evidence.

## Task contract

Every item has stable `RZ-nnn` ID, epic, area, type, phase, status, priority, size, value/risk score, summary, steps, outputs, checks, definition of done (`dod`), dependencies, specification refs, tags, sources and evidence. Refs must exist now; outputs are future deliverables. Never put a nonexistent planned artifact in refs.

`next` and `doing` require all dependencies done. `doing` also requires an owner; only one ticket is active. `later` means planned and not yet activated, including work awaiting prerequisites. `blocked` requires a real external blocker in blockedBy. `done` requires passing evidence entries and completed dependencies. A document/checklist alone cannot certify implementation. Optional P7 tasks require explicit owner authorization even after dependencies complete.

The copied validator is extended to catch cycles of any length, invalid task instructions, missing owners, missing/failed completion evidence, duplicate epic/research IDs, and unfinished dependencies for executable statuses. The ready query also filters by completed dependencies. `tools/verify.js` checks referenced files and regression cases. The status rules keep the browser's Ready column truthful when JSON validation passes.

After completing work, promote the earliest-phase eligible later ticket to next under AGENTS.md. Record actual manual approvals as evidence; tooling cannot establish that a human review occurred. The priority formula remains `2*value - 1.5*risk + bonus(P0=9,P1=5,P2=2,P3=0)` and never overrides prerequisites.

No implementation ticket is marked done by this specification delivery. The initial executable task is RZ-001, local machine inventory.
