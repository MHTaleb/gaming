using UnityEngine;

namespace GladToSeeYou.Core
{
    public static partial class VerticalSliceFactory
    {
        /// <summary>
        /// The arena: ground slab, boundary walls, stone pillars — all primitives with placeholder
        /// materials. Lighting is deliberately cinematic-moody (cool key + warm accents + fog) to
        /// prove the look direction; real kits replace the visuals later (see ART_DIRECTION.md).
        /// </summary>
        public static Transform BuildArena(bool includeLighting, out Collider groundCollider)
        {
            var arena = new GameObject("Arena").transform;

            var groundMat = CreatePlaceholderMaterial("M_Arena_Ground", new Color(0.20f, 0.20f, 0.23f), 0f, 0.25f);
            var wallMat = CreatePlaceholderMaterial("M_Arena_Stone", new Color(0.26f, 0.25f, 0.27f), 0f, 0.15f);
            var pillarMat = CreatePlaceholderMaterial("M_Arena_Pillar", new Color(0.31f, 0.29f, 0.28f), 0f, 0.2f);

            // Ground: 44 x 44 slab (visual + the collision everybody walks on)
            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = "Ground";
            ground.transform.SetParent(arena, false);
            ground.transform.localScale = new Vector3(44f, 0.5f, 44f);
            ground.transform.localPosition = new Vector3(0f, -0.25f, 0f);
            ground.layer = PhysicsLayers.Ground;
            ground.GetComponent<Renderer>().sharedMaterial = groundMat;
            groundCollider = ground.GetComponent<Collider>();

            // Boundary walls
            CreateWall(arena, wallMat, "Wall_North", new Vector3(0f, 1.6f, 22f), new Vector3(44f, 3.2f, 1f));
            CreateWall(arena, wallMat, "Wall_South", new Vector3(0f, 1.6f, -22f), new Vector3(44f, 3.2f, 1f));
            CreateWall(arena, wallMat, "Wall_East", new Vector3(22f, 1.6f, 0f), new Vector3(1f, 3.2f, 44f));
            CreateWall(arena, wallMat, "Wall_West", new Vector3(-22f, 1.6f, 0f), new Vector3(1f, 3.2f, 44f));

            // Pillars: give the space silhouette + shadow interest (also block LOS/atmosphere)
            var pillarPositions = new[]
            {
                new Vector3(-9f, 2.2f, -9f), new Vector3(9f, 2.2f, -9f),
                new Vector3(-9f, 2.2f, 9f), new Vector3(9f, 2.2f, 9f),
                new Vector3(0f, 2.2f, -14f), new Vector3(0f, 2.2f, 14f)
            };

            for (int i = 0; i < pillarPositions.Length; i++)
            {
                var pillar = GameObject.CreatePrimitive(PrimitiveType.Cube);
                pillar.name = $"Pillar_{i:00}";
                pillar.transform.SetParent(arena, false);
                pillar.transform.localPosition = pillarPositions[i];
                pillar.transform.localScale = new Vector3(1.2f, 4.4f, 1.2f);
                pillar.transform.localRotation = Quaternion.Euler(0f, i * 17f, 0f);
                pillar.layer = PhysicsLayers.Ground;
                pillar.GetComponent<Renderer>().sharedMaterial = pillarMat;
            }

            if (includeLighting)
            {
                BuildLighting(arena);
            }

            return arena;
        }

        private static void CreateWall(Transform parent, Material material, string name, Vector3 position, Vector3 scale)
        {
            var wall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            wall.name = name;
            wall.transform.SetParent(parent, false);
            wall.transform.localPosition = position;
            wall.transform.localScale = scale;
            wall.layer = PhysicsLayers.Ground;
            wall.GetComponent<Renderer>().sharedMaterial = material;
        }

        private static void BuildLighting(Transform parent)
        {
            // Cool key light — the "moon". One realtime shadow caster only (mobile budget).
            var keyGo = new GameObject("Light_Key_Moon");
            keyGo.transform.SetParent(parent, false);
            keyGo.transform.rotation = Quaternion.Euler(48f, -28f, 0f);
            var key = keyGo.AddComponent<Light>();
            key.type = LightType.Directional;
            key.color = new Color(0.62f, 0.72f, 1.0f);
            key.intensity = 0.85f;
            key.shadows = LightShadows.Soft;

            // Warm accent pools: the route through the arena (no shadows — budget).
            CreatePointLight(parent, "Light_Ember_A", new Vector3(-9f, 2.4f, -9f), new Color(1f, 0.6f, 0.28f), 8f, 2.2f);
            CreatePointLight(parent, "Light_Ember_B", new Vector3(9f, 2.4f, -9f), new Color(1f, 0.55f, 0.24f), 8f, 2.2f);
            CreatePointLight(parent, "Light_Ember_C", new Vector3(0f, 2.6f, 14f), new Color(1f, 0.5f, 0.22f), 10f, 2.6f);

            // Atmosphere: fog + trilight ambient (cheap, huge perceived-quality win on mobile).
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = new Color(0.09f, 0.11f, 0.16f);
            RenderSettings.fogDensity = 0.022f;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.16f, 0.19f, 0.25f);
            RenderSettings.ambientEquatorColor = new Color(0.10f, 0.11f, 0.14f);
            RenderSettings.ambientGroundColor = new Color(0.05f, 0.05f, 0.06f);
        }

        private static void CreatePointLight(Transform parent, string name, Vector3 position, Color color, float range, float intensity)
        {
            var lightGo = new GameObject(name);
            lightGo.transform.SetParent(parent, false);
            lightGo.transform.localPosition = position;
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = color;
            light.range = range;
            light.intensity = intensity;
            light.shadows = LightShadows.None;
        }
    }
}
