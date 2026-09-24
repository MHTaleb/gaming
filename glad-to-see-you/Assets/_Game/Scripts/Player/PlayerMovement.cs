using System;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Player
{
    /// <summary>
    /// Camera-relative locomotion on a CharacterController. Owns gravity, rotation, and a small
    /// decaying "external velocity" channel used by dodge bursts and attack lunges.
    /// Ticked by PlayerRoot for deterministic ordering (documented exception to per-system Update).
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class PlayerMovement : MonoBehaviour
    {
        private const float Gravity = -22f;
        private const float ExternalDamping = 26f;
        private const float StepDistance = 1.9f;

        [SerializeField] private CharacterController controller;
        [SerializeField] private float stepHeightTolerance = 0.35f;

        private PlayerStats _stats;
        private Transform _cameraTransform;

        private Vector2 _moveInput;
        private Vector3 _horizontalVelocity;
        private Vector3 _externalVelocity;
        private float _verticalVelocity;
        private float _distanceSinceStep;

        /// <summary>Normalized 0..1 planar speed (for animation blending).</summary>
        public float NormalizedSpeed { get; private set; }

        public Vector3 PlanarVelocity => new Vector3(_horizontalVelocity.x, 0f, _horizontalVelocity.z) + new Vector3(_externalVelocity.x, 0f, _externalVelocity.z);

        public bool IsGrounded => controller != null && controller.isGrounded;

        public event Action<float> Stepped;

        public void Configure(PlayerStats stats, Transform cameraTransform)
        {
            _stats = stats;
            _cameraTransform = cameraTransform;
            if (controller == null) controller = GetComponent<CharacterController>();
        }

        public void SetMoveInput(Vector2 input) => _moveInput = Vector2.ClampMagnitude(input, 1f);

        /// <summary>One-shot velocity impulse (dodge burst, attack lunge). Decays automatically.</summary>
        public void AddImpulse(Vector3 velocity) => _externalVelocity += velocity;

        public void Tick(float dt)
        {
            if (_stats == null || controller == null) return;

            // --- desired horizontal velocity (camera-relative) ---
            Vector3 desired = Vector3.zero;
            if (_moveInput.sqrMagnitude > 0.0004f)
            {
                Vector3 camForward = _cameraTransform != null ? _cameraTransform.forward : Vector3.forward;
                Vector3 camRight = _cameraTransform != null ? _cameraTransform.right : Vector3.right;
                camForward.y = 0f;
                camRight.y = 0f;
                camForward.Normalize();
                camRight.Normalize();

                Vector3 dir = camForward * _moveInput.y + camRight * _moveInput.x;
                dir.Normalize();

                float targetSpeed = Mathf.Lerp(_stats.walkSpeed, _stats.runSpeed, _moveInput.magnitude);
                desired = dir * targetSpeed;
            }

            _horizontalVelocity = Vector3.MoveTowards(_horizontalVelocity, desired, _stats.acceleration * dt);

            // --- external impulse decay ---
            _externalVelocity = Vector3.MoveTowards(_externalVelocity, Vector3.zero, ExternalDamping * dt);

            // --- gravity ---
            if (controller.isGrounded && _verticalVelocity < 0f)
            {
                _verticalVelocity = -2f; // stick to ground
            }
            else
            {
                _verticalVelocity += Gravity * dt;
            }

            Vector3 motion = (_horizontalVelocity + _externalVelocity + Vector3.up * _verticalVelocity) * dt;
            controller.Move(motion);

            // --- facing: rotate toward move direction when we have one ---
            Vector3 facingSource = _horizontalVelocity.sqrMagnitude > 0.05f ? _horizontalVelocity : Vector3.zero;
            if (facingSource.sqrMagnitude > 0.05f)
            {
                var look = Quaternion.LookRotation(facingSource.normalized, Vector3.up);
                transform.rotation = Quaternion.RotateTowards(transform.rotation, look, _stats.rotationSpeedDegPerSec * dt);
            }

            // --- animation + footstep bookkeeping ---
            float planarSpeed = PlanarVelocity.magnitude;
            NormalizedSpeed = _stats.runSpeed <= 0.01f ? 0f : Mathf.Clamp01(planarSpeed / _stats.runSpeed);

            _distanceSinceStep += planarSpeed * dt;
            if (controller.isGrounded && _distanceSinceStep >= StepDistance)
            {
                _distanceSinceStep = 0f;
                Stepped?.Invoke(NormalizedSpeed);
            }
        }

        /// <summary>Called by PlayerRoot when the player dies — stops locomotion immediately.</summary>
        public void Halt()
        {
            _moveInput = Vector2.zero;
            _horizontalVelocity = Vector3.zero;
            _externalVelocity = Vector3.zero;
        }
    }
}
