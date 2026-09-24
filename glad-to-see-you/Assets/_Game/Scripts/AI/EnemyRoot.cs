using GladToSeeYou.Animation;
using GladToSeeYou.Combat;
using GladToSeeYou.Data;
using UnityEngine;
using UnityEngine.AI;

namespace GladToSeeYou.AI
{
    /// <summary>Enemy composition root — holds refs and wires the cluster; no logic of its own.</summary>
    public class EnemyRoot : MonoBehaviour
    {
        [SerializeField] private EnemyData data;
        [SerializeField] private EnemySensor sensor;
        [SerializeField] private EnemyLocomotion locomotion;
        [SerializeField] private EnemyCombat combat;
        [SerializeField] private EnemyHealth health;
        [SerializeField] private EnemyAnimation animation;
        [SerializeField] private Transform[] patrolPoints;

        private EnemyBrain _brain;
        private Collider _collider;

        public EnemyData Data => data;
        public EnemySensor Sensor => sensor;
        public EnemyLocomotion Locomotion => locomotion;
        public EnemyCombat Combat => combat;
        public EnemyHealth HealthComponent => health;
        public EnemyAnimation Animation => animation;
        public Transform[] PatrolPoints => patrolPoints;
        public bool IsAlive => health != null && health.IsAlive;
        public Vector3 PlayerPosition => sensor != null && sensor.PlayerTransform != null
            ? sensor.PlayerTransform.position
            : transform.position;

        public void Configure(EnemyData enemyData, Transform player, Transform[] waypoints,
            EnemySensor sensorComponent, EnemyLocomotion locomotionComponent, EnemyCombat combatComponent,
            EnemyHealth healthComponent, EnemyAnimation animationComponent, EnemyBrain brain,
            IAnimationDriver animationDriver, WeaponHitbox hitbox)
        {
            data = enemyData;
            patrolPoints = waypoints;
            sensor = sensorComponent;
            locomotion = locomotionComponent;
            combat = combatComponent;
            health = healthComponent;
            animation = animationComponent;
            _brain = brain;
            _collider = GetComponent<Collider>();

            sensor.Configure(enemyData, player);
            locomotion.Configure(GetComponent<NavMeshAgent>(), enemyData);
            combat.Configure(enemyData, hitbox);
            health.Configure(enemyData);
            animation.Configure(animationDriver, combat, health);
            brain.Configure(this);
        }

        /// <summary>Called by the Dead state: physics off so the corpse can't be walked into or re-hit.</summary>
        public void OnDied()
        {
            locomotion.Stop();
            if (_collider != null) _collider.enabled = false;

            var agent = GetComponent<NavMeshAgent>();
            if (agent != null) agent.enabled = false;
        }

        private void Update()
        {
            if (data == null || _brain == null) return;

            // Animation speed comes from actual planar displacement (agent or fallback).
            float speed = _brain.LastPlanarSpeed;
            animation.Tick(Time.deltaTime, data.chaseSpeed <= 0.01f ? 0f : Mathf.Clamp01(speed / data.chaseSpeed));
        }

        internal void ReportSpeed(float speed) => _brain.ReportSpeed(speed);
    }
}
