using GladToSeeYou.Audio;
using GladToSeeYou.Combat;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using GladToSeeYou.Input;
using UnityEngine;

namespace GladToSeeYou.Player
{
    /// <summary>
    /// Player composition root. Ticks the player cluster in a deterministic order (documented
    /// exception to per-system Update — see ARCHITECTURE.md), distributes input, owns stamina,
    /// and reacts to death. No gameplay math lives here.
    /// </summary>
    public class PlayerRoot : MonoBehaviour
    {
        [SerializeField] private PlayerMovement movement;
        [SerializeField] private PlayerDodge dodge;
        [SerializeField] private PlayerCombat combat;
        [SerializeField] private PlayerHealth playerHealth;
        [SerializeField] private PlayerAnimation playerAnimation;
        [SerializeField] private PlayerTargeting targeting;
        [SerializeField] private PlayerAbilities abilities;

        private PlayerStats _stats;
        private InputRouter _input;
        private Transform _cameraTransform;

        private AudioEvent _stepSound;
        private AudioEvent _whooshLight;
        private AudioEvent _whooshHeavy;
        private AudioEvent _dodgeSound;

        private float _stamina;
        private float _lastBroadcastStamina = float.MinValue;
        private bool _dead;

        public PlayerHealth HealthComponent => playerHealth;
        public PlayerTargeting Targeting => targeting;
        public PlayerCombat Combat => combat;
        public bool IsAlive => !_dead && (playerHealth == null || playerHealth.IsAlive);

        public void Configure(PlayerStats stats, InputRouter input, Transform cameraTransform,
            PlayerMovement move, PlayerDodge dodgeComponent, PlayerCombat combatComponent, PlayerHealth health,
            PlayerAnimation animation, PlayerTargeting targetingComponent, PlayerAbilities abilitiesComponent,
            AudioEvent step, AudioEvent whooshLight, AudioEvent whooshHeavy, AudioEvent dodgeSfx)
        {
            _stats = stats;
            _input = input;
            _cameraTransform = cameraTransform;

            movement = move;
            dodge = dodgeComponent;
            combat = combatComponent;
            playerHealth = health;
            playerAnimation = animation;
            targeting = targetingComponent;
            abilities = abilitiesComponent;

            _stepSound = step;
            _whooshLight = whooshLight;
            _whooshHeavy = whooshHeavy;
            _dodgeSound = dodgeSfx;

            _stamina = stats.staminaMax;

            movement.Stepped += OnStepped;
            playerHealth.Died += OnDied;
            if (combat != null) combat.AttackStarted += OnAttackStarted;
            if (abilities != null) abilities.AbilityStarted += _ => playerAnimation.NotifyAbility();

            EventBus.RaisePlayerStaminaChanged(_stamina, stats.staminaMax);
        }

        private void OnDestroy()
        {
            if (movement != null) movement.Stepped -= OnStepped;
            if (playerHealth != null) playerHealth.Died -= OnDied;
            if (combat != null) combat.AttackStarted -= OnAttackStarted;
        }

        private void Update()
        {
            if (_stats == null || _input == null) return;

            _input.Refresh();
            var commands = _input.Commands;
            float dt = Time.deltaTime;

            if (_dead)
            {
                // Keep the camera/game alive but the player inert.
                combat.Tick(dt);
                targeting.Tick(dt);
                return;
            }

            movement.SetMoveInput(commands.Move);
            Vector3 moveDir = ComputeWorldDirection(commands.Move);

            // Dodge (stamina-gated)
            if (commands.DodgePressed && _stamina >= _stats.staminaDodgeCost && dodge.CanDodge)
            {
                if (dodge.TryDodge(moveDir))
                {
                    SpendStamina(_stats.staminaDodgeCost);
                    PlaySound(_dodgeSound);
                    playerAnimation.NotifyDodge();
                }
            }

            // Attacks (heavy is stamina-gated; light is free)
            if (commands.LightAttackPressed)
            {
                combat.TryLightAttack();
            }

            if (commands.HeavyAttackPressed && _stamina >= _stats.staminaHeavyCost && combat.TryHeavyAttack())
            {
                SpendStamina(_stats.staminaHeavyCost);
            }

            if (commands.LockOnPressed) targeting.Toggle();
            if (commands.AbilityPressed) abilities.TryActivate();

            // Stamina regen while not attacking/dodging
            if (!combat.IsAttacking && !dodge.IsDodging)
            {
                _stamina = Mathf.Min(_stats.staminaMax, _stamina + _stats.staminaRegenPerSec * dt);
                BroadcastStamina();
            }

            // Deterministic tick order: movement → dodge → combat → abilities → targeting → animation
            movement.Tick(dt);
            dodge.Tick(dt);
            combat.Tick(dt);
            abilities.Tick(dt);
            targeting.Tick(dt);
            playerAnimation.Tick(dt, movement.NormalizedSpeed, movement.IsGrounded);
        }

        /// <summary>Camera-relative world direction for dodge bursts etc.</summary>
        public Vector3 ComputeWorldDirection(Vector2 move)
        {
            if (move.sqrMagnitude < 0.0004f) return Vector3.zero;

            Vector3 forward = _cameraTransform != null ? _cameraTransform.forward : Vector3.forward;
            Vector3 right = _cameraTransform != null ? _cameraTransform.right : Vector3.right;
            forward.y = 0f;
            right.y = 0f;
            forward.Normalize();
            right.Normalize();
            return (forward * move.y + right * move.x).normalized;
        }

        private void SpendStamina(float amount)
        {
            _stamina = Mathf.Max(0f, _stamina - amount);
            BroadcastStamina();
        }

        private void BroadcastStamina()
        {
            if (Mathf.Abs(_stamina - _lastBroadcastStamina) > 0.25f)
            {
                _lastBroadcastStamina = _stamina;
                EventBus.RaisePlayerStaminaChanged(_stamina, _stats.staminaMax);
            }
        }

        private void OnStepped(float speed)
        {
            PlaySound(_stepSound);
        }

        private void OnAttackStarted(AttackStep step)
        {
            bool heavy = step != null && step.damage >= 25f;
            PlaySound(heavy ? _whooshHeavy : _whooshLight);
        }

        private void PlaySound(AudioEvent audioEvent)
        {
            if (audioEvent == null) return;
            if (GameRoot.TryGet(out var root) && root.Audio != null)
            {
                root.Audio.Play(audioEvent, transform.position);
            }
        }

        private void OnDied()
        {
            _dead = true;
            movement.Halt();
            combat.Interrupt();
            dodge.enabled = false;
            abilities.enabled = false;
        }
    }
}
