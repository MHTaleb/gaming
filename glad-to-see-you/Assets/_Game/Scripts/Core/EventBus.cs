using System;
using UnityEngine;

namespace GladToSeeYou.Core
{
    /// <summary>
    /// Static, typed event channel for *reactions* (feedback, UI, audio, camera).
    /// Gameplay decisions still flow through direct references — see Documentation/ARCHITECTURE.md.
    /// Handlers MUST unsubscribe in OnDisable/OnDestroy; state is reset between play sessions.
    /// </summary>
    public static class EventBus
    {
        /// <summary>Raised after damage was actually applied (not for dodged/ignored hits).</summary>
        public static event Action<DamageInfo, GameObject> DamageApplied;

        /// <summary>Raised once when a damageable object dies.</summary>
        public static event Action<GameObject> Died;

        /// <summary>Request a short freeze-frame (seconds, unscaled). Handled by HitStopService.</summary>
        public static event Action<float> HitStopRequested;

        /// <summary>Request a camera impulse at a world position. magnitude ~ meters of shake.</summary>
        public static event Action<float, Vector3> CameraImpulseRequested;

        public static event Action<float, float> PlayerHealthChanged;   // current, max
        public static event Action<float, float> PlayerStaminaChanged;  // current, max

        public static event Action<GameObject> TargetLocked;
        public static event Action TargetUnlocked;

        public static void RaiseDamageApplied(in DamageInfo info, GameObject victim) => DamageApplied?.Invoke(info, victim);
        public static void RaiseDied(GameObject who) => Died?.Invoke(who);
        public static void RaiseHitStop(float seconds) => HitStopRequested?.Invoke(Mathf.Max(0f, seconds));
        public static void RaiseCameraImpulse(float magnitude, Vector3 worldPosition) => CameraImpulseRequested?.Invoke(magnitude, worldPosition);
        public static void RaisePlayerHealthChanged(float current, float max) => PlayerHealthChanged?.Invoke(current, max);
        public static void RaisePlayerStaminaChanged(float current, float max) => PlayerStaminaChanged?.Invoke(current, max);
        public static void RaiseTargetLocked(GameObject target) => TargetLocked?.Invoke(target);
        public static void RaiseTargetUnlocked() => TargetUnlocked?.Invoke();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetStaticState()
        {
            DamageApplied = null;
            Died = null;
            HitStopRequested = null;
            CameraImpulseRequested = null;
            PlayerHealthChanged = null;
            PlayerStaminaChanged = null;
            TargetLocked = null;
            TargetUnlocked = null;
        }
    }
}
