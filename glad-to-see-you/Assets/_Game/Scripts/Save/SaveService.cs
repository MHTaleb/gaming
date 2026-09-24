using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Save
{
    /// <summary>
    /// Player settings persistence (PlayerPrefs-backed — no network, no accounts).
    /// Owned by GameRoot; written on change, loaded once at boot.
    /// </summary>
    public class SaveService
    {
        private const string KeyQuality = "gts.quality";
        private const string KeyVolume = "gts.volume";
        private const string KeySensitivity = "gts.sensitivity";
        private const string KeyInvertY = "gts.invertY";

        public QualityTier Quality { get; private set; } = QualityTier.Balanced;
        public float MasterVolume { get; private set; } = 0.9f;
        public float LookSensitivity { get; private set; } = 1f;
        public bool InvertY { get; private set; }

        public void Load()
        {
            Quality = (QualityTier)PlayerPrefs.GetInt(KeyQuality, (int)QualityTier.Balanced);
            MasterVolume = PlayerPrefs.GetFloat(KeyVolume, 0.9f);
            LookSensitivity = PlayerPrefs.GetFloat(KeySensitivity, 1f);
            InvertY = PlayerPrefs.GetInt(KeyInvertY, 0) == 1;
        }

        public void SetQuality(QualityTier tier)
        {
            Quality = tier;
            PlayerPrefs.SetInt(KeyQuality, (int)tier);
            PlayerPrefs.Save();
        }

        public void SetVolume(float volume)
        {
            MasterVolume = Mathf.Clamp01(volume);
            PlayerPrefs.SetFloat(KeyVolume, MasterVolume);
            PlayerPrefs.Save();
        }

        public void SetSensitivity(float sensitivity)
        {
            LookSensitivity = Mathf.Clamp(sensitivity, 0.2f, 3f);
            PlayerPrefs.SetFloat(KeySensitivity, LookSensitivity);
            PlayerPrefs.Save();
        }

        public void SetInvertY(bool invert)
        {
            InvertY = invert;
            PlayerPrefs.SetInt(KeyInvertY, invert ? 1 : 0);
            PlayerPrefs.Save();
        }
    }
}
