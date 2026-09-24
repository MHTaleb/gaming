using UnityEngine;

namespace GladToSeeYou.Input
{
    /// <summary>
    /// State written by the on-screen controls (joystick, buttons) and merged by InputRouter.
    /// Edge flags are queued on press events and cleared once they have been consumed.
    /// </summary>
    public class VirtualInputLayer
    {
        public Vector2 Move { get; set; }
        public Vector2 LookDelta { get; set; }

        private bool _light;
        private bool _heavy;
        private bool _dodge;
        private bool _lock;
        private bool _interact;
        private bool _ability;

        public bool TouchInUse { get; private set; }

        public void MarkTouchInUse() => TouchInUse = true;

        public void PressLight() => _light = true;
        public void PressHeavy() => _heavy = true;
        public void PressDodge() => _dodge = true;
        public void PressLock() => _lock = true;
        public void PressInteract() => _interact = true;
        public void PressAbility() => _ability = true;

        public void ConsumeInto(ref InputCommands commands)
        {
            if (_light) { commands.LightAttackPressed = true; _light = false; }
            if (_heavy) { commands.HeavyAttackPressed = true; _heavy = false; }
            if (_dodge) { commands.DodgePressed = true; _dodge = false; }
            if (_lock) { commands.LockOnPressed = true; _lock = false; }
            if (_interact) { commands.InteractPressed = true; _interact = false; }
            if (_ability) { commands.AbilityPressed = true; _ability = false; }

            if (Move.sqrMagnitude > 0.0001f)
            {
                commands.Move = Vector2.ClampMagnitude(commands.Move + Move, 1f);
            }

            if (LookDelta.sqrMagnitude > 0.0001f)
            {
                commands.Look += LookDelta;
                LookDelta = Vector2.zero;
            }
        }

        public void Reset()
        {
            Move = Vector2.zero;
            LookDelta = Vector2.zero;
            _light = _heavy = _dodge = _lock = _interact = _ability = false;
        }
    }
}
