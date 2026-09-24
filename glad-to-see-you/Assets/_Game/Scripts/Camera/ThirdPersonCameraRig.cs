using GladToSeeYou.Core;
using GladToSeeYou.Input;
using UnityEngine;

namespace GladToSeeYou.CameraRig
{
    /// <summary>
    /// Third-person camera: smooth orbit, touch/mouse look, sphere-cast collision, lock-on framing,
    /// impulse (shake) offsets. Custom-built (Cinemachine 3 evaluated and deferred — see ARCHITECTURE.md).
    /// Reads look input from InputRouter; lock target arrives via EventBus (no player coupling).
    /// </summary>
    public class ThirdPersonCameraRig : MonoBehaviour
    {
        [Header("Framing")]
        [SerializeField] private float distance = 4.2f;
        [SerializeField] private float height = 1.55f;
        [SerializeField] private float minPitch = -30f;
        [SerializeField] private float maxPitch = 62f;

        [Header("Response")]
        [SerializeField] private float rotationSpeedDegPerUnit = 210f;
        [SerializeField] private float followSmoothing = 12f;
        [SerializeField] private float lockOnBlend = 6f;

        [Header("Collision")]
        [SerializeField] private float collisionRadius = 0.28f;
        [SerializeField] private float collisionPadding = 0.15f;

        private UnityEngine.Camera _camera;
        private Transform _follow;
        private Transform _lockTarget;

        private float _yaw;
        private float _pitch = 14f;
        private float _impulse;
        private Vector3 _impulseOffset;
        private int _collisionMask;

        public UnityEngine.Camera Camera => _camera;

        public void Configure(UnityEngine.Camera cam, Transform follow)
        {
            _camera = cam;
            _follow = follow;
            _yaw = follow != null ? follow.eulerAngles.y : 0f;
            _collisionMask = PhysicsLayers.GroundMask | PhysicsLayers.EnemyMask;
        }

        private void OnEnable() => EventBus.CameraImpulseRequested += OnImpulseRequested;

        private void OnDisable() => EventBus.CameraImpulseRequested -= OnImpulseRequested;

        private void Start()
        {
            EventBus.TargetLocked += OnTargetLocked;
            EventBus.TargetUnlocked += OnTargetUnlocked;
        }

        private void OnDestroy()
        {
            EventBus.TargetLocked -= OnTargetLocked;
            EventBus.TargetUnlocked -= OnTargetUnlocked;
        }

        private void OnTargetLocked(GameObject target) => _lockTarget = target != null ? target.transform : null;

        private void OnTargetUnlocked() => _lockTarget = null;

        /// <summary>Adds an impulse (meters) with distance falloff — far hits shouldn't rattle like close ones.</summary>
        public void AddImpulse(float magnitude, Vector3 worldPosition)
        {
            if (_camera == null) return;
            float distanceToHit = Vector3.Distance(_camera.transform.position, worldPosition);
            float falloff = Mathf.Clamp01(1f - distanceToHit / 14f);
            _impulse = Mathf.Min(0.35f, _impulse + magnitude * falloff);
        }

        private void OnImpulseRequested(float magnitude, Vector3 worldPosition) => AddImpulse(magnitude, worldPosition);

        private void LateUpdate()
        {
            if (_camera == null || _follow == null) return;

            float dt = Time.deltaTime;

            // --- look input ---
            var look = InputCommands.Empty.Look;
            if (GameRoot.TryGet(out var root) && root.Input != null)
            {
                look = root.Input.Commands.Look;
            }

            _yaw += look.x * rotationSpeedDegPerUnit;
            _pitch = Mathf.Clamp(_pitch - look.y * rotationSpeedDegPerUnit * 0.8f, minPitch, maxPitch);

            // --- lock-on framing ---
            if (_lockTarget != null)
            {
                Vector3 pivot = _follow.position + Vector3.up * height;
                Vector3 toTarget = (_lockTarget.position + Vector3.up * 1.0f) - pivot;
                if (toTarget.sqrMagnitude > 0.01f)
                {
                    float desiredYaw = Mathf.Atan2(toTarget.x, toTarget.z) * Mathf.Rad2Deg;
                    float desiredPitch = -Mathf.Asin(Mathf.Clamp(toTarget.normalized.y, -1f, 1f)) * Mathf.Rad2Deg;
                    _yaw = Mathf.LerpAngle(_yaw, desiredYaw, lockOnBlend * dt);
                    _pitch = Mathf.Lerp(_pitch, Mathf.Clamp(desiredPitch, minPitch, maxPitch), lockOnBlend * dt);
                }
            }

            // --- impulse decay (unscaled: shake must animate during hit-stop) ---
            _impulse = Mathf.MoveTowards(_impulse, 0f, Time.unscaledDeltaTime * 0.9f);
            _impulseOffset = Random.insideUnitSphere * _impulse;

            // --- position solve ---
            Vector3 targetPosition = _follow.position + Vector3.up * height;
            Quaternion rotation = Quaternion.Euler(_pitch, _yaw, 0f);
            Vector3 desired = targetPosition - rotation * Vector3.forward * distance;

            // Collision: pull the camera in front of blockers.
            Vector3 ray = desired - targetPosition;
            float rayLength = ray.magnitude;
            if (rayLength > 0.01f &&
                Physics.SphereCast(targetPosition, collisionRadius, ray / rayLength, out var hit, rayLength,
                    _collisionMask, QueryTriggerInteraction.Ignore))
            {
                desired = targetPosition + ray.normalized * Mathf.Max(0.4f, hit.distance - collisionPadding);
            }

            Vector3 smoothPosition = Vector3.Lerp(_camera.transform.position, desired + _impulseOffset, followSmoothing * dt);
            Quaternion smoothRotation = Quaternion.Slerp(_camera.transform.rotation,
                Quaternion.LookRotation(targetPosition - smoothPosition, Vector3.up), followSmoothing * dt);

            _camera.transform.SetPositionAndRotation(smoothPosition, smoothRotation);
        }
    }
}
