using GladToSeeYou.AI;
using GladToSeeYou.Animation;
using GladToSeeYou.CameraRig;
using GladToSeeYou.Combat;
using GladToSeeYou.Data;
using GladToSeeYou.Input;
using GladToSeeYou.Player;
using UnityEngine;
using UnityEngine.AI;

namespace GladToSeeYou.Core
{
    public static partial class VerticalSliceFactory
    {
        // ------------------------------------------------------------------ player

        public static PlayerRoot BuildPlayer(SliceHandles handles, SliceAssets assets, Vector3 spawn, bool includeUi)
        {
            var playerGo = new GameObject("Player");
            playerGo.transform.position = spawn;
            playerGo.layer = PhysicsLayers.Player;

            var controller = playerGo.AddComponent<CharacterController>();
            controller.height = 1.8f;
            controller.radius = 0.35f;
            controller.center = new Vector3(0f, 0.9f, 0f);
            controller.slopeLimit = 50f;
            controller.stepOffset = 0.42f;

            // --- placeholder visuals (swapped later; referenced via driver only) ---
            var visualRoot = new GameObject("Visual").transform;
            visualRoot.SetParent(playerGo.transform, false);

            var bodyMat = CreatePlaceholderMaterial("M_Player_Body", new Color(0.34f, 0.40f, 0.52f), 0.25f, 0.45f);
            CreatePrimitiveVisual(visualRoot, PrimitiveType.Capsule, "Body", new Vector3(0f, 0.9f, 0f),
                new Vector3(0.66f, 0.9f, 0.66f), bodyMat, PhysicsLayers.Player);

            var weaponPivot = new GameObject("WeaponPivot");
            weaponPivot.transform.SetParent(visualRoot, false);
            weaponPivot.transform.localPosition = new Vector3(0.4f, 1.12f, 0.2f);
            var bladeMat = CreatePlaceholderMaterial("M_Player_Blade", new Color(0.78f, 0.80f, 0.86f), 0.85f, 0.6f);
            CreatePrimitiveVisual(weaponPivot.transform, PrimitiveType.Cube, "Blade", new Vector3(0f, 0.5f, 0f),
                new Vector3(0.055f, 1.0f, 0.12f), bladeMat, PhysicsLayers.Player);

            var driverGo = new GameObject("AnimationDriver");
            driverGo.transform.SetParent(playerGo.transform, false);
            var driver = driverGo.AddComponent<ProceduralAnimationDriver>();
            driver.Configure(visualRoot, weaponPivot.transform);

            // --- components ---
            var movement = playerGo.AddComponent<PlayerMovement>();
            var dodge = playerGo.AddComponent<PlayerDodge>();
            var hitbox = playerGo.AddComponent<WeaponHitbox>();
            var combat = playerGo.AddComponent<PlayerCombat>();
            var health = playerGo.AddComponent<Health>();
            var playerHealth = playerGo.AddComponent<PlayerHealth>();
            var animation = playerGo.AddComponent<PlayerAnimation>();
            var targeting = playerGo.AddComponent<PlayerTargeting>();
            var abilities = playerGo.AddComponent<PlayerAbilities>();
            var targetable = playerGo.AddComponent<Targetable>();
            var reader = playerGo.AddComponent<PlayerInputReader>();
            reader.Configure(InputActionLibrary.CreateDefaultAsset());
            var root = playerGo.AddComponent<PlayerRoot>();

            // Component-internal wiring that needs no camera/services yet.
            dodge.Configure(assets.PlayerStats, health, movement);
            combat.Configure(assets.Weapon, hitbox, movement);
            playerHealth.Configure(assets.PlayerStats);
            animation.Configure(driver, combat, playerHealth);
            abilities.Configure(assets.Ability);
            targetable.Configure(Team.Player, 1.2f);

            return root;
        }

        /// <summary>Wiring that needs the camera + input router to exist (called by Build).</summary>
        private static void FinalizePlayer(PlayerRoot root, SliceAssets assets, InputRouter router, Transform cameraTransform)
        {
            var go = root.gameObject;
            var movement = go.GetComponent<PlayerMovement>();
            var targeting = go.GetComponent<PlayerTargeting>();

            movement.Configure(assets.PlayerStats, cameraTransform);
            targeting.Configure(assets.PlayerStats, cameraTransform);

            root.Configure(assets.PlayerStats, router, cameraTransform,
                movement,
                go.GetComponent<PlayerDodge>(),
                go.GetComponent<PlayerCombat>(),
                go.GetComponent<PlayerHealth>(),
                go.GetComponent<PlayerAnimation>(),
                targeting,
                go.GetComponent<PlayerAbilities>(),
                assets.StepSound, assets.WhooshLight, assets.WhooshHeavy, assets.DodgeSound);
        }

