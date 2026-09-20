# Runtime Zero executor entry

Read [AGENTS.md](../AGENTS.md) and [START_HERE.md](../START_HERE.md) before implementing any task. They define the execution contract, installation duties, dependency gates and evidence requirements. Use [backlog/backlog.json](../backlog/backlog.json) as the task/status source. Do not claim the game or GPU services already exist. Execute one eligible task at a time, then verify and record a handoff. These instructions apply when runtime-zero is the opened VS Code folder.

At session start and between tickets, follow [the standing review protocol](../reviews/README.md): check `node tools/reviews.js --next`, respond to blocking requests in response.json, and await validator-owned verdicts before affected work. No new per-review user prompt is needed.
