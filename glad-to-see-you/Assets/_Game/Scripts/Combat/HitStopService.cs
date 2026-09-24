using GladToSeeYou.Core;
using UnityEngine;

namespace GladToSeeYou.Combat
{
    /// <summary>
    /// Short freeze-frame on impactful hits. Single owner of Time.timeScale — nothing else in the
    /// project should write it. Camera/UI that must animate during hit-stop use unscaled time.
    /// </summary>
    public class HitStopService : MonoBehaviour
    {
        private float _remaining;
        private bool _frozen;

        private void OnEnable() => EventBus.HitStopRequested += Request;
        private void OnDisable()
        {
            EventBus.HitStopRequested -= Request;
            Restore();
        }

        /// <summary>Additive-safe: overlapping requests take the longest.</summary>
        public void Request(float seconds)
        {
            if (seconds <= 0f) return;
            _remaining = Mathf.Max(_remaining, seconds);
        }

        private void Update()
        {
            if (_remaining <= 0f)
            {
                Restore();
                return;
            }

            _remaining -= Time.unscaledDeltaTime;
            if (!_frozen)
            {
                Time.timeScale = 0f;
                _frozen = true;
            }
        }

        private void Restore()
        {
            if (!_frozen) return;
            Time.timeScale = 1f;
            _frozen = false;
        }
    }
}
