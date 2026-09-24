using UnityEngine;

namespace GladToSeeYou.Input
{
    /// <summary>
    /// Merges desktop actions (PlayerInputReader) + touch controls (VirtualInputLayer) into one
    /// per-frame <see cref="InputCommands"/>. Gameplay asks only this service.
    /// </summary>
    public class InputRouter : MonoBehaviour
    {
        private PlayerInputReader _reader;
        private VirtualInputLayer _virtualLayer;
        private InputCommands _commands;
        private float _sensitivity = 1f;
        private bool _invertY;

        public VirtualInputLayer Virtual => _virtualLayer;
        public InputCommands Commands => _commands;
        public bool TouchInUse => _virtualLayer != null && _virtualLayer.TouchInUse;

        public void Configure(PlayerInputReader reader, bool invertY, float sensitivity)
        {
            _reader = reader;
            _virtualLayer = new VirtualInputLayer();
            _invertY = invertY;
            _sensitivity = sensitivity;
        }

        public void SetLookSettings(float sensitivity, bool invertY)
        {
            _sensitivity = sensitivity;
            _invertY = invertY;
        }

        private int _lastRefreshFrame = -1;

        /// <summary>
        /// Samples actions once per frame (idempotent). PlayerRoot calls this explicitly so edge
        /// flags can't be missed regardless of script execution order.
        /// </summary>
        public void Refresh()
        {
            if (_lastRefreshFrame == Time.frameCount) return;
            _lastRefreshFrame = Time.frameCount;

            _commands = _reader != null ? _reader.Read() : InputCommands.Empty;

            if (_virtualLayer != null)
            {
                _virtualLayer.ConsumeInto(ref _commands);
            }

            // Look scaling: mouse delta is per-frame pixels (scale down), sticks are per-second-ish.
            var look = _commands.Look;
            bool likelyPointerDelta = look.sqrMagnitude > 4f; // heuristic: pixel-class magnitudes
            look *= likelyPointerDelta ? 0.05f : 1f;
            look *= _sensitivity * (_invertY ? new Vector2(1f, -1f) : Vector2.one);
            _commands.Look = look;
        }

        private void Update() => Refresh();
    }
}
