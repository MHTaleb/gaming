using System.Collections.Generic;
using GladToSeeYou.Data;
using UnityEngine;

namespace GladToSeeYou.VFX
{
    /// <summary>
    /// Pooled one-shot particle playback, configured from VFXData archetypes at creation time.
    /// Quality density multiplies burst counts (set via <see cref="Density"/>).
    /// </summary>
    public class VFXService : MonoBehaviour
    {
        private readonly Dictionary<VFXData, Queue<ParticleSystem>> _pools = new Dictionary<VFXData, Queue<ParticleSystem>>();
        private Material _particleMaterial;

        /// <summary>Multiplier applied to burst counts (from QualityProfileService).</summary>
        public float Density { get; set; } = 1f;

        public void Play(VFXData data, Vector3 position, Vector3 direction, float intensity = 1f)
        {
            if (data == null) return;

            var system = Get(data);
            var t = system.transform;
            t.position = position;
            if (direction.sqrMagnitude > 0.0001f) t.rotation = Quaternion.LookRotation(direction);

            int count = Mathf.Max(1, Mathf.RoundToInt(data.burstCount * Mathf.Clamp01(Density) * Mathf.Max(0.1f, intensity)));
            system.Emit(count);
        }

        private ParticleSystem Get(VFXData data)
        {
            if (_pools.TryGetValue(data, out var queue) && queue.Count > 0) return queue.Dequeue();

            var ps = Create(data);
            _pools[data] = queue ?? new Queue<ParticleSystem>();
            return ps;
        }

        private ParticleSystem Create(VFXData data)
        {
            var go = new GameObject($"VFX_{data.displayName}");
            go.transform.SetParent(transform, false);
            var ps = go.AddComponent<ParticleSystem>();

            // Core modules
            var main = ps.main;
            main.loop = false;
            main.playOnAwake = false;
            main.startLifetime = data.lifetime;
            main.startSpeed = new ParticleSystem.MinMaxCurve(data.speedMin, data.speedMax);
            main.startSize = data.sizeStart;
            main.gravityModifier = data.gravity;
            main.maxParticles = Mathf.Max(data.burstCount * 3, data.maxAlive);
            main.startColor = data.startColor;
            main.stopAction = ParticleSystemStopAction.None;
            main.simulationSpace = ParticleSystemSimulationSpace.World;

            var emission = ps.emission;
            emission.enabled = false; // bursts are emitted manually via Play()

            var shape = ps.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = data.coneAngle;
            shape.radius = data.radius;

            var color = ps.colorOverLifetime;
            color.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(
                new[] { new GradientColorKey(data.startColor, 0f), new GradientColorKey(data.endColor, 1f) },
                new[] { new GradientAlphaKey(data.startColor.a, 0f), new GradientAlphaKey(data.endColor.a, 1f) });
            color.color = new ParticleSystem.MinMaxGradient(gradient);

            var sizeOverLifetime = ps.sizeOverLifetime;
            sizeOverLifetime.enabled = true;
            float ratio = data.sizeStart <= 0.0001f ? 0f : Mathf.Clamp01(data.sizeEnd / data.sizeStart);
            sizeOverLifetime.size = new ParticleSystem.MinMaxCurve(1f, new AnimationCurve(new Keyframe(0f, 1f), new Keyframe(1f, ratio)));

            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.material = GetParticleMaterial();
            renderer.renderMode = ParticleSystemRenderMode.Billboard;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;

            ps.Stop();
            return ps;
        }

        private Material GetParticleMaterial()
        {
            if (_particleMaterial != null) return _particleMaterial;

            var shader = Shader.Find("Universal Render Pipeline/Particles/Unlit");
            if (shader == null)
            {
                Debug.LogWarning("[VFXService] URP Particles/Unlit shader not found; falling back. " +
                                 "Add it to Graphics Settings ▸ Always Included Shaders for builds.");
                shader = Shader.Find("Sprites/Default");
            }

            _particleMaterial = new Material(shader) { name = "M_VFX_Placeholder" };
            return _particleMaterial;
        }
    }
}
