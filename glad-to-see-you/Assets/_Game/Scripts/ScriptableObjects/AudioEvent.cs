using UnityEngine;

namespace GladToSeeYou.Data
{
    /// <summary>
    /// A named sound with variation. Populated by the bootstrap with procedural placeholder clips
    /// until real SFX exist; gameplay only ever asks GameRoot.Audio to play an AudioEvent.
    /// </summary>
    [CreateAssetMenu(fileName = "AudioEvent", menuName = "Glad To See You/Audio Event")]
    public class AudioEvent : ScriptableObject
    {
        public string displayName = "Hit Light";

        public AudioClip[] clips;

        [Range(0f, 1f)] public float volume = 0.8f;
        public Vector2 pitchRange = new Vector2(0.95f, 1.05f);

        [Tooltip("2D (UI/global) or positional (world events).")]
        public bool spatial = false;

        [Tooltip("Max hear distance for spatial events.")]
        public float maxDistance = 18f;

        public AudioClip PickClip()
        {
            if (clips == null || clips.Length == 0) return null;
            return clips[Random.Range(0, clips.Length)];
        }

        public float PickPitch() => Random.Range(pitchRange.x, pitchRange.y);
    }
}
