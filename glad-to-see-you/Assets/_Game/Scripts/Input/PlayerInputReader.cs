using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace GladToSeeYou.Input
{
    /// <summary>
    /// Reads the code-built action maps and produces <see cref="InputCommands"/>.
    /// Device-agnostic: keyboard/mouse/gamepad all come through here; touch arrives via VirtualInputLayer.
    /// </summary>
    public class PlayerInputReader : MonoBehaviour
    {
        private InputActionAsset _asset;
        private InputActionMap _map;
        private InputAction _move;
        private InputAction _look;
        private InputAction _light;
        private InputAction _heavy;
        private InputAction _dodge;
        private InputAction _lock;
        private InputAction _interact;
        private InputAction _ability;

        public bool IsReady => _map != null;

        public void Configure(InputActionAsset asset)
        {
            _asset = asset;
            _map = asset.FindActionMap(InputActionLibrary.GameplayMapName, throwIfNotFound: true);
            _move = _map.FindAction(InputActionLibrary.MoveAction, true);
            _look = _map.FindAction(InputActionLibrary.LookAction, true);
            _light = _map.FindAction(InputActionLibrary.LightAction, true);
            _heavy = _map.FindAction(InputActionLibrary.HeavyAction, true);
            _dodge = _map.FindAction(InputActionLibrary.DodgeAction, true);
            _lock = _map.FindAction(InputActionLibrary.LockAction, true);
            _interact = _map.FindAction(InputActionLibrary.InteractAction, true);
            _ability = _map.FindAction(InputActionLibrary.AbilityAction, true);
            _map.Enable();
        }

        /// <summary>Called exactly once per frame by InputRouter.Update.</summary>
        public InputCommands Read()
        {
            if (!IsReady) return InputCommands.Empty;

            return new InputCommands
            {
                Move = _move.ReadValue<Vector2>(),
                Look = _look.ReadValue<Vector2>(),
                LightAttackPressed = _light.WasPressedThisFrame(),
                HeavyAttackPressed = _heavy.WasPressedThisFrame(),
                DodgePressed = _dodge.WasPressedThisFrame(),
                LockOnPressed = _lock.WasPressedThisFrame(),
                InteractPressed = _interact.WasPressedThisFrame(),
                AbilityPressed = _ability.WasPressedThisFrame()
            };
        }

        public InputActionAsset Asset => _asset;

        private void OnDisable() => _map?.Disable();
        private void OnDestroy() => _map?.Disable();
    }
}
