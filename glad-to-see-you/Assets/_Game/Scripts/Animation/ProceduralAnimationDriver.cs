using UnityEngine;

namespace GladToSeeYou.Animation
{
    /// <summary>
    /// Asset-free placeholder animation: squash/stretch locomotion, swing arcs on a weapon pivot,
    /// dodge roll, directional flinch, stun wobble, death fall. Deliberately cartoony-but-readable —
    /// it exists so combat feel is testable before real clips exist.
    /// Swapped out by wiring AnimatorAnimationDriver instead (see Documentation/ANIMATION_PIPELINE.md).
    /// </summary>
    public class ProceduralAnimationDriver : MonoBehaviour, IAnimationDriver
    {
        [SerializeField] private Transform visualRoot;   // child holding the visual mesh(es)
        [SerializeField] private Transform weaponPivot;  // optional child that holds the weapon

        private float _speed;
        private bool _grounded = true;
        private float _bobPhase;

        private float _swingT = -1f;
        private float _swingHeavy;
        private float _dodgeT = -1f;
        private float _flinch;
        private Vector3 _flinchDir;
        private bool _stunned;
        private bool _dead;
        private float _deathT;

        private Quaternion _visualBaseRotation;
        private Vector3 _visualBasePosition;

        public void Configure(Transform visual, Transform weapon)
        {
            visualRoot = visual;
            weaponPivot = weapon;
            if (visualRoot != null)
            {
                _visualBaseRotation = visualRoot.localRotation;
                _visualBasePosition = visualRoot.localPosition;
            }
        }

        public void SetLocomotion(float normalizedSpeed, bool grounded)
        {
            _speed = normalizedSpeed;
            _grounded = grounded;
        }

        public void TriggerAttack(bool heavy)
        {
            _swingT = 0f;
            _swingHeavy = heavy ? 1f : 0f;
        }

        public void TriggerDodge() => _dodgeT = 0f;

        public void TriggerHit(Vector3 impactDirection)
        {
            _flinch = 1f;
            _flinchDir = transform.InverseTransformDirection(impactDirection.normalized);
        }

        public void SetStunned(bool stunned) => _stunned = stunned;

        public void TriggerAbility() => _swingT = 0f;

        public void TriggerDeath()
        {
            _dead = true;
            _deathT = 0f;
        }

        private void Update() => Tick(Time.deltaTime);

        public void Tick(float dt)
        {
            if (visualRoot == null) return;

            if (_dead)
            {
                _deathT += dt;
                float t = Mathf.Clamp01(_deathT / 0.6f);
                visualRoot.localRotation = _visualBaseRotation * Quaternion.Euler(Mathf.Lerp(0f, 88f, t), 0f, 0f);
                visualRoot.localPosition = Vector3.Lerp(_visualBasePosition, _visualBasePosition + Vector3.down * 0.15f, t);
                return;
            }

            // Locomotion: bob + lean + stretch
            _bobPhase += dt * Mathf.Lerp(4f, 11f, _speed);
            float bob = _grounded ? Mathf.Abs(Mathf.Sin(_bobPhase)) * 0.06f * _speed : 0f;
            float lean = _speed * 9f;
            float stretch = 1f + Mathf.Sin(_bobPhase) * 0.04f * _speed;

            visualRoot.localPosition = _visualBasePosition + Vector3.up * bob;
            visualRoot.localScale = new Vector3(1f / stretch, stretch, 1f / stretch);

            // Dodge roll
            float roll = 0f;
            if (_dodgeT >= 0f)
            {
                _dodgeT += dt / 0.42f;
                roll = Mathf.Clamp01(_dodgeT) * 360f;
                if (_dodgeT >= 1f) _dodgeT = -1f;
            }

            // Flinch
            float flinchPitch = 0f;
            float flinchRoll = 0f;
            if (_flinch > 0f)
            {
                _flinch = Mathf.Max(0f, _flinch - dt * 4f);
                float amount = Mathf.Sin(_flinch * Mathf.PI) * 14f;
                flinchPitch = -amount * Mathf.Clamp(_flinchDir.z, -1f, 1f);
                flinchRoll = amount * Mathf.Clamp(_flinchDir.x, -1f, 1f);
            }

            // Stun wobble
            float wobble = _stunned ? Mathf.Sin(Time.time * 18f) * 5f : 0f;

            visualRoot.localRotation = _visualBaseRotation * Quaternion.Euler(lean + flinchPitch, 0f, flinchRoll + wobble + roll);

            // Weapon swing arc
            if (weaponPivot != null)
            {
                if (_swingT >= 0f)
                {
                    _swingT += dt / (_swingHeavy > 0.5f ? 0.55f : 0.32f);
                    float t = Mathf.Clamp01(_swingT);
                    // windup back (0-0.3), slash through (0.3-0.55), return (0.55-1)
                    float angle;
                    if (t < 0.3f) angle = Mathf.Lerp(0f, -65f, t / 0.3f);
                    else if (t < 0.55f) angle = Mathf.Lerp(-65f, 75f, (t - 0.3f) / 0.25f * Mathf.Lerp(1.4f, 0.8f, _swingHeavy));
                    else angle = Mathf.Lerp(75f, 0f, (t - 0.55f) / 0.45f);
                    weaponPivot.localRotation = Quaternion.Euler(angle, 0f, 0f);
                    if (_swingT >= 1f)
                    {
                        _swingT = -1f;
                        weaponPivot.localRotation = Quaternion.identity;
                    }
                }
            }
        }
    }
}
