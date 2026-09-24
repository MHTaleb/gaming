using GladToSeeYou.Data;
using UnityEngine;
using UnityEngine.AI;

namespace GladToSeeYou.AI
{
    /// <summary>
    /// Movement for the enemy: NavMeshAgent when a baked surface exists, otherwise simple
    /// direct steering (flat arena fallback — keeps tests and un-baked scenes functional).
    /// Facing is always manual so telegraphs/attacks can be aimed even while the agent is stopped.
    /// </summary>
    public class EnemyLocomotion : MonoBehaviour
    {
        [SerializeField] private NavMeshAgent agent;

        private EnemyData _data;
        private Vector3 _fallbackTarget;
        private float _fallbackSpeed;
        private bool _useFallback;

        public void Configure(NavMeshAgent navAgent, EnemyData data)
        {
            agent = navAgent;
            _data = data;
            if (agent != null)
            {
                agent.updateRotation = false;
                agent.stoppingDistance = data != null ? data.preferredRange * 0.8f : 0.5f;
            }
        }

        public void MoveTo(Vector3 destination, float speed)
        {
            if (agent != null && agent.enabled && agent.isOnNavMesh)
            {
                _useFallback = false;
                agent.isStopped = false;
                agent.speed = speed;
                agent.SetDestination(destination);
                return;
            }

            _fallbackTarget = destination;
            _fallbackSpeed = speed;
            _useFallback = true;
        }

        public void Stop()
        {
            _useFallback = false;
            if (agent != null && agent.enabled && agent.isOnNavMesh)
            {
                agent.isStopped = true;
                agent.ResetPath();
            }
        }

        public bool AtDestination(float tolerance)
        {
            if (agent != null && agent.enabled && agent.isOnNavMesh && !_useFallback)
            {
                return !agent.pathPending && agent.remainingDistance <= tolerance + agent.stoppingDistance;
            }

            return Vector3.Distance(transform.position, _fallbackTarget) <= tolerance;
        }

        public void FaceDirection(Vector3 direction, float turnSpeedDegPerSec, float dt)
        {
            direction.y = 0f;
            if (direction.sqrMagnitude < 0.0004f) return;

            var look = Quaternion.LookRotation(direction.normalized, Vector3.up);
            transform.rotation = Quaternion.RotateTowards(transform.rotation, look, turnSpeedDegPerSec * dt);
        }

        private void Update()
        {
            if (!_useFallback || _fallbackSpeed <= 0f) return;

            transform.position = Vector3.MoveTowards(transform.position, _fallbackTarget, _fallbackSpeed * Time.deltaTime);
            if (Vector3.Distance(transform.position, _fallbackTarget) <= 0.1f)
            {
                _useFallback = false;
            }
        }
    }
}
