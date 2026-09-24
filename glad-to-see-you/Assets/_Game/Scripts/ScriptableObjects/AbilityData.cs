using UnityEngine;

namespace GladToSeeYou.Data
{
    /// <summary>A hero ability (placeholder set: one ground-slam). Executed by PlayerAbilities.</summary>
    [CreateAssetMenu(fileName = "AbilityData", menuName = "Glad To See You/Ability Data")]
    public class AbilityData : ScriptableObject
    {
        public string displayName = "Ember Slam";

        [Header("Timing")]
        public float cooldown = 6f;
        public float windup = 0.35f;
        public float recovery = 0.6f;

        [Header("Effect (radial)")]
        public float radius = 3.2f;
        public float damage = 30f;
        public float poiseDamage = 55f;
        public float knockback = 4f;

        [Header("Feel")]
        public float hitStopSeconds = 0.1f;
        public float cameraImpulse = 0.12f;
    }
}
