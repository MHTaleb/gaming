using GladToSeeYou.Core;
using UnityEngine;
using UnityEngine.UI;

namespace GladToSeeYou.UI
{
    /// <summary>
    /// Combat HUD: health/stamina bars + lock-on reticle. Event-driven (no polling of gameplay state).
    /// Built by the factory; references wired there.
    /// </summary>
    public class HUDController : MonoBehaviour
    {
        [SerializeField] private Image healthFill;
        [SerializeField] private Image staminaFill;
        [SerializeField] private RectTransform lockReticle;

        private Transform _lockTarget;
        private UnityEngine.Camera _camera;

        public void Configure(Image health, Image stamina, RectTransform reticle, UnityEngine.Camera worldCamera)
        {
            healthFill = health;
            staminaFill = stamina;
            lockReticle = reticle;
            _camera = worldCamera;
            if (lockReticle != null) lockReticle.gameObject.SetActive(false);
        }

        private void OnEnable()
        {
            EventBus.PlayerHealthChanged += OnHealthChanged;
            EventBus.PlayerStaminaChanged += OnStaminaChanged;
            EventBus.TargetLocked += OnTargetLocked;
            EventBus.TargetUnlocked += OnTargetUnlocked;
        }

        private void OnDisable()
        {
            EventBus.PlayerHealthChanged -= OnHealthChanged;
            EventBus.PlayerStaminaChanged -= OnStaminaChanged;
            EventBus.TargetLocked -= OnTargetLocked;
            EventBus.TargetUnlocked -= OnTargetUnlocked;
        }

        private void OnHealthChanged(float current, float max)
        {
            if (healthFill != null) healthFill.fillAmount = max <= 0f ? 0f : Mathf.Clamp01(current / max);
        }

        private void OnStaminaChanged(float current, float max)
        {
            if (staminaFill != null) staminaFill.fillAmount = max <= 0f ? 0f : Mathf.Clamp01(current / max);
        }

        private void OnTargetLocked(GameObject target)
        {
            _lockTarget = target != null ? target.transform : null;
            if (lockReticle != null) lockReticle.gameObject.SetActive(_lockTarget != null);
        }

        private void OnTargetUnlocked()
        {
            _lockTarget = null;
            if (lockReticle != null) lockReticle.gameObject.SetActive(false);
        }

        private void LateUpdate()
        {
            if (_lockTarget == null || lockReticle == null) return;
            if (_camera == null) _camera = UnityEngine.Camera.main;
            if (_camera == null) return;

            Vector3 screen = _camera.WorldToScreenPoint(_lockTarget.position + Vector3.up * 1.0f);
            if (screen.z < 0f)
            {
                lockReticle.gameObject.SetActive(false);
                return;
            }

            lockReticle.gameObject.SetActive(true);
            lockReticle.position = screen;
        }
    }
}
