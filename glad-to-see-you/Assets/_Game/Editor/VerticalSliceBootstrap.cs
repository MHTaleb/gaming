using System;
using System.IO;
using GladToSeeYou.Audio;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace GladToSeeYou.EditorTools
{
    /// <summary>
    /// One-click project bootstrap. Runs the SAME factory the PlayMode tests use, then persists
    /// the result as a scene — so the "shipped" slice and the tested slice can never drift.
    /// Menu: Glad to See You ▸ Bootstrap.
    /// </summary>
    public static class VerticalSliceBootstrap
    {
        public const string ScenePath = "Assets/_Game/Scenes/Arena_VerticalSlice.unity";
        private const string GeneratedRoot = "Assets/_Game/Settings/Generated";
        private const string InputMirrorPath = "Assets/_Game/Settings/Input/GladToSeeYouControls.inputactions";

        [MenuItem("Glad to See You/Bootstrap/1. Setup Project", priority = 0)]
        public static void SetupProject()
        {
            ProjectSettingsSetup.SetupAll();
        }

        [MenuItem("Glad to See You/Bootstrap/2. Build Vertical Slice Scene", priority = 1)]
        public static void BuildVerticalSliceScene()
        {
            var assets = EnsureAssets();
            EnsurePlaceholderAudioAssets(assets);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var handles = VerticalSliceFactory.Build(new VerticalSliceFactory.SliceOptions(), assets);

            EditorSceneManager.MarkSceneDirty(scene);
            EnsureFolder(Path.GetDirectoryName(ScenePath));
            if (!EditorSceneManager.SaveScene(scene, ScenePath))
            {
                Debug.LogError("[Bootstrap] Failed to save the vertical slice scene.");
                return;
            }

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };

            Debug.Log($"[Bootstrap] Vertical slice scene built and saved to {ScenePath}. " +
                      $"Player='{handles.Player.name}', Enemy='{handles.Enemy.name}', Camera='{handles.CameraRig.name}'. " +
                      "Press Play. (Keyboard/gamepad in editor; touch UI appears on devices/F5.)");
        }

        [MenuItem("Glad to See You/Bootstrap/3. Export Input Actions Mirror", priority = 2)]
        public static void ExportInputActions()
        {
            var asset = GladToSeeYou.Input.InputActionLibrary.CreateDefaultAsset();
            var json = GladToSeeYou.Input.InputActionLibrary.ToJson(asset);

            EnsureFolder(Path.GetDirectoryName(InputMirrorPath));
            File.WriteAllText(InputMirrorPath, json);
            AssetDatabase.ImportAsset(InputMirrorPath);

            Debug.Log($"[Bootstrap] Input actions mirror exported to {InputMirrorPath}. " +
                      "NOTE: the C# InputActionLibrary remains the single source of truth — this file is for inspection only.");
        }

        // ------------------------------------------------------------------ generated assets

        public static VerticalSliceFactory.SliceAssets EnsureAssets()
        {
            EnsureFolder(GeneratedRoot);

            return new VerticalSliceFactory.SliceAssets
            {
                PlayerStats = CreateOrLoad<PlayerStats>("PlayerStats"),
                Weapon = CreateOrLoad<WeaponData>("Weapon_Longsword"),
                Enemy = CreateOrLoad<EnemyData>("Enemy_AshRevenant"),
                Ability = CreateOrLoad<AbilityData>("Ability_EmberSlam"),
                HitSpark = CreateOrLoad<VFXData>("VFX_HitSpark"),
                HeavySpark = CreateOrLoad<VFXData>("VFX_HeavySpark"),
                DeathBurst = CreateOrLoad<VFXData>("VFX_DeathBurst"),
                StepSound = CreateOrLoad<AudioEvent>("Audio_Step"),
                WhooshLight = CreateOrLoad<AudioEvent>("Audio_WhooshLight"),
                WhooshHeavy = CreateOrLoad<AudioEvent>("Audio_WhooshHeavy"),
                DodgeSound = CreateOrLoad<AudioEvent>("Audio_Dodge"),
                HitLight = CreateOrLoad<AudioEvent>("Audio_HitLight"),
                HitHeavy = CreateOrLoad<AudioEvent>("Audio_HitHeavy"),
                DeathSound = CreateOrLoad<AudioEvent>("Audio_Death"),
                Low = CreateOrLoad<QualityProfileData>("Quality_Low"),
                Balanced = CreateOrLoad<QualityProfileData>("Quality_Balanced"),
                High = CreateOrLoad<QualityProfileData>("Quality_High")
            };
        }

        private static T CreateOrLoad<T>(string assetName) where T : ScriptableObject
        {
            string path = $"{GeneratedRoot}/{assetName}.asset";
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null) return existing;

            var instance = ScriptableObject.CreateInstance<T>();
            instance.name = assetName;
            AssetDatabase.CreateAsset(instance, path);
            return instance;
        }

        // ------------------------------------------------------------------ placeholder audio

        /// <summary>
        /// Bakes procedural placeholder SFX into real .wav assets (once) and assigns them to the
        /// AudioEvent assets, so the saved scene has sound with zero external files. Real clips
        /// replace this by simply filling the AudioEvent clip slots.
        /// </summary>
        private static void EnsurePlaceholderAudioAssets(VerticalSliceFactory.SliceAssets assets)
        {
            string dir = GeneratedRoot + "/Audio";
            EnsureFolder(dir);

            Assign(assets.StepSound, "SFX_Placeholder_Step", PlaceholderAudioFactory.CreateStep(), dir, false);
            Assign(assets.WhooshLight, "SFX_Placeholder_WhooshLight", PlaceholderAudioFactory.CreateWhoosh(), dir, false);
            Assign(assets.WhooshHeavy, "SFX_Placeholder_WhooshHeavy", PlaceholderAudioFactory.CreateWhoosh(), dir, false);
            Assign(assets.DodgeSound, "SFX_Placeholder_Dodge", PlaceholderAudioFactory.CreateStep(), dir, false);
            Assign(assets.HitLight, "SFX_Placeholder_HitLight", PlaceholderAudioFactory.CreateLightHit(), dir, true);
            Assign(assets.HitHeavy, "SFX_Placeholder_HitHeavy", PlaceholderAudioFactory.CreateHeavyHit(), dir, true);
            Assign(assets.DeathSound, "SFX_Placeholder_Death", PlaceholderAudioFactory.CreateDeath(), dir, true);
        }

        private static void Assign(AudioEvent audioEvent, string fileName, AudioClip clip, string dir, bool spatial)
        {
            if (audioEvent == null) return;
            if (audioEvent.clips != null && audioEvent.clips.Length > 0 && audioEvent.clips[0] != null) return;

            string wavPath = $"{dir}/{fileName}.wav";
            if (!File.Exists(wavPath)) WriteWav(wavPath, clip);
            AssetDatabase.ImportAsset(wavPath);

            var clipAsset = AssetDatabase.LoadAssetAtPath<AudioClip>(wavPath);
            if (clipAsset == null)
            {
                Debug.LogWarning($"[Bootstrap] Could not import placeholder audio at {wavPath}.");
                return;
            }

            audioEvent.clips = new[] { clipAsset };
            audioEvent.spatial = spatial;
            EditorUtility.SetDirty(audioEvent);
        }

        private static void WriteWav(string path, AudioClip clip)
        {
            var samples = new float[clip.samples * clip.channels];
            clip.GetData(samples, 0);

            using var stream = new MemoryStream();
            using var writer = new BinaryWriter(stream);

            int sampleRate = clip.frequency;
            short channels = (short)clip.channels;
            int dataSize = samples.Length * 2;
            const short bitsPerSample = 16;

            writer.Write(new[] { 'R', 'I', 'F', 'F' });
            writer.Write(36 + dataSize);
            writer.Write(new[] { 'W', 'A', 'V', 'E' });
            writer.Write(new[] { 'f', 'm', 't', ' ' });
            writer.Write(16);
            writer.Write((short)1); // PCM
            writer.Write(channels);
            writer.Write(sampleRate);
            writer.Write(sampleRate * channels * bitsPerSample / 8);
            writer.Write((short)(channels * bitsPerSample / 8));
            writer.Write(bitsPerSample);
            writer.Write(new[] { 'd', 'a', 't', 'a' });
            writer.Write(dataSize);

            foreach (var sample in samples)
            {
                writer.Write((short)(Mathf.Clamp(sample, -1f, 1f) * 32767f));
            }

            File.WriteAllBytes(path, stream.ToArray());
        }

        public static void EnsureFolder(string folder)
        {
            if (string.IsNullOrEmpty(folder) || AssetDatabase.IsValidFolder(folder)) return;

            string parent = Path.GetDirectoryName(folder)?.Replace('\\', '/');
            string leaf = Path.GetFileName(folder);
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }
    }
}
