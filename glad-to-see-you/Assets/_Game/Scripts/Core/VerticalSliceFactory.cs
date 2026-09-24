using GladToSeeYou.AI;
using GladToSeeYou.Audio;
using GladToSeeYou.CameraRig;
using GladToSeeYou.Combat;
using GladToSeeYou.Data;
using GladToSeeYou.Input;
using GladToSeeYou.Player;
using GladToSeeYou.Save;
using GladToSeeYou.UI;
using GladToSeeYou.VFX;
using UnityEngine;

namespace GladToSeeYou.Core
{
    /// <summary>
    /// Builds the entire playable vertical slice **in code** — the deterministic bootstrap.
    /// Used by the editor menu (then saved as a scene) and by PlayMode tests (same factory, no drift).
    /// Placeholder visuals are primitive-based and clearly replaceable: every system finds its
    /// visuals through serialized references, so swapping art never touches gameplay code.
    /// See Documentation/ARCHITECTURE.md §"Deterministic bootstrap".
    /// </summary>
    public static partial class VerticalSliceFactory
    {
        public sealed class SliceHandles
        {
            public GameRoot Root;
            public PlayerRoot Player;
            public EnemyRoot Enemy;
            public ThirdPersonCameraRig CameraRig;
            public HUDController Hud;
            public Transform Arena;
        }

        public sealed class SliceOptions
        {
            public bool IncludeLighting = true;
            public bool IncludeUi = true;
            public Vector3 PlayerSpawn = new Vector3(0f, 0.2f, -7f);
            public Vector3 EnemySpawn = new Vector3(0f, 0.2f, 7f);
        }

        /// <summary>Persistent assets when available (editor bootstrap); runtime defaults otherwise (tests).</summary>
        public sealed class SliceAssets
        {
            public PlayerStats PlayerStats;
            public WeaponData Weapon;
            public EnemyData Enemy;
            public AbilityData Ability;
            public VFXData HitSpark;
            public VFXData HeavySpark;
            public VFXData DeathBurst;
            public AudioEvent StepSound;
            public AudioEvent WhooshLight;
            public AudioEvent WhooshHeavy;
            public AudioEvent DodgeSound;
            public AudioEvent HitLight;
            public AudioEvent HitHeavy;
            public AudioEvent DeathSound;
            public QualityProfileData Low;
            public QualityProfileData Balanced;
            public QualityProfileData High;
        }

        public static SliceHandles Build(SliceOptions options = null, SliceAssets assets = null)
        {
            options = options ?? new SliceOptions();
            assets = assets ?? CreateDefaultAssets();

            var handles = new SliceHandles();
            handles.Arena = BuildArena(options.IncludeLighting, out var groundCollider);

            var servicesGo = new GameObject("GameRoot");
            var root = servicesGo.AddComponent<GameRoot>();

            var audio = servicesGo.AddComponent<AudioService>();
            audio.Configure();
            var vfx = servicesGo.AddComponent<VFXService>();
            var hitStop = servicesGo.AddComponent<HitStopService>();
            var save = new SaveService();
            save.Load();
            var quality = servicesGo.AddComponent<QualityProfileService>();
            quality.Configure(save, assets.Low, assets.Balanced, assets.High);

            var router = servicesGo.AddComponent<InputRouter>();

            handles.Player = BuildPlayer(handles, assets, options.PlayerSpawn, options.IncludeUi);
            var reader = handles.Player.GetComponent<PlayerInputReader>();
            router.Configure(reader, save.InvertY, save.LookSensitivity);

            handles.CameraRig = BuildCamera(handles.Player, options.PlayerSpawn);
            FinalizePlayer(handles.Player, assets, router, handles.CameraRig.Camera.transform);
            handles.Enemy = BuildEnemy(handles, assets, handles.Player.transform, options.EnemySpawn);

            if (options.IncludeUi)
            {
                BuildUi(handles, assets, servicesGo.transform, router, audio, vfx);
            }

#if UNITY_EDITOR || DEVELOPMENT_BUILD
            servicesGo.AddComponent<PerformanceOverlay>();
#endif

            root.Wire(router, audio, vfx, hitStop, quality, save, handles.CameraRig, handles.Player);

            audio.SetMasterVolume(save.MasterVolume);
            quality.ApplyCurrentProfile();
            vfx.Density = quality.VfxDensity;

            return handles;
        }

        // ------------------------------------------------------------------ default data

