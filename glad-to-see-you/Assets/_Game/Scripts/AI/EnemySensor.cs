using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.AI
{
    /// <summary>
    /// Enemy perception: distance + line-of-sight with hysteresis (acquire vs lose radius).
    /// One raycast per refresh, non-alloc.
    /// </summary>
    public class EnemySensor : MonoBehaviour
    {
        [SerializeField] private float eyeHeight = 1.0f;

        private EnemyData _data;
        private bool _wasSeeing;

        public Transform PlayerTransform { get; private set; }
        public float DistanceToPlayer { get; private set; } = float.MaxValue;
        public bool CanSeePlayer { get; private set; }

        private int _blockerMask;

        public void Configure(EnemyData data, Transform player)
        {
            _data = data;
            PlayerTransform = player;
            _blockerMask = PhysicsLayers.GroundMask;
        }

        public void Refresh()
        {
            if (_data == null || PlayerTransform == null)
            {
                CanSeePlayer = false;
                return;
            }

            Vector3 toPlayer = PlayerTransform.position - transform.position;
            toPlayer.y = 0f;
            DistanceToPlayer = toPlayer.magnitude;

            float acquireRadius = _wasSeeing ? _data.loseTargetRadius : _data.detectionRadius;
            if (DistanceToPlayer > acquireRadius)
            {
                CanSeePlayer = false;
                _wasSeeing = false;
                return;
            }

            Vector3 origin = transform.position + Vector3.up * eyeHeight;
            Vector3 target = PlayerTransform.position + Vector3.up * 0.9f;
            Vector3 dir = target - origin;
            float dist = dir.magnitude;

            bool blocked = Physics.Raycast(origin, dir.normalized, dist, _blockerMask, QueryTriggerInteraction.Ignore);
            CanSeePlayer = !blocked;
            _wasSeeing = CanSeePlayer;
        }
    }
}
