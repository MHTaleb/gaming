using System;
using GladToSeeYou.Combat;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.AI
{
    /// <summary>
    /// Enemy attack execution: windup (telegraph) → active strike → recovery + cooldown.
    /// Timing and damage come from <see cref="EnemyData"/>; the strike itself uses WeaponHitbox.
    /// </summary>
    public class EnemyCombat : MonoBehaviour
    {
        private enum Phase
        {
            Idle,
            Windup,
            Active,
            Recovery
        }

        private EnemyData _data;
        private WeaponHitbox _hitbox;
        private AttackStep _cachedStep;

        private Phase _phase;
        private float _phaseEndsAt;
        private float _cooldownUntil;

        /// <summary>Raised the moment the swing starts winding up — the tell the player must read.</summary>
        public event Action TelegraphStarted;

        public bool IsAttacking => _phase != Phase.Idle;
        public bool IsReady => !IsAttacking && Time.time >= _cooldownUntil;

        public void Configure(EnemyData data, WeaponHitbox hitbox)
        {
            _data = data;
            _hitbox = hitbox;
            _cachedStep = new AttackStep
            {
                windup = data.attackWindup,
                active = data.attackActive,
                recovery = data.attackRecovery,
                damage = data.damage,
                poiseDamage = data.poiseDamage,
                lungeSpeed = 0f,
                hitboxRadius = data.hitboxRadius,
                hitboxForwardOffset = data.hitboxForwardOffset,
                hitboxHeight = 1.0f,
                hitStopSeconds = data.hitStopOnDealSeconds,
                cameraImpulse = data.cameraImpulseOnDeal
            };
            telegraphFlashSeconds = data.telegraphFlashSeconds;
        }

        /// <summary>Seconds before the strike when the telegraph flash should show (read by animation/VFX).</summary>
        public float telegraphFlashSeconds { get; private set; }

        public bool BeginAttack()
        {
            if (!IsReady) return false;

            _phase = Phase.Windup;
            _phaseEndsAt = Time.time + _data.attackWindup;
            TelegraphStarted?.Invoke();
            return true;
        }

        public void Tick(float dt)
        {
            if (_phase == Phase.Idle) return;

            float now = Time.time;
            switch (_phase)
            {
                case Phase.Windup:
                    if (now >= _phaseEndsAt)
                    {
                        _phase = Phase.Active;
                        _phaseEndsAt = now + _data.attackActive;
                        _hitbox.Strike(_cachedStep, transform.position, transform.forward, 1.0f,
                            PhysicsLayers.EnemyAttackMask, Team.Enemy, gameObject);
                    }

                    break;

                case Phase.Active:
                    if (now >= _phaseEndsAt)
                    {
                        _phase = Phase.Recovery;
                        _phaseEndsAt = now + _data.attackRecovery;
                    }

                    break;

                case Phase.Recovery:
                    if (now >= _phaseEndsAt)
                    {
                        _phase = Phase.Idle;
                        _cooldownUntil = now + _data.attackCooldown;
                    }

                    break;
            }
        }

        /// <summary>Abort without damage (stun, death). Applies a short cooldown so it can't instantly re-swing.</summary>
        public void Cancel()
        {
            if (_phase == Phase.Idle) return;
            _phase = Phase.Idle;
            _cooldownUntil = Time.time + 0.25f;
        }
    }
}
