using UnityEngine;
using UnityEngine.UI;

namespace GladToSeeYou.UI
{
    /// <summary>
    /// One floating damage number. Pooled + reused — created by <see cref="DamageNumberSpawner"/>.
    /// Uses legacy uGUI Text deliberately (no TMP essentials import needed for placeholders).
    /// </summary>
    public class DamageNumber : MonoBehaviour
    {
        [SerializeField] private Text label;
        [SerializeField] private CanvasGroup group;

        private Vector3 _worldPosition;
        private float _age;
        private float _lifetime;
        private float _riseSpeed;
        private Color _color = Color.white;
        private Camera _camera;

        public void Configure(Text textLabel, CanvasGroup canvasGroup)
        {
            label = textLabel;
            group = canvasGroup;
        }

        public void Show(float amount, Vector3 worldPosition, bool heavy)
        {
            _worldPosition = worldPosition + Random.insideUnitSphere * 0.15f;
            _age = 0f;
            _lifetime = heavy ? 0.9f : 0.7f;
            _riseSpeed = heavy ? 1.1f : 0.8f;
            _color = heavy ? new Color(1f, 0.72f, 0.35f) : new Color(1f, 0.95f, 0.9f);
            if (label != null)
            {
                label.text = Mathf.RoundToInt(amount).ToString();
                label.color = _color;
                label.fontSize = heavy ? 46 : 34;
            }

            if (group != null) group.alpha = 1f;
            _camera = Camera.main;
            gameObject.SetActive(true);
        }

        private void Update()
        {
            _age += Time.deltaTime;
            if (_age >= _lifetime)
            {
                gameObject.SetActive(false);
                return;
            }

            _worldPosition += Vector3.up * (_riseSpeed * Time.deltaTime);

            if (_camera == null) _camera = Camera.main;
            if (_camera != null && label != null)
            {
                label.transform.position = _camera.WorldToScreenPoint(_worldPosition);
            }

            if (group != null)
            {
                float t = _age / _lifetime;
                group.alpha = t < 0.7f ? 1f : Mathf.InverseLerp(1f, 0.7f, t);
            }
        }
    }
}
