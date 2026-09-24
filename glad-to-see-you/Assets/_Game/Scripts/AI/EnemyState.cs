namespace GladToSeeYou.AI
{
    public enum EnemyStateId
    {
        Idle,
        Patrol,
        Chase,
        Attack,
        Stunned,
        Dead
    }

    /// <summary>
    /// Everything a state needs, passed by value each tick (no allocations).
    /// Services are reached through <see cref="Root"/> — states never cache components.
    /// </summary>
    public struct EnemyContext
    {
        public EnemyRoot Root;
        public EnemyConfig Config;
        public float Now;
        public float DeltaTime;
    }

    /// <summary>Immutable per-tick context slice that states read (assembled by EnemyBrain).</summary>
    public struct EnemyConfig
    {
        public float DistanceToPlayer;
        public bool CanSeePlayer;
        public bool AttackReady;
    }

    /// <summary>
    /// One enemy AI state. Plain class (no MonoBehaviour): testable without a scene.
    /// Tick returns the state to run next frame — transitions are explicit data, not hidden awaits.
    /// </summary>
    public abstract class EnemyState
    {
        public abstract EnemyStateId Id { get; }

        public virtual void Enter(in EnemyContext ctx) { }

        public virtual void Exit(in EnemyContext ctx) { }

        public abstract EnemyStateId Tick(in EnemyContext ctx);
    }
}
