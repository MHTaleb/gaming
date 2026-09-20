# Deterministic level laboratory

Implement this after the prototype core and replay tests. Simulation estimates behavior for specified policies; it does not prove human playability, accessibility or fun.

## Single source of combat truth

Implement `game/tests/simulate.gd` using the same domain resolver as the game. Python consumes results and calculates statistics; it must not reimplement damage, turns, abilities or rewards. Use explicit seeds, ordered actions and content/rules hashes. Pin the Godot version for replay guarantees.

Future CLI contract (create it in RZ-014):

```bash
godot --headless --path game --script res://tests/simulate.gd -- --level encounter_02 --build guard --policy basic --seed-start 10000 --runs 2000 --output ../reports/local/encounter_02_guard.jsonl
```

Resolve output paths under the allowed report root explicitly. Exit nonzero on malformed content or simulation failure. Separate report generation from threshold evaluation. Report capped/stalled runs separately; never count them as wins or silently drop them.

## Measurement schema

Each JSONL record includes run ID, seed, level/build/policy IDs, engine/rules/content revision, outcome (win/loss/stalled/error), turns, damage_taken, remaining_hp, energy_spent, action_counts and final_state_hash. A manifest includes seed range, command, machine, timestamp, code commit, hashes and total requested/completed/failed runs.

Compare at least basic, defensive and ability-aware policies. Eventually benchmark tank, crit, damage-over-time, speed and starter builds after RZ-013 creates actual mechanics. Do not label a build as tested when it is merely a stat alias missing its defining mechanic. Use a small checked-in regression seed set and a separate held-out seed range; preserve failures as fixtures.

The initial prototype is mostly deterministic and may not have meaningful seed variance. In that case report exact policy/encounter outcomes, not misleading binomial confidence intervals from identical repeats. Add seed-based samples only once gameplay includes documented randomness. Do not introduce arbitrary noise just to make a win-rate chart.

## Promotion gates

Implement configurable, versioned gate definitions by encounter tier and build/policy, with minimum sample size, allowed error/stall count, target success interval and whether the gate uses point estimates or confidence bounds. Proposed 65–80% normal-build success from the discussion is illustrative; Housseyn must approve encounter-specific ranges after playtesting. Tutorial completion should not automatically use the same target as boss difficulty.

For independent stochastic trials report successes/n, a 95% Wilson interval, average/median/p95 duration or turns, deaths by build and failure counts. Explain wide intervals and avoid certifying uncertain estimates. Never aggregate across builds to hide one failing archetype. Evaluate the configured confidence policy; flag inconclusive cases rather than adjusting targets silently.

Pair candidates on the same seeds/policies for comparisons, then run held-out seeds. A balance change report states exact changed parameters, before/after distributions and tradeoffs. Fail on crashes, illegal actions, infinite loops, invalid numbers, unreachable required content and missing benchmark coverage. Require a human playtest after numerical gates pass.
