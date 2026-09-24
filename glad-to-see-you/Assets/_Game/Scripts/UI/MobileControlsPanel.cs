using UnityEngine;
using UnityEngine.InputSystem;

namespace GladToSeeYou.UI
{
    /// <summary>
    /// Root of the on-screen controls. Visible automatically on touch devices, toggleable everywhere
    /// (F5 in editor via PerformanceOverlay). Wiring of joystick/buttons happens in Configure.
    /// </summary>
    public class MobileControlsPanel : MonoBehaviour
    {
        [SerializeField] private GameObject container;

        public bool IsVisible => container != null && container.activeSelf;

        public void Configure(GameObject containerRoot) => container = containerRoot;

        private void Start()
        {
            bool hasTouch = Touchscreen.current != null || Application.isMobilePlatform;
            if (container != null) container.SetActive(hasTouch);
        }

        public void Toggle()
        {
            if (container != null) container.SetActive(!container.activeSelf);
        }

        public void SetVisible(bool visible)
        {
            if (container != null) container.SetActive(visible);
        }
    }
}
