using UnityEngine;

namespace GladToSeeYou.Data
{
    /// <summary>Single enemy archetype tuning. Read by EnemyBrain/Combat/Locomotion; never hard-coded.</summary>
    [CreateAssetMenu(fileName = "EnemyData", menuName = "Glad To See You/Enemy Data")]
    public class EnemyData : ScriptableObject
    {
        public string displayName = "Ash Revenant";

        [Header("Health")]
        public float maxHealth = 120f;
        public float poiseMax = 55f;

        [Header("Perception")]
        public float detectionRadius = 10f;
        public float loseTargetRadius = 16f;
        [Tooltip("Patrol waits at each waypoint before moving on.")]
        public float patrolPauseSeconds = 1.4f;

        [Header("Locomotion")]
        public float patrolSpeed = 1.1f;
        public float chaseSpeed = 3.4f;
        public float turnSpeedDegPerSec = 420f;
        [Tooltip("Stops at this range instead of hugging the player.")]
        public float preferredRange = 1.6f;

        [Header("Attack")]
        public float attackRange = 2.3f;
        public float attackCooldown = 1.6f;
        public float attackWindup = 0.55f;
        public float attackActive = 0.12f;
        public float attackRecovery = 0.65f;
        [Tooltip("How long the telegraph flash shows before the swing (inside windup).")]
        public float telegraphFlashSeconds = 0.35f;
        public float damage = 22f;
        public float poiseDamage = 30f;
        public float hitboxRadius = 1.0f;
        public float hitboxForwardOffset = 1.2f;

        [Header("Reactions")]
        public float staggerSeconds = 0.85f;
        public float hitStopOnDealSeconds = 0.06f;
        public float cameraImpulseOnDeal = 0.05f;
    }
}
