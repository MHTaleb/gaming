using UnityEngine;

namespace GladToSeeYou.Audio
{
    /// <summary>
    /// Synthesizes placeholder SFX at startup so the slice has sound before real audio exists.
    /// Deterministic (fixed seeds). Replace by filling AudioEvent assets with real clips —
    /// no gameplay code changes.
    /// </summary>
    public static class PlaceholderAudioFactory
    {
        private const int SampleRate = 44100;

        public static AudioClip CreateLightHit()
        {
            var samples = Render(0.16f, seed: 11, (t, rng, i, total) =>
            {
                float env = FastAttackDecay(t, 0.002f, 0.14f);
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                float tone = Mathf.Sin(2f * Mathf.PI * 220f * t) * 0.5f;
                return (noise * 0.7f + tone) * env * 0.8f;
            });
            return Make("SFX_Placeholder_HitLight", samples);
        }

        public static AudioClip CreateHeavyHit()
        {
            var samples = Render(0.30f, seed: 12, (t, rng, i, total) =>
            {
                float env = FastAttackDecay(t, 0.004f, 0.26f);
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                float tone = Mathf.Sin(2f * Mathf.PI * 96f * t) * 0.7f;
                return (noise * 0.5f + tone) * env * 1.0f;
            });
            return Make("SFX_Placeholder_HitHeavy", samples);
        }

        public static AudioClip CreateWhoosh()
        {
            var samples = Render(0.22f, seed: 21, (t, rng, i, total) =>
            {
                float env = FastAttackDecay(t, 0.05f, 0.16f);
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                float sweep = Mathf.Lerp(900f, 240f, t / 0.22f);
                float tone = Mathf.Sin(2f * Mathf.PI * sweep * t) * 0.35f;
                return (noise * 0.45f + tone) * env * 0.6f;
            });
            return Make("SFX_Placeholder_Whoosh", samples);
        }

        public static AudioClip CreateStep()
        {
            var samples = Render(0.09f, seed: 31, (t, rng, i, total) =>
            {
                float env = FastAttackDecay(t, 0.001f, 0.07f);
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
                return noise * env * 0.35f;
            });
            return Make("SFX_Placeholder_Step", samples);
        }

        public static AudioClip CreateDeath()
        {
            var samples = Render(1.1f, seed: 41, (t, rng, i, total) =>
            {
                float env = FastAttackDecay(t, 0.01f, 1.0f);
                float a = Mathf.Sin(2f * Mathf.PI * 70f * t);
                float b = Mathf.Sin(2f * Mathf.PI * 105f * t) * 0.6f;
                float c = Mathf.Sin(2f * Mathf.PI * 140f * t) * 0.35f;
                float noise = (float)(rng.NextDouble() * 2.0 - 1.0) * 0.15f;
                return (a + b + c + noise) * env * 0.5f;
            });
            return Make("SFX_Placeholder_Death", samples);
        }

        private static float FastAttackDecay(float t, float attack, float duration)
        {
            if (t <= attack) return attack <= 0f ? 1f : t / attack; // linear attack
            float d = (t - attack) / Mathf.Max(0.0001f, duration - attack);
            return Mathf.Clamp01(1f - d);
        }

        private static float[] Render(float durationSeconds, int seed, System.Func<float, System.Random, int, int, float> generator)
        {
            int total = Mathf.Max(64, (int)(durationSeconds * SampleRate));
            var samples = new float[total];
            var rng = new System.Random(seed);
            for (int i = 0; i < total; i++)
            {
                float t = i / (float)SampleRate;
                float value = generator(t, rng, i, total);
                samples[i] = Mathf.Clamp(value, -1f, 1f);
            }

            return samples;
        }

        private static AudioClip Make(string name, float[] samples)
        {
            var clip = AudioClip.Create(name, samples.Length, 1, SampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }
    }
}
