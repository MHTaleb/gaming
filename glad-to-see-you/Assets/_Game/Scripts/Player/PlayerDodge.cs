using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Player
{
    /// <summary>
    /// Dodge roll: burst impulse through PlayerMovement + i-frames through Health.
    /// Root asks <see cref="CanDodge"/>, pays stamina, then calls <see cref="TryDodge"/>.
    /// </summary>
    public class PlayerDodge : MonoBehaviour
    {
        private PlayerStats _stats;
        private Health _health;
        private PlayerMovement _movement;

        private float _endsAt;
        private float _cooldownUntil;

        public bool IsDodging { get; private set; }
        public bool CanDodge => !IsDodging && Time.time >= _cooldownUntil;

        public void Configure(PlayerStats stats, Health health, PlayerMovement movement)
        {
            _stats = stats;
            _health = health;
            _movement = movement;
        }

        public bool TryDodge(Vector3 direction)
        {
            if (_stats == null || !CanDodge) return false;

            Vector3 dir = direction.sqrMagnitude > 0.001f ? direction.normalized : -transform.forward;
            IsDodging = true;
            _endsAt = Time.time + _stats.dodgeDuration;
            _cooldownUntil = _endsAt + _stats.dodgeCooldown;

            _movement.AddImpulse(dir * (_stats.dodgeDistance / Mathf.Max(0.05f, _stats.dodgeDuration)));
            _health.SetInvulnerableFor(_stats.dodgeDuration * _stats.dodgeInvulnEnd);
            return true;
        }

        public void Tick(float dt)
        {
            if (IsDodging && Time.time >= _endsAt)
            {
                IsDodging = false;
            }
        }
    }
}
