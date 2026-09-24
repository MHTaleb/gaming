using System;
using GladToSeeYou.Animation;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Player
{
    /// <summary>
    /// Pushes player state into the animation driver and forwards reaction events to it.
    /// Knows nothing about clips or controllers — just the IAnimationDriver contract.
    /// </summary>
    public class PlayerAnimation : MonoBehaviour
    {
        private IAnimationDriver _driver;
        private PlayerCombat _combat;
        private PlayerHealth _health;

        public void Configure(IAnimationDriver driver, PlayerCombat combat, PlayerHealth health)
        {
            _driver = driver;
            _combat = combat;
            _health = health;

            if (_combat != null) _combat.AttackStarted += OnAttackStarted;
            if (_health != null)
            {
                _health.Hit += OnHit;
                _health.Died += OnDied;
            }
        }

        private void OnDisable()
        {
            if (_combat != null) _combat.AttackStarted -= OnAttackStarted;
            if (_health != null)
            {
                _health.Hit -= OnHit;
                _health.Died -= OnDied;
            }
        }

        public void NotifyDodge() => _driver?.TriggerDodge();

        public void NotifyAbility() => _driver?.TriggerAbility();

        public void Tick(float dt, float normalizedSpeed, bool grounded)
        {
            _driver?.SetLocomotion(normalizedSpeed, grounded);
        }

        private void OnAttackStarted(AttackStep step) => _driver?.TriggerAttack(step != null && step.damage >= 25f);

        private void OnHit(DamageInfo info) => _driver?.TriggerHit(info.Direction);

        private void OnDied() => _driver?.TriggerDeath();
    }
}
