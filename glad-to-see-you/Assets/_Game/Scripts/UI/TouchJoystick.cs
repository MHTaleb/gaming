using GladToSeeYou.Input;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace GladToSeeYou.UI
{
    /// <summary>
    /// On-screen virtual stick (bottom-left). Writes into VirtualInputLayer — the same channel
    /// gamepad/mouse use, so gameplay code never learns touch exists.
    /// Multi-touch safe: one pointer owns the stick (buttons are separate objects).
    /// </summary>
    public class TouchJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        [SerializeField] private RectTransform background;
        [SerializeField] private RectTransform handle;

        private VirtualInputLayer _layer;
        private int _activePointerId = -1;
        private float _radius;

        public void Configure(VirtualInputLayer layer, RectTransform backgroundRect, RectTransform handleRect)
        {
            _layer = layer;
            background = backgroundRect;
            handle = handleRect;
            _radius = background.rect.width * 0.5f;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (_layer == null || _activePointerId != -1) return;
            _activePointerId = eventData.pointerId;
            _layer.MarkTouchInUse();
            UpdateFromPointer(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId != _activePointerId) return;
            UpdateFromPointer(eventData);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId != _activePointerId) return;
            _activePointerId = -1;
            if (_layer != null) _layer.Move = Vector2.zero;
            if (handle != null) handle.anchoredPosition = Vector2.zero;
        }

        private void UpdateFromPointer(PointerEventData eventData)
        {
            if (background == null || handle == null || _layer == null) return;
            if (_radius <= 0.01f) _radius = background.rect.width * 0.5f;

            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(background, eventData.position, eventData.pressEventCamera, out var local))
            {
                return;
            }

            Vector2 clamped = Vector2.ClampMagnitude(local, _radius);
            handle.anchoredPosition = clamped;
            _layer.Move = clamped / _radius;
        }
    }
}
