using GladToSeeYou.Audio;
using GladToSeeYou.Combat;
using GladToSeeYou.Input;
using GladToSeeYou.UI;
using GladToSeeYou.VFX;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace GladToSeeYou.Core
{
    public static partial class VerticalSliceFactory
    {
        /// <summary>
        /// HUD (health/stamina/reticle), damage numbers, combat feedback bridge, mobile controls.
        /// uGUI with legacy Text — deliberately avoids TMP essentials friction for placeholders.
        /// </summary>
        public static void BuildUi(SliceHandles handles, SliceAssets assets, Transform servicesParent,
            InputRouter router, AudioService audio, VFXService vfx)
        {
            // --- event system (Input System module, required for on-screen controls) ---
            if (Object.FindFirstObjectByType<EventSystem>() == null)
            {
                var eventSystemGo = new GameObject("EventSystem");
                eventSystemGo.AddComponent<EventSystem>();
                eventSystemGo.AddComponent<InputSystemUIInputModule>();
            }

            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var sprite = CreateWhiteSprite();

            // --- canvas ---
            var canvasGo = new GameObject("UI_Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;

            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            // --- HUD bars (bottom-left, above the joystick) ---
            var healthBg = CreateUiImage(canvasGo.transform, "HealthBar_BG", new Color(0f, 0f, 0f, 0.6f), sprite);
            SetRect((RectTransform)healthBg.transform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(0f, 0f),
                new Vector2(48f, 132f), new Vector2(420f, 26f));

            var healthFill = CreateUiImage(healthBg.transform, "HealthBar_Fill", new Color(0.78f, 0.22f, 0.2f, 1f), sprite);
            SetRectStretch((RectTransform)healthFill.transform, 3f);
            healthFill.type = Image.Type.Filled;
            healthFill.fillMethod = Image.FillMethod.Horizontal;
            healthFill.fillAmount = 1f;

            var staminaBg = CreateUiImage(canvasGo.transform, "StaminaBar_BG", new Color(0f, 0f, 0f, 0.6f), sprite);
            SetRect((RectTransform)staminaBg.transform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(0f, 0f),
                new Vector2(48f, 96f), new Vector2(300f, 16f));

            var staminaFill = CreateUiImage(staminaBg.transform, "StaminaBar_Fill", new Color(0.95f, 0.78f, 0.3f, 1f), sprite);
            SetRectStretch((RectTransform)staminaFill.transform, 2f);
            staminaFill.type = Image.Type.Filled;
            staminaFill.fillMethod = Image.FillMethod.Horizontal;
            staminaFill.fillAmount = 1f;

            // --- lock-on reticle ---
            var reticle = CreateUiImage(canvasGo.transform, "LockReticle", new Color(1f, 0.85f, 0.6f, 0.95f), sprite);
            var reticleRect = (RectTransform)reticle.transform;
            reticleRect.sizeDelta = new Vector2(18f, 18f);
            reticleRect.localRotation = Quaternion.Euler(0f, 0f, 45f);
            reticle.gameObject.SetActive(false);

            var hud = canvasGo.AddComponent<HUDController>();
            hud.Configure(healthFill, staminaFill, reticleRect, handles.CameraRig != null ? handles.CameraRig.Camera : null);
            handles.Hud = hud;

            // --- damage numbers ---
            var damageNumbersGo = new GameObject("DamageNumbers", typeof(RectTransform));
            damageNumbersGo.transform.SetParent(canvasGo.transform, false);
            var damageNumbers = damageNumbersGo.AddComponent<DamageNumberSpawner>();
            damageNumbers.Configure(font);

            // --- combat feedback (gameplay → presentation bridge) ---
            var feedback = servicesParent.gameObject.AddComponent<CombatFeedback>();
            feedback.Configure(vfx, audio, handles.CameraRig, damageNumbers,
                assets.HitSpark, assets.HeavySpark, assets.DeathBurst,
                assets.HitLight, assets.HitHeavy, assets.DeathSound);

            // --- mobile controls ---
            var controlsGo = new GameObject("MobileControls", typeof(RectTransform));
            controlsGo.transform.SetParent(canvasGo.transform, false);
            var panel = controlsGo.AddComponent<MobileControlsPanel>();

            var container = new GameObject("Container", typeof(RectTransform));
            container.transform.SetParent(controlsGo.transform, false);
            SetRectStretch((RectTransform)container.transform, 0f);

            // Joystick (bottom-left)
            var joystickBg = CreateUiImage(container.transform, "Joystick_BG", new Color(1f, 1f, 1f, 0.14f), sprite);
            var joystickBgRect = (RectTransform)joystickBg.transform;
            SetRect(joystickBgRect, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(0.5f, 0.5f),
                new Vector2(240f, 250f), new Vector2(260f, 260f));

            var joystickHandle = CreateUiImage(joystickBg.transform, "Joystick_Handle", new Color(1f, 1f, 1f, 0.45f), sprite);
            var joystickHandleRect = (RectTransform)joystickHandle.transform;
            joystickHandleRect.sizeDelta = new Vector2(110f, 110f);

            var joystick = joystickBg.gameObject.AddComponent<TouchJoystick>();
            joystick.Configure(router.Virtual, joystickBgRect, joystickHandleRect);

            // Action buttons (bottom-right)
            CreateTouchButton(container.transform, "Btn_Light", "ATK", new Vector2(-360f, 210f), new Vector2(150f, 150f),
                TouchButton.ButtonAction.LightAttack, router.Virtual, sprite, font, new Color(0.85f, 0.35f, 0.3f, 0.75f));
            CreateTouchButton(container.transform, "Btn_Heavy", "HVY", new Vector2(-186f, 210f), new Vector2(150f, 150f),
                TouchButton.ButtonAction.HeavyAttack, router.Virtual, sprite, font, new Color(0.9f, 0.55f, 0.25f, 0.75f));
            CreateTouchButton(container.transform, "Btn_Dodge", "DODGE", new Vector2(-360f, 40f), new Vector2(120f, 120f),
                TouchButton.ButtonAction.Dodge, router.Virtual, sprite, font, new Color(0.35f, 0.6f, 0.85f, 0.75f));
            CreateTouchButton(container.transform, "Btn_Lock", "LOCK", new Vector2(-186f, 40f), new Vector2(120f, 120f),
                TouchButton.ButtonAction.LockOn, router.Virtual, sprite, font, new Color(0.6f, 0.6f, 0.65f, 0.75f));
            CreateTouchButton(container.transform, "Btn_Ability", "SLAM", new Vector2(-95f, 128f), new Vector2(130f, 130f),
                TouchButton.ButtonAction.Ability, router.Virtual, sprite, font, new Color(0.65f, 0.35f, 0.75f, 0.75f));

            panel.Configure(container);
        }

        private static void CreateTouchButton(Transform parent, string name, string label, Vector2 anchoredPosition,
            Vector2 size, TouchButton.ButtonAction action, VirtualInputLayer layer, Sprite sprite, Font font, Color color)
        {
            var button = CreateUiImage(parent, name, color, sprite);
            SetRect((RectTransform)button.transform, Vector2.zero, Vector2.zero, new Vector2(1f, 0f),
                anchoredPosition, size);

            var labelGo = new GameObject("Label", typeof(RectTransform), typeof(Text));
            labelGo.transform.SetParent(button.transform, false);
            var text = labelGo.GetComponent<Text>();
            text.font = font;
            text.text = label;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = new Color(1f, 1f, 1f, 0.9f);
            text.fontSize = 30;
            text.raycastTarget = false;
            SetRectStretch((RectTransform)labelGo.transform, 0f);

            var touchButton = button.gameObject.AddComponent<TouchButton>();
            touchButton.Configure(layer, action);
        }

        // ------------------------------------------------------------------ UI helpers

        private static Image CreateUiImage(Transform parent, string name, Color color, Sprite sprite)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var image = go.GetComponent<Image>();
            image.color = color;
            image.sprite = sprite;
            return image;
        }

        private static void SetRect(RectTransform rect, Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot,
            Vector2 anchoredPosition, Vector2 size)
        {
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.pivot = pivot;
            rect.anchoredPosition = anchoredPosition;
            rect.sizeDelta = size;
        }

        private static void SetRectStretch(RectTransform rect, float padding)
        {
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.offsetMin = new Vector2(padding, padding);
            rect.offsetMax = new Vector2(-padding, -padding);
        }

        private static Sprite CreateWhiteSprite()
        {
            var texture = new Texture2D(4, 4, TextureFormat.RGBA32, false) { name = "T_UI_White" };
            var pixels = new Color32[16];
            for (int i = 0; i < pixels.Length; i++) pixels[i] = new Color32(255, 255, 255, 255);
            texture.SetPixels32(pixels);
            texture.Apply();
            return Sprite.Create(texture, new Rect(0f, 0f, 4f, 4f), new Vector2(0.5f, 0.5f));
        }
    }
}
