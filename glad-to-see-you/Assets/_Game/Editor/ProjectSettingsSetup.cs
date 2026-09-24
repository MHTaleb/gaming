using GladToSeeYou.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace GladToSeeYou.EditorTools
{
    /// <summary>
    /// Idempotent project settings: physics layers, color space, player identity, URP pipeline
    /// (created via the editor's own menu so the asset is exactly what Unity would produce),
    /// and always-included shaders for builds.
    /// </summary>
    public static class ProjectSettingsSetup
    {
        public static void SetupAll()
        {
            EnsureLayers();
            EnsureColorSpace();
            EnsurePlayerIdentity();
            EnsureInputHandling();
            EnsureUrpPipeline();
            EnsureAlwaysIncludedShaders();
            AssetDatabase.SaveAssets();
            Debug.Log("[ProjectSettingsSetup] Done: layers, color space, player identity, input handling, URP, included shaders.");
        }

        private static void EnsureInputHandling()
        {
            var projectSettingsAssets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (projectSettingsAssets == null || projectSettingsAssets.Length == 0) return;

            var settings = new SerializedObject(projectSettingsAssets[0]);
            var handler = settings.FindProperty("activeInputHandler");
            if (handler == null) return; // property renamed in a future version — leave as-is

            // 0 = old Input Manager, 1 = new Input System, 2 = both.
            if (handler.intValue == 0)
            {
                handler.intValue = 2;
                settings.ApplyModifiedProperties();
                Debug.LogWarning("[ProjectSettingsSetup] Active Input Handling was legacy-only; set to 'Both' " +
                                 "(the game requires the new Input System). RESTART THE UNITY EDITOR to apply.");
            }
        }

        private static void EnsureLayers()
        {
            var tagManagerAssets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (tagManagerAssets == null || tagManagerAssets.Length == 0)
            {
                Debug.LogWarning("[ProjectSettingsSetup] TagManager.asset not found; create layers manually: " +
                                 string.Join(", ", PhysicsLayers.Names));
                return;
            }

            var tagManager = new SerializedObject(tagManagerAssets[0]);
            var layers = tagManager.FindProperty("layers");
            if (layers == null || !layers.isArray)
            {
                Debug.LogWarning("[ProjectSettingsSetup] layers property not found in TagManager.");
                return;
            }

            foreach (var layerName in PhysicsLayers.Names)
            {
                bool exists = false;
                for (int i = 0; i < layers.arraySize; i++)
                {
                    if (layers.GetArrayElementAtIndex(i).stringValue == layerName)
                    {
                        exists = true;
                        break;
                    }
                }

                if (exists) continue;

                // Reserved slots: 0-7 are Unity built-ins; user layers start at 8.
                for (int i = 8; i < layers.arraySize; i++)
                {
                    var slot = layers.GetArrayElementAtIndex(i);
                    if (string.IsNullOrEmpty(slot.stringValue))
                    {
                        slot.stringValue = layerName;
                        break;
                    }
                }
            }

            tagManager.ApplyModifiedProperties();
            AssetDatabase.SaveAssets();
        }

        private static void EnsureColorSpace()
        {
            if (PlayerSettings.colorSpace != ColorSpace.Linear)
            {
                PlayerSettings.colorSpace = ColorSpace.Linear;
                Debug.Log("[ProjectSettingsSetup] Color space set to Linear (URP expectation).");
            }
        }

        private static void EnsurePlayerIdentity()
        {
            if (string.IsNullOrEmpty(PlayerSettings.companyName) || PlayerSettings.companyName == "DefaultCompany")
            {
                PlayerSettings.companyName = "MHTaleb";
            }

            if (PlayerSettings.productName != "Glad to See You")
            {
                PlayerSettings.productName = "Glad to See You";
            }
        }

        private static void EnsureUrpPipeline()
        {
            var current = GraphicsSettings.defaultRenderPipeline;
            if (current != null)
            {
                Debug.Log($"[ProjectSettingsSetup] Render pipeline already assigned: {current.name}.");
                return;
            }

            // Create the URP asset through Unity's own menu (exact same asset the template makes),
            // then find whatever it created and assign it.
            string[] menuCandidates =
            {
                "Assets/Create/Rendering/URP Asset (with Universal Renderer)",
                "Assets/Create/Rendering/Universal Render Pipeline/URP Asset (with Universal Renderer)",
                "Assets/Create/Rendering/URP Asset"
            };

            foreach (var menu in menuCandidates)
            {
                if (EditorApplication.ExecuteMenuItem(menu))
                {
                    AssetDatabase.Refresh();
                    break;
                }
            }

            var guids = AssetDatabase.FindAssets("t:UniversalRenderPipelineAsset");
            if (guids == null || guids.Length == 0)
            {
                Debug.LogWarning("[ProjectSettingsSetup] Could not create a URP asset automatically.\n" +
                                 "Manual step: Assets ▸ Create ▸ Rendering ▸ URP Asset (with Universal Renderer), " +
                                 "then assign it in Project Settings ▸ Graphics + Quality.");
                return;
            }

            var urp = AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(AssetDatabase.GUIDToAssetPath(guids[0]));
            GraphicsSettings.defaultRenderPipeline = urp;

            int qualityCount = UnityEngine.QualitySettings.names != null ? UnityEngine.QualitySettings.names.Length : 1;
            for (int i = 0; i < qualityCount; i++)
            {
                UnityEngine.QualitySettings.SetQualityLevel(i, false);
                UnityEngine.QualitySettings.renderPipeline = urp;
            }

            Debug.Log($"[ProjectSettingsSetup] URP asset assigned: {urp.name} (Graphics + all quality levels). " +
                      "Move it under Assets/_Game/Settings/Generated/URP/ when convenient.");
        }

        private static void EnsureAlwaysIncludedShaders()
        {
            var graphicsAssets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset");
            if (graphicsAssets == null || graphicsAssets.Length == 0) return;

            var graphics = new SerializedObject(graphicsAssets[0]);
            var shadersArray = graphics.FindProperty("m_AlwaysIncludedShaders");
            if (shadersArray == null || !shadersArray.isArray) return;

            string[] required =
            {
                "Universal Render Pipeline/Lit",
                "Universal Render Pipeline/Particles/Unlit",
                "Sprites/Default"
            };

            foreach (var shaderName in required)
            {
                var shader = Shader.Find(shaderName);
                if (shader == null)
                {
                    Debug.LogWarning($"[ProjectSettingsSetup] Shader '{shaderName}' not found to include.");
                    continue;
                }

                bool present = false;
                for (int i = 0; i < shadersArray.arraySize; i++)
                {
                    if (shadersArray.GetArrayElementAtIndex(i).objectReferenceValue == shader)
                    {
                        present = true;
                        break;
                    }
                }

                if (present) continue;

                shadersArray.arraySize++;
                shadersArray.GetArrayElementAtIndex(shadersArray.arraySize - 1).objectReferenceValue = shader;
                Debug.Log($"[ProjectSettingsSetup] Added '{shaderName}' to Always Included Shaders.");
            }

            graphics.ApplyModifiedProperties();
        }
    }
}
