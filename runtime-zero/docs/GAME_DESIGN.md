# Prototype implementation specification

Status: explicitly provisional under D-006–D-008. Implement this small playable slice to obtain feedback, then pass RZ-012 before expanding it. If Housseyn supplies the prior design, reconcile it in RZ-003 and update affected tasks first.

## Experience and loop

Build a single-player 2D RPG encounter loop: title → loadout → encounter briefing → combat → reward or defeat → next encounter/retry. Use landscape with scalable controls for mouse and touch. The first slice has one hero, three connected encounters, three equipment options, one normal enemy archetype and one boss variant. Do not add open-world movement, multiplayer, accounts, ads or purchases.

Use turn-based combat for this prototype because it makes decisions, replay and mobile inputs easy to inspect. Keep the combat interface replaceable if owner feedback favors real-time play. Do not describe turn-based combat as a recovered prior requirement.

## Combat rules to implement and test

- Player chooses Attack, Guard, or Skill and a valid living target; one valid command advances the round. Invalid input consumes neither resources nor RNG.
- Attack deals `max(1, attack - defense)` physical damage. Guard halves only the next incoming hit — that hit consumes the Guard — with integer floor and a minimum of 1 damage; an unused Guard expires when the hero's next turn begins (rules v2, RV-001). Guard never stacks. Skill costs 3 energy and deals `max(1, 2*attack - defense)`; insufficient energy rejects the action without advancing time.
- Resolve the player's action, then living enemies in stable actor-ID order. Remove defeated actors before their turn. At round end regenerate 1 hero energy up to the cap. Evaluate terminal state after each action; never let a dead actor act.
- Prototype baseline hero: HP 100, attack 12, defense 3, energy cap 6, starting energy 6. Normal enemy: HP 35, attack 9, defense 1. These are starting tuning fixtures, not proven balance values.
- Guard equipment: +25 maximum HP; Power equipment: +3 attack; Battery equipment: +3 energy cap. Choose exactly one. Explain the effect in the loadout UI and retain the choice for the run.
- Encounter 1 has one normal enemy; encounter 2 has two; encounter 3 has a boss (HP 90, attack 12, defense 2). Boss telegraphs a heavy attack for the next round after every third normal attack; heavy damage uses twice attack, and Guard applies normally. Expose intent before the player's next action.
- Heal fully and refill energy between encounters for the prototype. Rewards are a completion marker and next-encounter unlock; no random loot economy yet.
- Win when all enemies have zero HP; lose when hero HP reaches zero. Clamp HP/energy, prevent duplicate rewards, and offer retry/title. A hard round cap ends invalid/stalled simulations explicitly, never as a win.

Keep these values in content data. Introduce crit, damage-over-time and speed only in later approved build tasks, with explicit stacking, timing, expiry and deterministic RNG rules.

## UI and feedback

Display HP/energy as text plus bars, enemy intent, action costs, disabled unavailable actions with reasons, current encounter, and a concise combat event log. Distinguish selection, success, damage, and defeat with animation/text as well as color. Support mute, reduced motion and keyboard navigation. No essential information should depend on audio, rapid flashing or red/green distinction alone.

Use simple shapes/placeholders initially. Combat presentation consumes domain events; animation timing must not change outcomes. A paused or backgrounded app cannot consume a turn. Prevent double-tap commands. Use provisional 48 logical-pixel touch targets, then verify on the actual device.

## Slice acceptance

A fresh player can launch, choose each loadout, complete or lose the three encounters, retry, and restart. Save settings and unlocks, recover from a malformed save, and preserve progress across app backgrounding. A replay produces the same final state under the pinned build. Housseyn must play the slice and record what should change before expansion.
