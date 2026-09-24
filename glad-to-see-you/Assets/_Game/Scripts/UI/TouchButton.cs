using GladToSeeYou.Input;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GladToSeeYou.UI
{
    /// <summary>
    /// On-screen action button. Routes press → VirtualInputLayer (edge), with a pressed visual.
    /// </summary>
    public class TouchButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        public enum ButtonAction
        {
            LightAttack,
            HeavyAttack,
            Dodge,
            LockOn,
            Ability,
            Interact
        }

        [SerializeField] private ButtonAction action = ButtonAction.LightAttack;
        [SerializeField] private Image targetImage;

        private VirtualInputLayer _layer;
        private Color _baseColor = Color.white;

        public void Configure(VirtualInputLayer layer, ButtonAction buttonAction)
        {
            _layer = layer;
            action = buttonAction;
            if (targetImage == null) targetImage = GetComponent<Image>();
            if (targetImage != null) _baseColor = targetImage.color;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (_layer == null) return;
            _layer.MarkTouchInUse();

            switch (action)
            {
                case ButtonAction.LightAttack: _layer.PressLight(); break;
                case ButtonAction.HeavyAttack: _layer.PressHeavy(); break;
                case ButtonAction.Dodge: _layer.PressDodge(); break;
                case ButtonAction.LockOn: _layer.PressLock(); break;
                case ButtonAction.Ability: _layer.PressAbility(); break;
                case ButtonAction.Interact: _layer.PressInteract(); break;
            }

            if (targetImage != null) targetImage.color = _baseColor * 0.7f;
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (targetImage != null) targetImage.color = _baseColor;
        }
    }
}