        // ------------------------------------------------------------------ camera

        public static ThirdPersonCameraRig BuildCamera(PlayerRoot player, Vector3 playerSpawn)
        {
            var cameraGo = new GameObject("MainCamera");
            cameraGo.tag = "MainCamera";
            cameraGo.transform.position = playerSpawn + new Vector3(0f, 1.6f, -4.2f);

            var cam = cameraGo.AddComponent<UnityEngine.Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.05f, 0.06f, 0.09f);
            cam.fieldOfView = 55f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 130f;
            cameraGo.AddComponent<AudioListener>();

            var rig = cameraGo.AddComponent<ThirdPersonCameraRig>();
            rig.Configure(cam, player.transform);
            return rig;
        }

        // ------------------------------------------------------------------ enemy

        public static EnemyRoot BuildEnemy(SliceHandles handles, SliceAssets assets, Transform player, Vector3 spawn)
        {
            var enemyGo = new GameObject("Enemy");
            enemyGo.transform.position = spawn;
            enemyGo.layer = PhysicsLayers.Enemy;

            var capsule = enemyGo.AddComponent<CapsuleCollider>();
            capsule.height = 1.8f;
            capsule.radius = 0.4f;
            capsule.center = new Vector3(0f, 0.9f, 0f);

            var agent = enemyGo.AddComponent<NavMeshAgent>();
            agent.radius = 0.4f;
            agent.height = 1.8f;
            agent.speed = assets.Enemy.chaseSpeed;

            // --- placeholder visuals: dark revenant with an ember eye (the name's motif) ---
            var visualRoot = new GameObject("Visual").transform;
            visualRoot.SetParent(enemyGo.transform, false);
            var bodyMat = CreatePlaceholderMaterial("M_Enemy_Body", new Color(0.16f, 0.13f, 0.20f), 0.1f, 0.3f);
            CreatePrimitiveVisual(visualRoot, PrimitiveType.Capsule, "Body", new Vector3(0f, 0.9f, 0f),
                new Vector3(0.8f, 0.9f, 0.8f), bodyMat, PhysicsLayers.Enemy);

            var eyeMat = CreatePlaceholderMaterial("M_Enemy_Eye", new Color(0.9f, 0.3f, 0.1f), 0f, 0.8f);
            if (eyeMat.HasProperty("_EmissionColor"))
            {
                eyeMat.EnableKeyword("_EMISSION");
                eyeMat.SetColor("_EmissionColor", new Color(1.4f, 0.4f, 0.15f));
            }

            CreatePrimitiveVisual(visualRoot, PrimitiveType.Sphere, "Eye", new Vector3(0f, 1.35f, 0.18f),
                new Vector3(0.16f, 0.16f, 0.16f), eyeMat, PhysicsLayers.Enemy);

            var driverGo = new GameObject("AnimationDriver");
            driverGo.transform.SetParent(enemyGo.transform, false);
            var driver = driverGo.AddComponent<ProceduralAnimationDriver>();
            driver.Configure(visualRoot, null);

            // --- components ---
            var sensor = enemyGo.AddComponent<EnemySensor>();
            var locomotion = enemyGo.AddComponent<EnemyLocomotion>();
            var hitbox = enemyGo.AddComponent<WeaponHitbox>();
            var combat = enemyGo.AddComponent<EnemyCombat>();
            var health = enemyGo.AddComponent<Health>();
            var enemyHealth = enemyGo.AddComponent<EnemyHealth>();
            var animation = enemyGo.AddComponent<EnemyAnimation>();
            var targetable = enemyGo.AddComponent<Targetable>();
            var brain = enemyGo.AddComponent<EnemyBrain>();
            var root = enemyGo.AddComponent<EnemyRoot>();
            targetable.Configure(Team.Enemy, 1.1f);

            // Patrol waypoints (children of the arena so a future arena swap carries them).
            var patrolA = new GameObject("Patrol_A").transform;
            patrolA.SetParent(handles.Arena, false);
            patrolA.position = spawn + new Vector3(-5f, 0f, 0f);
            var patrolB = new GameObject("Patrol_B").transform;
            patrolB.SetParent(handles.Arena, false);
            patrolB.position = spawn + new Vector3(5f, 0f, 0f);
            var patrolC = new GameObject("Patrol_C").transform;
            patrolC.SetParent(handles.Arena, false);
            patrolC.position = spawn + new Vector3(0f, 0f, 3f);

            root.Configure(assets.Enemy, player, new[] { patrolA, patrolB, patrolC },
                sensor, locomotion, combat, enemyHealth, animation, brain, driver, hitbox);

            return root;
        }
    }
}
