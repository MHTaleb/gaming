using System.Collections.Generic;
using GladToSeeYou.Core;
using UnityEngine;

namespace GladToSeeYou.Combat
{
    /// <summary>
    /// Marks an object as lock-on-able and provides the aim point (chest height by default).
    /// Self-registers so targeting can scan without FindObjectsOfType allocations.
    /// </summary>
    public class Targetable : MonoBehaviour
    {
        /// <summary>Live targets in the scene (maintained here; read-only for consumers).</summary>
        public static readonly List<Targetable> All = new List<Targetable>();

        [SerializeField] private Team team = Team.Enemy;
        [Tooltip("World-space offset from the root to the aim point (chest height).")]
        [SerializeField] private float aimHeight = 1.1f;

        public Team Team => team;

        public Vector3 AimPosition => transform.position + Vector3.up * aimHeight;

        public void Configure(Team ownerTeam, float height)
        {
            team = ownerTeam;
            aimHeight = height;
        }

        private void OnEnable()
        {
            if (!All.Contains(this)) All.Add(this);
        }

        private void OnDisable()
        {
            All.Remove(this);
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetRegistry() => All.Clear();
    }
}
