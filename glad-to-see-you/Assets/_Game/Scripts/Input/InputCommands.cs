using UnityEngine;

namespace GladToSeeYou.Input
{
    /// <summary>
    /// The only input representation gameplay ever sees. Produced by InputRouter from
    /// desktop actions + the virtual (touch) layer. Edge flags are true for exactly one frame.
    /// </summary>
    public struct InputCommands
    {
        /// <summary>Camera-relative move intent, magnitude 0..1.</summary>
        public Vector2 Move;

        /// <summary>Look delta for this frame (accumulated, already scaled by sensitivity).</summary>
        public Vector2 Look;

        public bool LightAttackPressed;
        public bool HeavyAttackPressed;
        public bool DodgePressed;
        public bool LockOnPressed;
        public bool InteractPressed;
        public bool AbilityPressed;

        public static InputCommands Empty => default;
    }
}
