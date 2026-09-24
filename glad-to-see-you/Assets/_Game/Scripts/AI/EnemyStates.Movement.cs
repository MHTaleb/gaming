using UnityEngine;

namespace GladToSeeYou.AI
{
    /// <summary>Idle: stands at the current spot, pauses, then hands over to patrol or chase.</summary>
    public class EnemyIdleState : EnemyState
    {
        public override EnemyStateId Id => EnemyStateId.Idle;

        private float _until;

        public override void Enter(in EnemyContext ctx)
        {
            ctx.Root.Locomotion.Stop();
            _until = ctx.Now + 1.1f;
        }

        public override EnemyStateId Tick(in EnemyContext ctx)
        {
            if (ctx.Config.CanSeePlayer) return EnemyStateId.Chase;
            if (ctx.Now >= _until) return EnemyStateId.Patrol;
            return EnemyStateId.Idle;
        }
    }

    /// <summary>Patrol: walks a loop of waypoints; hands over to chase when the player is detected.</summary>
    public class EnemyPatrolState : EnemyState
    {
        public override EnemyStateId Id => EnemyStateId.Patrol;

        private int _waypointIndex;

        public override void Enter(in EnemyContext ctx)
        {
            var points = ctx.Root.PatrolPoints;
            if (points == null || points.Length == 0) return;

            _waypointIndex = (_waypointIndex + 1) % points.Length;
            var target = points[_waypointIndex];
            if (target != null)
            {
                ctx.Root.Locomotion.MoveTo(target.position, ctx.Root.Data.patrolSpeed);
            }
        }

        public override EnemyStateId Tick(in EnemyContext ctx)
        {
            if (ctx.Config.CanSeePlayer) return EnemyStateId.Chase;

            var points = ctx.Root.PatrolPoints;
            if (points == null || points.Length == 0) return EnemyStateId.Idle;

            var target = points[_waypointIndex];
            if (target == null || ctx.Root.Locomotion.AtDestination(0.45f))
            {
                return EnemyStateId.Idle;
            }

            return EnemyStateId.Patrol;
        }
    }

    /// <summary>Chase: runs at the player; attacks when in range and off cooldown.</summary>
    public class EnemyChaseState : EnemyState
    {
        public override EnemyStateId Id => EnemyStateId.Chase;

        private float _loseSightAt;

        public override EnemyStateId Tick(in EnemyContext ctx)
        {
            var root = ctx.Root;

            if (!ctx.Config.CanSeePlayer)
            {
                // Grace period so a sidestep behind a pillar doesn't instantly reset the fight.
                if (_loseSightAt <= 0f) _loseSightAt = ctx.Now + 2.2f;
                if (ctx.Now >= _loseSightAt) return EnemyStateId.Patrol;
            }
            else
            {
                _loseSightAt = 0f;
            }

            if (ctx.Config.DistanceToPlayer <= root.Data.attackRange && ctx.Config.AttackReady)
            {
                return EnemyStateId.Attack;
            }

            if (ctx.Config.DistanceToPlayer > root.Data.attackRange * 0.85f)
            {
                root.Locomotion.MoveTo(root.PlayerPosition, root.Data.chaseSpeed);
            }
            else
            {
                root.Locomotion.Stop();
            }

            Vector3 toPlayer = root.PlayerPosition - root.transform.position;
            toPlayer.y = 0f;
            root.Locomotion.FaceDirection(toPlayer.normalized, root.Data.turnSpeedDegPerSec, ctx.DeltaTime);

            return EnemyStateId.Chase;
        }
    }
}
