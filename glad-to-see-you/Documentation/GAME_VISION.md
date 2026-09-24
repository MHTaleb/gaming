# GAME_VISION.md — Glad to See You

## One sentence

A third-person dark-fantasy action game for mobile: one cursed warrior, one ruined arena,
combat that *feels* heavy and readable, presentation that makes phones look like consoles.

## Pillars (every feature must serve one)

1. **Weighty, readable combat.** Attacks telegraph, hits connect, reactions sell impact.
   Light/heavy/dodge are the whole vocabulary — no ability bloat.
2. **Premium atmosphere on mobile budgets.** Strong silhouettes, moody cinema lighting, restrained palette.
   Perceived quality per GPU-cycle, never raw complexity.
3. **One arena, mastered.** A single environment polished until it's a showcase — not a world map.
4. **60 fps target, 30 fps floor.** Frame-time stability is a feature players feel immediately.

## The vertical slice (scope of this milestone)

| In scope | Out of scope (see "DO NOT BUILD YET") |
| --- | --- |
| 1 hero: locomotion, dodge, light attack, heavy attack, hit reaction, death | character switching, RPG stats, inventories |
| 1 enemy archetype with AI (idle/patrol/chase/attack/stunned/dead) | enemy families, bosses, waves |
| 1 arena with baked-quality lighting look, VFX, ambient atmosphere | open world, level streaming, more arenas |
| Combat feel stack: hit-stop, camera impulse, sparks, damage numbers, SFX | elemental systems, status effects |
| Mobile controls: virtual stick + buttons, lock-on | gestures, custom rebinding UI |
| Quality profiles (low/balanced/high) + perf overlay | dynamic content downloads |
| Procedural placeholder art (replaceable) | final character/environment art |

## Why Unity + URP

- Unity 6.3 LTS (`6000.3.24f1`) — current LTS line, production-suitable, mobile-tuned tooling.
- URP (not HDRP) — designed for the GPU/memory realities of mid-tier Android.
- C# with testable modules — logic lives in plain classes where possible (state machines, damage math).

## Success criteria for the slice

- A stranger picks up a phone (or the editor with a gamepad) and completes this loop without instruction:
  walk into arena → lock on → light attack combo → dodge a telegraphed enemy swing → heavy attack to kill →
  hit reaction and death read clearly → whole frame never dips below the profile's budget.
- Time-to-iterate from a clean clone: **under 15 minutes** (enable Unity MCP → bootstrap scene → play).

## DO NOT BUILD YET (scope guardrails — reject these requests politely)

- multiplayer / co-op / netcode of any kind
- MMORPG systems, guilds, matchmaking, live-service infrastructure
- huge open world, multiple arenas, streaming
- dozens of enemy types, hundreds of items
- complex backend, accounts, cloud saves
- monetization systems

When tempted, re-read pillar 3. **One arena, mastered.**

## Naming

- Repo folder / codename: `glad-to-see-you`.
- Working title: *Glad to See You* (owner may rename; keep the codename in paths stable).
- Genre tag for store/positioning: dark fantasy action, stylized realism.
