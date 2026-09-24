using System;
using System.Collections.Generic;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.Audio
{
    /// <summary>
    /// Pooled one-shot playback + music. Master volume comes from SaveService.
    /// Never allocates per Play() once the pool is warm.
    /// </summary>
    public class AudioService : MonoBehaviour
    {
        private AudioSource[] _pool;
        private AudioSource _musicSource;
        private int _next;

        public float MasterVolume { get; private set; } = 0.9f;

        public void Configure(int poolSize = 12)
        {
            poolSize = Mathf.Max(4, poolSize);
            _pool = new AudioSource[poolSize];
            for (int i = 0; i < poolSize; i++)
            {
                var go = new GameObject($"AudioSource_{i:00}");
                go.transform.SetParent(transform, false);
                var source = go.AddComponent<AudioSource>();
                source.playOnAwake = false;
                source.rolloffMode = AudioRolloffMode.Linear;
                _pool[i] = source;
            }

            var musicGo = new GameObject("Music");
            musicGo.transform.SetParent(transform, false);
            _musicSource = musicGo.AddComponent<AudioSource>();
            _musicSource.playOnAwake = false;
            _musicSource.loop = true;
        }

        public void SetMasterVolume(float volume) => MasterVolume = Mathf.Clamp01(volume);

        public void Play(AudioEvent ev, Vector3 position)
        {
            if (ev == null || _pool == null) return;
            var clip = ev.PickClip();
            if (clip == null) return;

            var source = NextSource();
            source.transform.position = position;
            source.clip = clip;
            source.volume = ev.volume * MasterVolume;
            source.pitch = ev.PickPitch();
            source.spatialBlend = ev.spatial ? 1f : 0f;
            source.maxDistance = ev.spatial ? ev.maxDistance : 500f;
            source.Play();
        }

        public void PlayMusic(AudioClip clip, float volume = 0.5f)
        {
            if (_musicSource == null || clip == null) return;
            if (_musicSource.clip == clip && _musicSource.isPlaying) return;
            _musicSource.clip = clip;
            _musicSource.volume = volume * MasterVolume;
            _musicSource.Play();
        }

        private AudioSource NextSource()
        {
            // Round-robin; prefer a free source, else steal the oldest slot.
            for (int i = 0; i < _pool.Length; i++)
            {
                var candidate = _pool[(_next + i) % _pool.Length];
                if (!candidate.isPlaying)
                {
                    _next = (_next + i + 1) % _pool.Length;
                    return candidate;
                }
            }

            var stolen = _pool[_next];
            _next = (_next + 1) % _pool.Length;
            return stolen;
        }
    }
}
