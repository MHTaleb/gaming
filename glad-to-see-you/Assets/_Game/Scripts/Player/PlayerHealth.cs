using System;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Player
{
    /// <summary>
    /// Player-flavored wrapper around Health: post-hit invulnerability + a Hit event other player
    /// systems subscribe to (animation flinch, combat interrupt), and HUD broadcasts.
    /// </summary>
    [RequireComponent(typeof(Health))]
    public class PlayerHealth : MonoBehaviour
    {
        private Health _health;
        private PlayerStats _stats;

        public Health Health => _health;
        public bool IsAlive => _health != null && _health.IsAlive;

        public event Action<DamageInfo> Hit;
        public event Action Died;

        public void Configure(PlayerStats stats)
        {
            _stats = stats;
            _health = GetComponent<Health>();
            _health.Configure(Team.Player, stats.maxHealth, stats.poiseMax);
            EventBus.RaisePlayerHealthChanged(_health.Current, _health.Max);
        }

        private void OnEnable()
        {
            EventBus.DamageApplied += OnDamageApplied;
            EventBus.Died += OnDied;
        }

        private void OnDisable()
        {
            EventBus.DamageApplied -= OnDamageApplied;
            EventBus.Died -= OnDied;
        }

        private void OnDamageApplied(DamageInfo info, GameObject victim)
        {
            if (victim != gameObject || _health == null) return;

            _health.SetInvulnerableFor(_stats != null ? _stats.hitInvulnerability : 0.5f);
            EventBus.RaisePlayerHealthChanged(_health.Current, _health.Max);
            Hit?.Invoke(info);
        }

        private void OnDied(GameObject who)
        {
            if (who != gameObject) return;
            EventBus.RaisePlayerHealthChanged(0f, _health != null ? _health.Max : 1f);
            Died?.Invoke();
        }
    }
}
