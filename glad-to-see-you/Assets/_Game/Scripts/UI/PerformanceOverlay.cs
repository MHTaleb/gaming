#if DEVELOPMENT_BUILD || UNITY_EDITOR
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;
using UnityEngine.InputSystem;

namespace GladToSeeYou.UI
{
    /// <summary>
    /// Dev-only overlay: FPS, frame ms, managed memory, quality hotkeys.
    /// Compiled out of release builds (no cost shipped). Hotkeys:
    /// F1 = Low, F2 = Balanced, F3 = High, F8 = toggle this overlay, F5 = toggle mobile controls.
    /// </summary>
    public class PerformanceOverlay : MonoBehaviour
    {
        [SerializeField] private bool visible = true;
        [SerializeField] private MobileControlsPanel mobileControls;

        private float _smoothedMs = 16f;

        public void Configure(MobileControlsPanel controls) => mobileControls = controls;

        private void Update()
        {
            _smoothedMs = Mathf.Lerp(_smoothedMs, Time.unscaledDeltaTime * 1000f, 0.08f);

            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.f1Key.wasPressedThisFrame) SetTier(QualityTier.Low);
            else if (keyboard.f2Key.wasPressedThisFrame) SetTier(QualityTier.Balanced);
            else if (keyboard.f3Key.wasPressedThisFrame) SetTier(QualityTier.High);
            else if (keyboard.f8Key.wasPressedThisFrame) visible = !visible;
            else if (keyboard.f5Key.wasPressedThisFrame && mobileControls != null) mobileControls.Toggle();
        }

        private void SetTier(QualityTier tier)
        {
            if (GameRoot.TryGet(out var root) && root.Quality != null)
            {
                root.Quality.SetTier(tier);
            }
        }

        private void OnGUI()
        {
            if (!visible) return;

            var root = GameRoot.Instance;
            string tier = root != null && root.Quality != null ? root.Quality.CurrentTier.ToString() : "n/a";
            float mb = System.GC.GetTotalMemory(false) / (1024f * 1024f);

            GUI.color = new Color(0f, 0f, 0f, 0.55f);
            GUI.Box(new Rect(8, 8, 292, 84), GUIContent.none);
            GUI.color = Color.white;

            GUILayout.BeginArea(new Rect(16, 12, 280, 80));
            GUILayout.Label($"FPS {1000f / Mathf.Max(0.01f, _smoothedMs):F0}   ({_smoothedMs:F1} ms)");
            GUILayout.Label($"GC heap {mb:F1} MB    Quality: {tier}");
            GUILayout.Label("F1/F2/F3 quality · F5 touch UI · F8 hide");
            GUILayout.EndArea();
        }
    }
}
#endif
