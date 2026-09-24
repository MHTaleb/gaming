using System.Collections.Generic;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Combat
{
    /// <summary>
    /// Executes a single attack "sweep": one non-alloc overlap query, dedupe, apply damage.
    /// Used by both PlayerCombat and EnemyCombat with an <see cref="AttackStep"/> from data.
    /// No per-frame triggers, no allocation in the hot path.
    /// </summary>
    public class WeaponHitbox : MonoBehaviour
    {
        private const int BufferSize = 16;
        private readonly Collider[] _buffer = new Collider[BufferSize];
        private readonly HashSet<int> _hitThisSwing = new HashSet<int>();

        /// <summary>
        /// Performs the hit query and applies damage. Returns number of targets hit.
        /// </summary>
        public int Strike(AttackStep step, Vector3 origin, Vector3 forward, float height, int targetMask,
            Team sourceTeam, GameObject source, float damageMultiplier = 1f)
        {
            if (step == null) return 0;

            Vector3 center = origin + forward * step.hitboxForwardOffset + Vector3.up * (height * 0.5f);
            int count = Physics.OverlapSphereNonAlloc(center, step.hitboxRadius, _buffer, targetMask, QueryTriggerInteraction.Ignore);

            _hitThisSwing.Clear();
            int hits = 0;
            for (int i = 0; i < count; i++)
            {
                var col = _buffer[i];
                if (col == null) continue;
                int id = col.gameObject.GetInstanceID();
                if (!_hitThisSwing.Add(id)) continue;

                if (!col.TryGetComponent<IDamageable>(out var damageable)) continue;
                if (!damageable.IsAlive || damageable.Team == sourceTeam) continue;

                Vector3 point = col.ClosestPoint(center);
                Vector3 direction = (col.transform.position - origin);
                direction.y = 0f;
                if (direction.sqrMagnitude < 0.0001f) direction = forward;
                direction.Normalize();

                var info = DamageInfo.Simple(
                    step.damage * Mathf.Max(0.1f, damageMultiplier),
                    step.poiseDamage,
                    source,
                    sourceTeam,
                    point,
                    direction,
                    step.damage >= 25f);

                if (damageable.ApplyDamage(info) == DamageResult.Applied)
                {
                    hits++;
                    EventBus.RaiseHitStop(step.hitStopSeconds);
                    EventBus.RaiseCameraImpulse(step.cameraImpulse, point);
                }
            }

            return hits;
        }
    }
}