        public static SliceAssets CreateDefaultAssets()
        {
            var assets = new SliceAssets
            {
                PlayerStats = ScriptableObject.CreateInstance<PlayerStats>(),
                Weapon = ScriptableObject.CreateInstance<WeaponData>(),
                Enemy = ScriptableObject.CreateInstance<EnemyData>(),
                Ability = ScriptableObject.CreateInstance<AbilityData>()
            };

            assets.HitSpark = CreateVfxData("Hit Spark (placeholder)", new Color(1f, 0.55f, 0.2f, 1f), 24, 0.4f, 0.12f);
            assets.HeavySpark = CreateVfxData("Heavy Spark (placeholder)", new Color(1f, 0.38f, 0.12f, 1f), 42, 0.55f, 0.16f);
            assets.DeathBurst = CreateVfxData("Death Burst (placeholder)", new Color(0.75f, 0.55f, 1f, 1f), 72, 0.9f, 0.14f);

            assets.StepSound = CreateAudioEvent("Step (placeholder)", PlaceholderAudioFactory.CreateStep(), false);
            assets.WhooshLight = CreateAudioEvent("Whoosh Light (placeholder)", PlaceholderAudioFactory.CreateWhoosh(), false);
            assets.WhooshHeavy = CreateAudioEvent("Whoosh Heavy (placeholder)", PlaceholderAudioFactory.CreateWhoosh(), false);
            assets.DodgeSound = CreateAudioEvent("Dodge (placeholder)", PlaceholderAudioFactory.CreateStep(), false);
            assets.HitLight = CreateAudioEvent("Hit Light (placeholder)", PlaceholderAudioFactory.CreateLightHit(), true);
            assets.HitHeavy = CreateAudioEvent("Hit Heavy (placeholder)", PlaceholderAudioFactory.CreateHeavyHit(), true);
            assets.DeathSound = CreateAudioEvent("Death (placeholder)", PlaceholderAudioFactory.CreateDeath(), true);

            assets.Low = CreateQualityProfile(QualityTier.Low, 30, 0.8f, 20f, 2, 0.6f);
            assets.Balanced = CreateQualityProfile(QualityTier.Balanced, 60, 0.9f, 28f, 4, 0.85f);
            assets.High = CreateQualityProfile(QualityTier.High, 60, 1.0f, 40f, 6, 1.0f);

            return assets;
        }

        private static VFXData CreateVfxData(string name, Color color, int burst, float lifetime, float size)
        {
            var data = ScriptableObject.CreateInstance<VFXData>();
            data.name = name;
            data.displayName = name;
            data.startColor = color;
            data.endColor = new Color(color.r, color.g, color.b, 0f);
            data.burstCount = burst;
            data.lifetime = lifetime;
            data.sizeStart = size;
            data.sizeEnd = 0f;
            data.maxAlive = Mathf.Max(64, burst * 3);
            return data;
        }

        private static AudioEvent CreateAudioEvent(string name, AudioClip clip, bool spatial)
        {
            var data = ScriptableObject.CreateInstance<AudioEvent>();
            data.name = name;
            data.displayName = name;
            data.clips = new[] { clip };
            data.spatial = spatial;
            return data;
        }

        private static QualityProfileData CreateQualityProfile(QualityTier tier, int fps, float renderScale, float shadowDistance, int pixelLights, float vfxDensity)
        {
            var data = ScriptableObject.CreateInstance<QualityProfileData>();
            data.name = $"QualityProfile_{tier}";
            data.tier = tier;
            data.targetFrameRate = fps;
            data.renderScale = renderScale;
            data.shadowDistance = shadowDistance;
            data.pixelLightCount = pixelLights;
            data.vfxDensity = vfxDensity;
            return data;
        }

        // ------------------------------------------------------------------ shared helpers

        internal static Material CreatePlaceholderMaterial(string name, Color color, float metallic, float smoothness)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");

            var material = new Material(shader) { name = name };
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
            if (material.HasProperty("_Color")) material.SetColor("_Color", color);
            if (material.HasProperty("_Metallic")) material.SetFloat("_Metallic", metallic);
            if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", smoothness);
            return material;
        }

        internal static GameObject CreatePrimitiveVisual(Transform parent, PrimitiveType type, string name,
            Vector3 localPosition, Vector3 localScale, Material material, int layer)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.transform.localScale = localScale;
            go.layer = layer;

            SafeDestroy(go.GetComponent<Collider>()); // visuals never collide; gameplay colliders are explicit

            if (material != null)
            {
                go.GetComponent<Renderer>().sharedMaterial = material;
            }

            return go;
        }

        internal static void SafeDestroy(Object obj)
        {
            if (obj == null) return;
#if UNITY_EDITOR
            if (!Application.isPlaying)
            {
                Object.DestroyImmediate(obj);
                return;
            }
#endif
            Object.Destroy(obj);
        }
    }
}
