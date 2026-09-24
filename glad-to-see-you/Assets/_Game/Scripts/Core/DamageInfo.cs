using UnityEngine;

namespace GladToSeeYou.Core
{
    public enum Team
    {
        Player,
        Enemy,
        Neutral
    }

    public enum DamageResult
    {
        Applied,
        Dodged,
        AlreadyDead,
        Ignored
    }

    /// <summary>
    /// Everything a damage event needs, in one struct (no allocations in combat paths).
    /// </summary>
    public struct DamageInfo
    {
        public float Amount;
        public float PoiseDamage;
        public Vector3 Point;
        public Vector3 Normal;
        public Vector3 Direction;
        public GameObject Source;
        public Team SourceTeam;
        public bool IsHeavy;

        public static DamageInfo Simple(float amount, float poiseDamage, GameObject source, Team sourceTeam,
            Vector3 point, Vector3 direction, bool isHeavy = false)
        {
            return new DamageInfo
            {
                Amount = amount,
                PoiseDamage = poiseDamage,
                Source = source,
                SourceTeam = sourceTeam,
                Point = point,
                Normal = -direction,
                Direction = direction,
                IsHeavy = isHeavy
            };
        }
    }

    /// <summary>Anything that can receive damage (players, enemies, breakables later).</summary>
    public interface IDamageable
    {
        Team Team { get; }
        bool IsAlive { get; }
        DamageResult ApplyDamage(in DamageInfo info);
    }
}
