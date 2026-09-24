using UnityEngine;

namespace GladToSeeYou.Animation
{
    /// <summary>
    /// Real-animator driver. Wired by the factory once an AnimatorController + clips exist;
    /// until then the procedural driver is used. Parameter names are the contract with the
    /// AnimatorController — see Documentation/ANIMATION_PIPELINE.md.
    /// </summary>
    public class AnimatorAnimationDriver : MonoBehaviour, IAnimationDriver
    {
        [SerializeField] private Animator animator;
        private bool _hasAnimator;

        public void Configure(Animator target)
        {
            animator = target;
            _hasAnimator = animator != null && animator.runtimeAnimatorController != null;
            if (animator != null && !_hasAnimator)
            {
                Debug.LogWarning("[AnimatorAnimationDriver] Animator has no controller assigned; " +
                                 "driver will be inert. Use ProceduralAnimationDriver until clips exist.", this);
            }
        }

        public void SetLocomotion(float normalizedSpeed, bool grounded)
        {
            if (!_hasAnimator) return;
            animator.SetFloat(AnimationParameters.Speed, normalizedSpeed, 0.1f, Time.deltaTime);
            animator.SetBool(AnimationParameters.Grounded, grounded);
        }

        public void TriggerAttack(bool heavy)
        {
            if (!_hasAnimator) return;
            animator.SetTrigger(heavy ? AnimationParameters.AttackHeavy : AnimationParameters.AttackLight);
        }

        public void TriggerDodge()
        {
            if (!_hasAnimator) return;
            animator.SetTrigger(AnimationParameters.Dodge);
        }

        public void TriggerHit(Vector3 impactDirection)
        {
            if (!_hasAnimator) return;
            Vector3 local = transform.InverseTransformDirection(impactDirection.normalized);
            animator.SetFloat(AnimationParameters.HitDirX, local.x);
            animator.SetFloat(AnimationParameters.HitDirY, local.z);
            animator.SetTrigger(AnimationParameters.Hit);
        }

        public void SetStunned(bool stunned)
        {
            if (!_hasAnimator) return;
            animator.SetBool(AnimationParameters.Stunned, stunned);
        }

        public void TriggerAbility()
        {
            if (!_hasAnimator) return;
            animator.SetTrigger(AnimationParameters.Ability);
        }

        public void TriggerDeath()
        {
            if (!_hasAnimator) return;
            animator.SetTrigger(AnimationParameters.Dead);
        }
    }
}
