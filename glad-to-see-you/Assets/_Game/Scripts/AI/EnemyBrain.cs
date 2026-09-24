using System;
using System.Collections.Generic;
using UnityEngine;

namespace GladToSeeYou.AI
{
    /// <summary>
    /// Runs the enemy state machine. One Update: perception → stagger check → death check → tick current state.
    /// States are plain classes (see EnemyState) so transitions are unit-testable without a scene.
    /// </summary>
    public class EnemyBrain : MonoBehaviour
    {
        [SerializeField] private EnemyRoot root;

        private readonly Dictionary<EnemyStateId, EnemyState> _states = new Dictionary<EnemyStateId, EnemyState>();
        private EnemyState _currentState;
        private EnemyContext _context;
        private Vector3 _lastPosition;

        public EnemyStateId CurrentStateId => _currentState != null ? _currentState.Id : EnemyStateId.Idle;
        public float LastPlanarSpeed { get; private set; }

        public event Action<EnemyStateId> StateChanged;

        public void Configure(EnemyRoot owner)
        {
            root = owner;
            _states[EnemyStateId.Idle] = new EnemyIdleState();
            _states[EnemyStateId.Patrol] = new EnemyPatrolState();
            _states[EnemyStateId.Chase] = new EnemyChaseState();
            _states[EnemyStateId.Attack] = new EnemyAttackState();
            _states[EnemyStateId.Stunned] = new EnemyStunnedState();
            _states[EnemyStateId.Dead] = new EnemyDeadState();

            _lastPosition = transform.position;
            Transition(EnemyStateId.Idle, forceEnter: true);
        }

        internal void ReportSpeed(float speed) => LastPlanarSpeed = speed;

        private void Update()
        {
            if (root == null || root.Data == null || _currentState == null) return;

            float dt = Time.deltaTime;
            float speed = Vector3.Distance(transform.position, _lastPosition) / Mathf.Max(0.0001f, dt);
            _lastPosition = transform.position;
            LastPlanarSpeed = speed;

            root.Sensor.Refresh();

            // Higher-priority interrupts first: death, then stagger.
            if (!root.IsAlive && CurrentStateId != EnemyStateId.Dead)
            {
                Transition(EnemyStateId.Dead);
                return;
            }

            if (CurrentStateId != EnemyStateId.Dead && CurrentStateId != EnemyStateId.Stunned && root.HealthComponent.ConsumeStagger())
            {
                Transition(EnemyStateId.Stunned);
                return;
            }

            _context = new EnemyContext
            {
                Root = root,
                Now = Time.time,
                DeltaTime = dt,
                Config = new EnemyConfig
                {
                    DistanceToPlayer = root.Sensor.DistanceToPlayer,
                    CanSeePlayer = root.Sensor.CanSeePlayer && root.IsAlive,
                    AttackReady = root.Combat.IsReady
                }
            };

            var next = _currentState.Tick(_context);
            if (next != CurrentStateId)
            {
                Transition(next);
            }
        }

        private void Transition(EnemyStateId next, bool forceEnter = false)
        {
            if (!forceEnter && _currentState != null && _currentState.Id == next) return;

            var ctx = BuildContext();
            _currentState?.Exit(ctx);

            _currentState = _states[next];
            _currentState.Enter(ctx);
            StateChanged?.Invoke(next);
        }

        private EnemyContext BuildContext()
        {
            return new EnemyContext
            {
                Root = root,
                Now = Time.time,
                DeltaTime = Time.deltaTime,
                Config = new EnemyConfig
                {
                    DistanceToPlayer = root != null && root.Sensor != null ? root.Sensor.DistanceToPlayer : float.MaxValue,
                    CanSeePlayer = root != null && root.Sensor != null && root.Sensor.CanSeePlayer,
                    AttackReady = root != null && root.Combat != null && root.Combat.IsReady
                }
            };
        }
    }
}
