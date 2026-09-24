using UnityEngine;

namespace GladToSeeYou.Animation
{
    /// <summary>
    /// What should be shown, independent of HOW. Two implementations:
    /// ProceduralAnimationDriver (no assets — current default) and AnimatorAnimationDriver (real clips).
    /// Gameplay code only talks to this interface.
    /// </summary>
    public interface IAnimationDriver
    {
        void SetLocomotion(float normalizedSpeed, bool grounded);
        void TriggerAttack(bool heavy);
        void TriggerDodge();
        void TriggerHit(Vector3 impactDirection);
        void SetStunned(bool stunned);
        void TriggerAbility();
        void TriggerDeath();
    }

    /// <summary>Cached Animator parameter ids — never use string literals in hot paths.</summary>
    public static class AnimationParameters
    {
        public static readonly int Speed = Animator.StringToHash("Speed");
        public static readonly int Grounded = Animator.StringToHash("Grounded");
        public static readonly int AttackLight = Animator.StringToHash("AttackLight");
        public static readonly int AttackHeavy = Animator.StringToHash("AttackHeavy");
        public static readonly int Dodge = Animator.StringToHash("Dodge");
        public static readonly int Hit = Animator.StringToHash("Hit");
        public static readonly int HitDirX = Animator.StringToHash("HitDirX");
        public static readonly int HitDirY = Animator.StringToHash("HitDirY");
        public static readonly int Stunned = Animator.StringToHash("Stunned");
        public static readonly int Ability = Animator.StringToHash("Ability");
        public static readonly int Dead = Animator.StringToHash("Dead");
    }
}
