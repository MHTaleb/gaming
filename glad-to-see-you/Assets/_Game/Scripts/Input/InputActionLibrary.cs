using UnityEngine;
using UnityEngine.InputSystem;

namespace GladToSeeYou.Input
{
    /// <summary>
    /// Single source of truth for the control scheme, built in code (no .inputactions GUID asset to corrupt).
    /// The editor bootstrap can *export* an equivalent .inputactions file for inspection — it stays a mirror,
    /// never a second source of truth.
    /// </summary>
    public static class InputActionLibrary
    {
        public const string GameplayMapName = "Gameplay";
        public const string MoveAction = "Move";
        public const string LookAction = "Look";
        public const string LightAction = "LightAttack";
        public const string HeavyAction = "HeavyAttack";
        public const string DodgeAction = "Dodge";
        public const string LockAction = "LockOn";
        public const string InteractAction = "Interact";
        public const string AbilityAction = "Ability";

        public static InputActionAsset CreateDefaultAsset()
        {
            var asset = ScriptableObject.CreateInstance<InputActionAsset>();
            asset.name = "GladToSeeYouControls";

            var map = new InputActionMap(GameplayMapName);

            var move = map.AddAction(MoveAction, InputActionType.Value);
            move.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/w")
                .With("Down", "<Keyboard>/s")
                .With("Left", "<Keyboard>/a")
                .With("Right", "<Keyboard>/d");
            move.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/upArrow")
                .With("Down", "<Keyboard>/downArrow")
                .With("Left", "<Keyboard>/leftArrow")
                .With("Right", "<Keyboard>/rightArrow");
            move.AddBinding("<Gamepad>/leftStick");

            var look = map.AddAction(LookAction, InputActionType.Value);
            look.AddBinding("<Mouse>/delta");
            look.AddBinding("<Gamepad>/rightStick");

            map.AddAction(LightAction, InputActionType.Button)
                .AddBinding("<Mouse>/leftButton");
            map.FindAction(LightAction).AddBinding("<Gamepad>/buttonWest");

            var heavy = map.AddAction(HeavyAction, InputActionType.Button);
            heavy.AddBinding("<Mouse>/rightButton");
            heavy.AddBinding("<Gamepad>/buttonEast");

            var dodge = map.AddAction(DodgeAction, InputActionType.Button);
            dodge.AddBinding("<Keyboard>/space");
            dodge.AddBinding("<Gamepad>/buttonSouth");

            var lockOn = map.AddAction(LockAction, InputActionType.Button);
            lockOn.AddBinding("<Keyboard>/q");
            lockOn.AddBinding("<Mouse>/middleButton");
            lockOn.AddBinding("<Gamepad>/rightStickPress");

            var interact = map.AddAction(InteractAction, InputActionType.Button);
            interact.AddBinding("<Keyboard>/e");
            interact.AddBinding("<Gamepad>/buttonNorth");

            var ability = map.AddAction(AbilityAction, InputActionType.Button);
            ability.AddBinding("<Keyboard>/f");
            ability.AddBinding("<Gamepad>/rightShoulder");

            asset.AddActionMap(map);
            return asset;
        }

        /// <summary>JSON mirror for the editor export tool (Assets/_Game/Settings/Input).</summary>
        public static string ToJson(InputActionAsset asset) => asset != null ? asset.ToJson() : string.Empty;
    }
}
