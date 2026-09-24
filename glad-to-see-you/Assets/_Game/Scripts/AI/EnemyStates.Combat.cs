namespace GladToSeeYou.AI
{
    /// <summary>Attack: rooted windup (telegraph) → active strike → recovery, then back to chase.</summary>
    public class EnemyAttackState : EnemyState
    {
        public override EnemyStateId Id => EnemyStateId.Attack;

        public override void Enter(in EnemyContext ctx)
        {
            ctx.Root.Locomotion.Stop();
            ctx.Root.Combat.BeginAttack();
        }

        public override EnemyStateId Tick(in EnemyContext ctx)
        {
            var root = ctx.Root;

            // Track the player during the windup so the swing stays fair but aimed.
            Vector3 toPlayer = root.PlayerPosition - root.transform.position;
            toPlayer.y = 0f;
            if (toPlayer.sqrMagnitude > 0.01f)
            {
                root.Locomotion.FaceDirection(toPlayer.normalized, root.Data.turnSpeedDegPerSec * 0.6f, ctx.DeltaTime);
            }

            root.Combat.Tick(ctx.DeltaTime);
            if (!root.Combat.IsAttacking)
            {
                return ctx.Config.CanSeePlayer && ctx.Config.DistanceToPlayer < root.Data.attackRange * 1.6f
                    ? EnemyStateId.Chase
                    : EnemyStateId.Idle;
            }

            return EnemyStateId.Attack;
        }

        public override void Exit(in EnemyContext ctx)
        {
            ctx.Root.Combat.Cancel();
        }
    }

    /// <summary>Stunned: brief vulnerable window after poise breaks; recovers into chase/idle.</summary>
    public class EnemyStunnedState : EnemyState
    {
        public override EnemyStateId Id => EnemyStateId.Stunned;

        private float _until;

        public override void Enter(in EnemyContext ctx)
        {
            ctx.Root.Locomotion.Stop();
            ctx.Root.Combat.Cancel();
            ctx.Root.Animation.SetStunned(true);
            _until = ctx.Now + ctx.Root.Data.staggerSeconds;
        }

        public override EnemyStateId Tick(in EnemyContext ctx)
        {
            if (ctx.Now < _until) return EnemyStateId.Stunned;
            return ctx.Config.CanSeePlayer ? EnemyStateId.Chase : EnemyStateId.Idle;
        }

        public override void Exit(in EnemyContext ctx)
        {
            ctx.Root.Animation.SetStunned(false);
        }
    }

    /// <summary>Dead: terminal state. Logic stops; the CorpseLifetime cleans up later if configured.</summary>
    public class EnemyDeadState : EnemyState
    {
        public override EnemyStateId Id => EnemyStateId.Dead;

        public override void Enter(in EnemyContext ctx)
        {
            ctx.Root.Locomotion.Stop();
            ctx.Root.Combat.Cancel();
            ctx.Root.OnDied();
        }

        public override EnemyStateId Tick(in EnemyContext ctx) => EnemyStateId.Dead;
    }
}
