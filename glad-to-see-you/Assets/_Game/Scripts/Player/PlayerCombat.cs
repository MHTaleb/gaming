using System;
using GladToSeeYou.Combat;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Player
{
    public enum AttackPhase
    {
        None,
        Windup,
        Active,
        Recovery
    }

    /// <summary>
    /// Executes the moveset defined in <see cref="WeaponData"/>: light chains, heavy, and the
    /// windup→active→recovery clock. Damage is applied by <see cref="WeaponHitbox"/>.
    /// Attack timing is data-driven — animation events are never required for correctness.
    /// </summary>
    public class PlayerCombat : MonoBehaviour
    {
        private WeaponData _weapon;
        private WeaponHitbox _hitbox;
        private PlayerMovement _movement;

        private AttackStep _currentStep;
        private AttackPhase _phase = AttackPhase.None;
        private float _phaseEndsAt;
        private int _chainIndex = -1;
        private bool _nextQueued;

        public AttackPhase Phase => _phase;
        public bool IsAttacking => _phase != AttackPhase.None;

        public event Action<AttackStep> AttackStarted;   // animation hook
        public event Action AttackFinished;

        public void Configure(WeaponData weapon, WeaponHitbox hitbox, PlayerMovement movement)
        {
            _weapon = weapon;
            _hitbox = hitbox;
            _movement = movement;
        }

        /// <summary>Returns true if the input was consumed (started or queued a chain step).</summary>
        public bool TryLightAttack()
        {
            if (_weapon == null) return false;

            if (!IsAttacking)
            {
                StartStep(_weapon.LightStep(0), 0);
                return true;
            }

            // Queue the next chain link while in recovery (or late windup) — classic combo feel.
            if (_phase == AttackPhase.Recovery && _chainIndex + 1 < _weapon.LightChainLength)
            {
                if (Time.time <= _phaseEndsAt + _currentStep.comboChainWindow)
                {
                    _nextQueued = true;
                    return true;
                }
            }

            return false;
        }

        public bool TryHeavyAttack()
        {
            if (_weapon == null || IsAttacking) return false;
            StartStep(_weapon.heavy, -1);
            return true;
        }

        public void Tick(float dt)
        {
            if (_phase == AttackPhase.None) return;

            float now = Time.time;
            switch (_phase)
            {
                case AttackPhase.Windup:
                    if (now >= _phaseEndsAt)
                    {
                        EnterActive(now);
                    }

                    break;

                case AttackPhase.Active:
                    if (now >= _phaseEndsAt)
                    {
                        _phase = AttackPhase.Recovery;
                        _phaseEndsAt = now + _currentStep.recovery;
                    }

                    break;

                case AttackPhase.Recovery:
                    if (now >= _phaseEndsAt)
                    {
                        if (_nextQueued && _chainIndex + 1 < _weapon.LightChainLength)
                        {
                            StartStep(_weapon.LightStep(_chainIndex + 1), _chainIndex + 1);
                        }
                        else
                        {
                            EndAttack();
                        }
                    }

                    break;
            }
        }

        /// <summary>Interrupt (hit reaction): aborts the swing without applying damage.</summary>
        public void Interrupt()
        {
            if (_phase == AttackPhase.None) return;
            EndAttack();
        }

        private void StartStep(AttackStep step, int chainIndex)
        {
            _currentStep = step;
            _chainIndex = chainIndex;
            _nextQueued = false;
            _phase = AttackPhase.Windup;
            _phaseEndsAt = Time.time + step.windup;
            AttackStarted?.Invoke(step);
        }

        private void EnterActive(float now)
        {
            _phase = AttackPhase.Active;
            _phaseEndsAt = now + _currentStep.active;

            // Lunge as a decaying impulse so it blends with locomotion instead of teleporting.
            Vector3 forward = transform.forward;
            if (_currentStep.lungeSpeed > 0.01f)
            {
                _movement.AddImpulse(forward * _currentStep.lungeSpeed);
            }

            _hitbox.Strike(_currentStep,
                transform.position,
                forward,
                _currentStep.hitboxHeight,
                PhysicsLayers.PlayerAttackMask,
                Team.Player,
                gameObject);
        }

        private void EndAttack()
        {
            _phase = AttackPhase.None;
            _chainIndex = -1;
            _nextQueued = false;
            AttackFinished?.Invoke();
        }
    }
}
