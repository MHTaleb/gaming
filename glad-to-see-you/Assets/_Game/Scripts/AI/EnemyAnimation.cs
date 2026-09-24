using GladToSeeYou.Animation;
using GladToSeeYou.Core;
using UnityEngine;

namespace GladToSeeYou.AI
{
    /// <summary>Bridges enemy state/reactions into the animation driver (procedural or animator).</summary>
    public class EnemyAnimation : MonoBehaviour
    {
        private IAnimationDriver _driver;
        private EnemyCombat _combat;
        private EnemyHealth _health;

        public void Configure(IAnimationDriver driver, EnemyCombat combat, EnemyHealth health)
        {
            _driver = driver;
            _combat = combat;
            _health = health;

            if (_combat != null) _combat.TelegraphStarted += OnTelegraph;
            if (_health != null) _health.Hit += OnHit;
        }

        private void OnDisable()
        {
            if (_combat != null) _combat.TelegraphStarted -= OnTelegraph;
            if (_health != null) _health.Hit -= OnHit;
        }

        public void Tick(float dt, float normalizedSpeed) => _driver?.SetLocomotion(normalizedSpeed, true);

        public void SetStunned(bool stunned) => _driver?.SetStunned(stunned);

        public void NotifyDeath() => _driver?.TriggerDeath();

        private void OnTelegraph() => _driver?.TriggerAttack(false);

        private void OnHit(DamageInfo info) => _driver?.TriggerHit(info.Direction);
    }
}
