# ANIMATION_PIPELINE.md — states, blending, retargeting

> Current reality: **no animation clips exist yet.** The slice runs on `ProceduralAnimationDriver`
> (code-driven squash/lean/swing arcs) so combat feel is testable today. This doc is the contract for when
> real clips land — the gameplay side will not change: it already talks to `IAnimationDriver` / `AnimatorAnimationDriver`.

## State inventory (hero)

| State | Blend type | Notes |
| --- | --- | --- |
| Idle | loop | weight shift, breathing; 2 variants (combat-idle qualifies when enemy locked) |
| Walk / Run | loop, 1D blend on Speed (0→1 walk, 1 run) | move-set speed matched to gameplay speeds (see `PlayerStats`) |
| Sprint | loop | only if gameplay adds sprint (currently capped at run) |
| Dodge | one-shot | 0.35–0.45 s, i-frames match clip's middle 60% |
| AttackLight 1/2/3 | one-shot chain | combo window driven by `WeaponData`, not clip length guessing |
| AttackHeavy | one-shot | longer wind-up, root-anchored |
| HitReact F/B/L/R | one-shot | 4-directional, selected by impact vector (see `CombatFeedback`) |
| Death | one-shot, hold last frame | |
| Ability (slam) | one-shot | placeholder ability |

Enemy: Idle, Patrol(Walk), Chase(Run), Attack (wind-up → active → recovery), Stunned (loop-able short),
Death — same architectural shape, data in `EnemyData`.

## Animator architecture

- **One base layer** (locomotion + action states via triggers), **one upper-body mask layer** only if needed
  for lock-on aim. Do not stack layers beyond that on mobile (`PERFORMANCE_BUDGET.md`).
- Parameters (hashed in `AnimationParameters`):
  `Speed (float)`, `Turn (float, optional)`, `AttackLight (trigger)`, `AttackHeavy (trigger)`,
  `Dodge (trigger)`, `Hit (trigger)`, `HitDirX/Y (floats)`, `Stunned (bool)`, `Dead (trigger)`, `Ability (trigger)`.
- Transitions: AnyState → Dodge/Attack/Hit/Death with `Can Transition To Self = false`; everything else via
  Speed thresholds. **Gameplay never waits on animation length except where data says so** (windows are data-driven).
- Root motion: **off**. Movement owns translation (already implemented), so attacks use scripted lunge from `WeaponData`.
- Culling: `Cull Update Transforms` (default), `Cull Completely` for off-screen enemies.

## Clip contract (import settings)

- FBX animations export with Unity "Loop Time" correctly set per clip; average clip ≤ 1.2 s for attacks.
- Compression: **Optimal**; rotation error ≤ 0.5° for hero, 1° for enemies. Keep keyframes sparse.
- Curves: no event spam — animation events only for attack release + footstep L/R (and they must be
  *informational*: gameplay windows are still data-driven so a missing event can't break combat).

## Getting clips (in evaluation order, nothing purchased without approval)

1. **Mixamo** (free): primary source for locomotion/dodge/attacks; retargets cleanly to Humanoid.
2. **Authored in Blender** for hero-defining moves (dodge, heavy) where feel can't be bought.
3. **Rokoko / DeepMotion (paid, approval required)**: mocap-from-video if authored animation can't sell weight.
4. Meshy animate (in-pipeline) for quick enemy drafts; always reviewed for foot sliding.

## Retargeting steps (Humanoid)

1. Import clip FBX with Rig = Humanoid; verify Avatar maps all required bones (`Configure…` fix-ups).
2. In the clip inspector: `Animation ▸ Rig` → copy **Avatar Definition from** the shared hero Avatar.
3. Verify: feet don't clip, hands don't cross, no spine twist popping; tune `Yaw/Foot IK` only if needed.
4. Rename `AN_Hero_<Action>` / `AN_Enemy01_<Action>`; place under `Assets/_Game/Art/Animations/`.
5. Register in the AnimatorController (created via editor tooling once real `AnimatorController` assets exist)
   and flip `PlayerAnimation`/`EnemyAnimation` from `ProceduralAnimationDriver` to `AnimatorAnimationDriver`.

## Definition of done for animation work

- Clip plays in-editor at correct speed for gameplay values (no manual multiplier hacks).
- Transitions clean under mash-input test (attack during dodge, hit during attack, etc.).
- Foot sliding absent at gameplay speeds (walk/run matched).
- Animator cost visible in profiler ≤ budget note in `PERFORMANCE_BUDGET.md`.
