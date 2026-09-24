using UnityEngine;

namespace GladToSeeYou.Data
{
    /// <summary>Hero tuning. Owned by PlayerRoot; never hard-code these values in gameplay classes.</summary>
    [CreateAssetMenu(fileName = "PlayerStats", menuName = "Glad To See You/Player Stats")]
    public class PlayerStats : ScriptableObject
    {
        [Header("Health & Poise")]
        public float maxHealth = 100f;
        public float poiseMax = 40f;
        [Tooltip("Seconds of post-hit invulnerability granted to the player.")]
        public float hitInvulnerability = 0.7f;

        [Header("Locomotion")]
        public float walkSpeed = 2.1f;
        public float runSpeed = 4.6f;
        [Tooltip("Acceleration/deceleration in m/s².")]
        public float acceleration = 26f;
        public float rotationSpeedDegPerSec = 720f;

        [Header("Dodge")]
        public float dodgeDistance = 3.4f;
        public float dodgeDuration = 0.38f;
        [Range(0f, 1f)] public float dodgeInvulnStart = 0.08f;
        [Range(0f, 1f)] public float dodgeInvulnEnd = 0.78f;
        public float dodgeCooldown = 0.45f;

        [Header("Stamina")]
        public float staminaMax = 100f;
        public float staminaRegenPerSec = 28f;
        public float staminaHeavyCost = 22f;
        public float staminaDodgeCost = 12f;

        [Header("Camera-lock")]
        public float lockOnRange = 9f;
        public float lockBreakRange = 13f;
    }
}
