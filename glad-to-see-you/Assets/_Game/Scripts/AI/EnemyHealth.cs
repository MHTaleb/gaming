using System;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.AI
{
    /// <summary>Enemy wrapper around Health: config + Hit event for reactions + stagger handoff to the brain.</summary>
    [RequireComponent(typeof(Health))]
    public class EnemyHealth : MonoBehaviour
    {
        private Health _health;

        public Health Health => _health;
        public bool IsAlive => _health != null && _health.IsAlive;

        public event Action<DamageInfo> Hit;

        public void Configure(EnemyData data)
        {
            _health = GetComponent<Health>();
            _health.Configure(Team.Enemy, data.maxHealth, data.poiseMax);
        }

        /// <summary>Polls the one-shot stagger flag set by Health when poise breaks.</summary>
        public bool ConsumeStagger() => _health != null && _health.ConsumeStaggered();

        private void OnEnable() => EventBus.DamageApplied += OnDamageApplied;

        private void OnDisable() => EventBus.DamageApplied -= OnDamageApplied;

        private void OnDamageApplied(DamageInfo info, GameObject victim)
        {
            if (victim != gameObject) return;
            Hit?.Invoke(info);
        }
    }
}
