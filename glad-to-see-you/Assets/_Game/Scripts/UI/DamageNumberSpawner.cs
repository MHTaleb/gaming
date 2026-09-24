using UnityEngine;
using UnityEngine.UI;

namespace GladToSeeYou.UI
{
    /// <summary>Fixed-size pool of <see cref="DamageNumber"/> objects, built by the factory on the HUD canvas.</summary>
    public class DamageNumberSpawner : MonoBehaviour
    {
        [SerializeField] private int poolSize = 16;
        private DamageNumber[] _pool;
        private int _next;

        public void Configure(Font font)
        {
            poolSize = Mathf.Max(4, poolSize);
            _pool = new DamageNumber[poolSize];
            for (int i = 0; i < poolSize; i++)
            {
                var go = new GameObject($"DamageNumber_{i:00}", typeof(RectTransform), typeof(CanvasGroup), typeof(Text), typeof(DamageNumber));
                go.transform.SetParent(transform, false);
                var rect = (RectTransform)go.transform;
                rect.sizeDelta = new Vector2(160f, 64f);

                var text = go.GetComponent<Text>();
                text.font = font;
                text.alignment = TextAnchor.MiddleCenter;
                text.horizontalOverflow = HorizontalWrapMode.Overflow;
                text.verticalOverflow = VerticalWrapMode.Overflow;
                text.raycastTarget = false;

                var number = go.GetComponent<DamageNumber>();
                number.Configure(text, go.GetComponent<CanvasGroup>());
                go.SetActive(false);
                _pool[i] = number;
            }
        }

        public void Spawn(float amount, Vector3 worldPosition, bool heavy)
        {
            if (_pool == null) return;
            var number = _pool[_next];
            _next = (_next + 1) % _pool.Length;
            number.Show(amount, worldPosition, heavy);
        }
    }
}
