using UnityEngine;

namespace GladToSeeYou.Data
{
    public enum QualityTier
    {
        Low = 0,
        Balanced = 1,
        High = 2
    }

    /// <summary>
    /// One device-quality profile. QualityProfileService applies the ACTIVE one at runtime;
    /// budgets these values must respect are in Documentation/PERFORMANCE_BUDGET.md.
    /// </summary>
    [CreateAssetMenu(fileName = "QualityProfile", menuName = "Glad To See You/Quality Profile")]
    public class QualityProfileData : ScriptableObject
    {
        public QualityTier tier = QualityTier.Balanced;

        [Header("Frame")]
        [Tooltip("30 for Low, 60 otherwise.")]
        public int targetFrameRate = 60;

        [Header("Rendering (applied to the URP asset at runtime where possible)")]
        [Range(0.5f, 1.2f)] public float renderScale = 1f;
        public float shadowDistance = 30f;
        [Range(1, 8)] public int pixelLightCount = 4;

        [Header("VFX")]
        [Range(0.25f, 1f)] public float vfxDensity = 1f;
    }
}
