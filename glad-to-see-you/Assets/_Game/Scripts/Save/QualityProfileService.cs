using GladToSeeYou.Data;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace GladToSeeYou.Save
{
    /// <summary>
    /// Applies the active <see cref="QualityProfileData"/> to the engine + URP at runtime.
    /// On-device verification procedure: Documentation/PERFORMANCE_BUDGET.md §"How to verify".
    /// </summary>
    public class QualityProfileService : MonoBehaviour
    {
        [SerializeField] private QualityProfileData low;
        [SerializeField] private QualityProfileData balanced;
        [SerializeField] private QualityProfileData high;

        private SaveService _save;

        /// <summary>Current VFX density multiplier (consumed by VFXService).</summary>
        public float VfxDensity { get; private set; } = 1f;

        public QualityTier CurrentTier => _save?.Quality ?? QualityTier.Balanced;

        public void Configure(SaveService save, QualityProfileData lowProfile, QualityProfileData balancedProfile, QualityProfileData highProfile)
        {
            _save = save;
            low = lowProfile;
            balanced = balancedProfile;
            high = highProfile;
        }

        public void SetTier(QualityTier tier)
        {
            _save?.SetQuality(tier);
            ApplyCurrentProfile();
        }

        public void ApplyCurrentProfile()
        {
            var profile = Resolve(CurrentTier);
            if (profile == null)
            {
                Debug.LogWarning("[QualityProfileService] No quality profile assigned; running with defaults.", this);
                return;
            }

            Application.targetFrameRate = profile.targetFrameRate;
            QualitySettings.pixelLightCount = profile.pixelLightCount;
            VfxDensity = profile.vfxDensity;

            // URP runtime tweaks (guarded: asset may not exist on a fresh project until Bootstrap runs).
            var urp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (urp != null)
            {
                urp.renderScale = profile.renderScale;
                urp.shadowDistance = profile.shadowDistance;
            }
            else
            {
                Debug.LogWarning("[QualityProfileService] Active render pipeline is not URP; " +
                                 "render scale / shadow distance not applied. Run Bootstrap ▸ 1. Setup Project.", this);
            }
        }

        private QualityProfileData Resolve(QualityTier tier)
        {
            switch (tier)
            {
                case QualityTier.Low: return low != null ? low : balanced;
                case QualityTier.High: return high != null ? high : balanced;
                default: return balanced;
            }
        }
    }
}
