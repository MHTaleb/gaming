using UnityEngine;

namespace GladToSeeYou.Core
{
    /// <summary>
    /// Single owner of hit points + poise for both player and enemy.
    /// Reaction logic (hit-stun, death visuals) lives in the wrappers (PlayerHealth/EnemyHealth),
    /// which subscribe to <see cref="EventBus"/> — Health only mutates numbers.
    /// </summary>
    public class Health : MonoBehaviour, IDamageable
    {
        [SerializeField] private Team team = Team.Enemy;
        [SerializeField] private float maxHealth = 100f;
        [SerializeField] private float poiseMax = 30f;

        private float _health;
        private float _poise;
        private float _invulnerableUntil;
        private bool _staggered;

        public Team Team => team;
        public bool IsAlive { get; private set; } = true;
        public float Current => _health;
        public float Max => maxHealth;
        public float Normalized => maxHealth <= 0f ? 0f : Mathf.Clamp01(_health / maxHealth);
        public bool IsInvulnerable => Time.unscaledTime < _invulnerableUntil;

        public void Configure(Team ownerTeam, float health, float poise)
        {
            team = ownerTeam;
            maxHealth = Mathf.Max(1f, health);
            poiseMax = Mathf.Max(1f, poise);
            _health = maxHealth;
            _poise = poiseMax;
            _staggered = false;
            IsAlive = true;
        }

        public void SetInvulnerableFor(float seconds) => _invulnerableUntil = Mathf.Max(_invulnerableUntil, Time.unscaledTime + seconds);

        public void Heal(float amount)
        {
            if (!IsAlive) return;
            _health = Mathf.Min(maxHealth, _health + Mathf.Max(0f, amount));
        }

        public void Kill()
        {
            if (!IsAlive) return;
            _health = 0f;
            IsAlive = false;
            EventBus.RaiseDied(gameObject);
        }

        public DamageResult ApplyDamage(in DamageInfo info)
        {
            if (!IsAlive) return DamageResult.AlreadyDead;
            if (info.SourceTeam == team) return DamageResult.Ignored;
            if (IsInvulnerable) return DamageResult.Dodged;

            _health -= Mathf.Max(0f, info.Amount);
            _poise -= Mathf.Max(0f, info.PoiseDamage);
            if (_poise <= 0f)
            {
                _poise = poiseMax;
                _staggered = true;
            }

            EventBus.RaiseDamageApplied(info, gameObject);

            if (_health <= 0f)
            {
                _health = 0f;
                IsAlive = false;
                EventBus.RaiseDied(gameObject);
            }

            return DamageResult.Applied;
        }

        /// <summary>EnemyHealth polls this to enter the Stunned state exactly once per stagger.</summary>
        public bool ConsumeStaggered()
        {
            if (!_staggered) return false;
            _staggered = false;
            return true;
        }
    }
}
