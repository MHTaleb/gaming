using UnityEngine;

namespace GladToSeeYou.Data
{
    /// <summary>
    /// Particle archetype description. VFXService builds real ParticleSystems from this at startup —
    /// swap values here (or replace with authored prefabs later) without touching gameplay code.
    /// </summary>
    [CreateAssetMenu(fileName = "VFXData", menuName = "Glad To See You/VFX Data")]
    public class VFXData : ScriptableObject
    {
        public string displayName = "Hit Spark";

        [Header("Look")]
        public Color startColor = new Color(1f, 0.55f, 0.2f, 1f);
        public Color endColor = new Color(1f, 0.2f, 0.05f, 0f);

        [Header("Emission")]
        [Range(1, 80)] public int burstCount = 24;
        public float lifetime = 0.45f;
        public float speedMin = 2.5f;
        public float speedMax = 5.5f;
        public float coneAngle = 42f;
        public float radius = 0.12f;
        [Range(0f, 2f)] public float gravity = 0.7f;
        public float sizeStart = 0.10f;
        public float sizeEnd = 0.0f;

        [Header("Budget")]
        [Tooltip("Max simultaneously alive particles for this archetype (pooled).")]
        [Range(8, 400)] public int maxAlive = 120;
    }
}
