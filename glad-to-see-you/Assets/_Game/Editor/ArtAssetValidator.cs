using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

namespace GladToSeeYou.EditorTools
{
    /// <summary>
    /// Cheap automated pass over imported art (Documentation/AI_ASSET_PIPELINE.md §3).
    /// Flags budget/naming problems early; style & license checks stay human review gates.
    /// </summary>
    public static class ArtAssetValidator
    {
        private const string ArtRoot = "Assets/_Game/Art";
        private static readonly Regex NamingPattern = new Regex(@"^(SM|SK|M|T|VFX|AN|ENV|SFX|MUS)_[A-Za-z0-9_]+$");

        [MenuItem("Glad to See You/Validate/Art Assets")]
        public static void Validate()
        {
            int warnings = 0;
            warnings += ValidateModels();
            warnings += ValidateTextures();

            Debug.Log(warnings == 0
                ? "[ArtAssetValidator] Passed: no budget/naming violations found."
                : $"[ArtAssetValidator] {warnings} warning(s) — see above. Fix or justify before committing. (Budgets: Documentation/PERFORMANCE_BUDGET.md)");
        }

        private static int ValidateModels()
        {
            int warnings = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { ArtRoot }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (model == null) continue;

                string fileName = System.IO.Path.GetFileNameWithoutExtension(path);
                if (!NamingPattern.IsMatch(fileName))
                {
                    Debug.LogWarning($"[ArtAssetValidator] Naming: '{fileName}' — expected SM_/SK_ + PascalCase (ART_DIRECTION.md).", model);
                    warnings++;
                }

                int triangles = 0;
                var renderers = model.GetComponentsInChildren<Renderer>(true);
                var materials = new HashSet<Material>();

                foreach (var renderer in renderers)
                {
                    foreach (var material in renderer.sharedMaterials)
                    {
                        if (material != null) materials.Add(material);
                    }
                }

                var filters = model.GetComponentsInChildren<MeshFilter>(true);
                foreach (var filter in filters)
                {
                    if (filter.sharedMesh != null) triangles += filter.sharedMesh.triangles.Length / 3;
                }

                if (triangles > 40000)
                {
                    Debug.LogWarning($"[ArtAssetValidator] {fileName}: ~{triangles} tris (> hero budget 40k).", model);
                    warnings++;
                }

                if (materials.Count > 2)
                {
                    Debug.LogWarning($"[ArtAssetValidator] {fileName}: {materials.Count} materials (budget: ≤2 hero / ≤1 prop).", model);
                    warnings++;
                }
            }

            return warnings;
        }

        private static int ValidateTextures()
        {
            int warnings = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:Texture", new[] { ArtRoot }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var texture = AssetDatabase.LoadAssetAtPath<Texture>(path);
                if (texture == null) continue;

                var importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer != null && importer.maxTextureSize > 2048)
                {
                    Debug.LogWarning($"[ArtAssetValidator] {texture.name}: maxTextureSize {importer.maxTextureSize} " +
                                     "(budget: hero 2048, others 1024).", texture);
                    warnings++;
                }
            }

            return warnings;
        }
    }
}
