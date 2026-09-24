using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace GladToSeeYou.EditorTools
{
    /// <summary>
    /// Android build configuration + CLI build entry point.
    /// Batch: Unity -batchmode -quit -projectPath . -executeMethod GladToSeeYou.EditorTools.MobileBuild.BuildAndroid
    /// Signing via env vars: UNITY_ANDROID_KEYSTORE_PATH/_PASS, UNITY_ANDROID_KEYALIAS/_PASS (never committed).
    /// </summary>
    public static class MobileBuild
    {
        private const string PackageId = "com.mhtaleb.gladtoseeyou";
        private const string OutputPath = "Builds/Android/GladToSeeYou.apk";

        [MenuItem("Glad to See You/Build/Configure Android Settings")]
        public static void ConfigureAndroid()
        {
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, PackageId);
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel26;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;

            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan, GraphicsDeviceType.OpenGLES3 });

            ApplySigningFromEnvironment();
            Debug.Log("[MobileBuild] Android settings applied (IL2CPP, ARM64, Vulkan+GLES3, API 26+, landscape).");
        }

        private static void ApplySigningFromEnvironment()
        {
            string keystore = System.Environment.GetEnvironmentVariable("UNITY_ANDROID_KEYSTORE_PATH");
            if (string.IsNullOrEmpty(keystore)) return;

            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = keystore;
            PlayerSettings.Android.keystorePass = System.Environment.GetEnvironmentVariable("UNITY_ANDROID_KEYSTORE_PASS") ?? string.Empty;
            PlayerSettings.Android.keyaliasName = System.Environment.GetEnvironmentVariable("UNITY_ANDROID_KEYALIAS") ?? string.Empty;
            PlayerSettings.Android.keyaliasPass = System.Environment.GetEnvironmentVariable("UNITY_ANDROID_KEYALIAS_PASS") ?? string.Empty;
            Debug.Log("[MobileBuild] Signing keystore applied from environment variables.");
        }

        /// <summary>CLI entry point (used by CI and Documentation/MOBILE_BUILD.md).</summary>
        public static void BuildAndroid()
        {
            ConfigureAndroid();

            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
            {
                if (!EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android))
                {
                    Debug.LogError("[MobileBuild] Could not switch to Android build target. " +
                                   "Is 'Android Build Support' installed for this editor? (Unity Hub ▸ Add Modules)");
                    EditorApplication.Exit(1);
                    return;
                }
            }

            Directory.CreateDirectory(Path.GetDirectoryName(OutputPath) ?? "Builds/Android");

            var options = new BuildPlayerOptions
            {
                scenes = EnabledScenePaths(),
                locationPathName = OutputPath,
                target = BuildTarget.Android,
                options = BuildOptions.None
            };

            var report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                Debug.LogError($"[MobileBuild] Android build failed: {report.summary.result}");
                EditorApplication.Exit(1);
                return;
            }

            Debug.Log($"[MobileBuild] Android build succeeded: {OutputPath} ({report.summary.totalSize / (1024 * 1024)} MB)");
            EditorApplication.Exit(0);
        }

        private static string[] EnabledScenePaths()
        {
            var scenes = new List<string>();
            foreach (var scene in EditorBuildSettings.scenes)
            {
                if (scene.enabled) scenes.Add(scene.path);
            }

            if (scenes.Count == 0)
            {
                scenes.Add(VerticalSliceBootstrap.ScenePath);
            }

            return scenes.ToArray();
        }
    }
}
