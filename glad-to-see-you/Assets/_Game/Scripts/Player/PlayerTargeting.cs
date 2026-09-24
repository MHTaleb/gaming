using GladToSeeYou.Combat;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Player
{
    /// <summary>
    /// Lock-on target management: acquire best candidate in front of the camera, break on range/death.
    /// Reads the Targetable registry (no scene scans). The camera rig consumes TargetTransform.
    /// </summary>
    public class PlayerTargeting : MonoBehaviour
    {
        private PlayerStats _stats;
        private Transform _cameraTransform;

        private Targetable _target;
        private Health _targetHealth;

        public bool HasTarget => _target != null && _target.gameObject.activeInHierarchy;
        public Transform TargetTransform => HasTarget ? _target.transform : null;
        public Vector3 AimPosition => HasTarget ? _target.AimPosition : transform.position + Vector3.up * 1.2f;

        public void Configure(PlayerStats stats, Transform cameraTransform)
        {
            _stats = stats;
            _cameraTransform = cameraTransform;
        }

        public void Toggle()
        {
            if (HasTarget) ClearTarget();
            else AcquireTarget();
        }

        public void Tick(float dt)
        {
            if (!HasTarget) return;

            float distance = Vector3.Distance(transform.position, _target.transform.position);
            if (distance > _stats.lockBreakRange || (_targetHealth != null && !_targetHealth.IsAlive))
            {
                ClearTarget();
            }
        }

        public void ClearTarget()
        {
            if (_target == null) return;
            _target = null;
            _targetHealth = null;
            EventBus.RaiseTargetUnlocked();
        }

        private void AcquireTarget()
        {
            if (_stats == null) return;

            Vector3 origin = transform.position;
            Vector3 camForward = _cameraTransform != null ? _cameraTransform.forward : transform.forward;
            camForward.y = 0f;
            camForward.Normalize();

            Targetable best = null;
            Health bestHealth = null;
            float bestScore = float.MinValue;

            var candidates = Targetable.All;
            for (int i = candidates.Count - 1; i >= 0; i--)
            {
                var candidate = candidates[i];
                if (candidate == null) { candidates.RemoveAt(i); continue; }
                if (!candidate.gameObject.activeInHierarchy || candidate.Team != Team.Enemy) continue;

                candidate.TryGetComponent<Health>(out var candidateHealth);
                if (candidateHealth != null && !candidateHealth.IsAlive) continue;

                Vector3 toTarget = candidate.transform.position - origin;
                toTarget.y = 0f;
                float distance = toTarget.magnitude;
                if (distance > _stats.lockOnRange || distance < 0.01f) continue;

                float facing = Vector3.Dot(camForward, toTarget / distance);
                if (facing < -0.1f) continue; // behind the camera

                float score = facing * 3f - distance * 0.5f;
                if (score > bestScore)
                {
                    bestScore = score;
                    best = candidate;
                    bestHealth = candidateHealth;
                }
            }

            if (best == null) return;

            _target = best;
            _targetHealth = bestHealth;
            EventBus.RaiseTargetLocked(best.gameObject);
        }

        private void OnDisable() => ClearTarget();
    }
}
