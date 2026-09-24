using System;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Player
{
    /// <summary>
    /// Ability slot (one placeholder ability: Ember Slam). Cooldown + cast windup, radial damage.
    /// Slots are data — extra abilities are new AbilityData assets, not new code paths.
    /// </summary>
    public class PlayerAbilities : MonoBehaviour
    {
        private const int BufferSize = 16;
        private readonly Collider[] _buffer = new Collider[BufferSize];

        private AbilityData _ability;
        private float _cooldownEndsAt;
        private float _castEndsAt;
        private bool _casting;

        public event Action<AbilityData> AbilityStarted;
        public event Action AbilityExecuted;

        public float CooldownRemaining => Mathf.Max(0f, _cooldownEndsAt - Time.time);
        public bool IsCastable => _ability != null && !_casting && CooldownRemaining <= 0f;

        public void Configure(AbilityData ability) => _ability = ability;

        public bool TryActivate()
        {
            if (!IsCastable) return false;
            _casting = true;
            _castEndsAt = Time.time + _ability.windup;
            AbilityStarted?.Invoke(_ability);
            return true;
        }

        public void Tick(float dt)
        {
            if (!_casting || Time.time < _castEndsAt) return;
            _casting = false;
            _cooldownEndsAt = Time.time + _ability.cooldown;
            Execute();
        }

        private void Execute()
        {
            int count = Physics.OverlapSphereNonAlloc(transform.position, _ability.radius, _buffer,
                PhysicsLayers.EnemyMask, QueryTriggerInteraction.Ignore);

            for (int i = 0; i < count; i++)
            {
                var col = _buffer[i];
                if (col == null || !col.TryGetComponent<IDamageable>(out var damageable)) continue;
                if (!damageable.IsAlive || damageable.Team == Team.Player) continue;

                Vector3 direction = col.transform.position - transform.position;
                direction.y = 0f;
                if (direction.sqrMagnitude < 0.0001f) direction = transform.forward;
                direction.Normalize();

                var info = DamageInfo.Simple(_ability.damage, _ability.poiseDamage, gameObject, Team.Player,
                    col.ClosestPoint(transform.position), direction, true);
                damageable.ApplyDamage(info);
            }

            EventBus.RaiseHitStop(_ability.hitStopSeconds);
            EventBus.RaiseCameraImpulse(_ability.cameraImpulse, transform.position);
            AbilityExecuted?.Invoke();
        }
    }
}
