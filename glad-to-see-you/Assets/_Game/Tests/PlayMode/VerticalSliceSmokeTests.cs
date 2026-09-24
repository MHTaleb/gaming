using System.Collections;
using GladToSeeYou.Core;
using GladToSeeYou.Player;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace GladToSeeYou.Tests.PlayMode
{
    /// <summary>
    /// Builds the actual slice through the same factory the editor bootstrap uses, then exercises
    /// the core loop at runtime: services wire up, virtual input moves the player, damage kills the enemy.
    /// </summary>
    public class VerticalSliceSmokeTests
    {
        [TearDown]
        public void TearDown()
        {
            foreach (var go in Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None))
            {
                if (go != null && go.transform.parent == null)
                {
                    Object.Destroy(go);
                }
            }
        }

        [UnityTest]
        public IEnumerator Factory_Builds_A_Playable_Slice()
        {
            var handles = VerticalSliceFactory.Build();

            yield return null;
            yield return null; // let Awake/Start settle

            Assert.IsNotNull(handles.Root, "GameRoot missing");
            Assert.IsNotNull(handles.Player, "Player missing");
            Assert.IsNotNull(handles.Enemy, "Enemy missing");
            Assert.IsNotNull(handles.CameraRig, "Camera rig missing");
            Assert.IsNotNull(handles.Root.Input, "InputRouter not wired");
            Assert.IsNotNull(handles.Root.Audio, "AudioService not wired");
            Assert.IsNotNull(handles.Root.Vfx, "VFXService not wired");

            // Damage the enemy through the same path combat uses.
            var enemyHealth = handles.Enemy.GetComponent<GladToSeeYou.Core.Health>();
            Assert.IsNotNull(enemyHealth, "Enemy has no Health component");
            float before = enemyHealth.Current;

            var info = GladToSeeYou.Core.DamageInfo.Simple(15f, 5f, handles.Player.gameObject,
                GladToSeeYou.Core.Team.Player, handles.Enemy.transform.position, Vector3.forward);
            var result = enemyHealth.ApplyDamage(info);

            Assert.AreEqual(GladToSeeYou.Core.DamageResult.Applied, result);
            Assert.Less(enemyHealth.Current, before);

            // Kill it and confirm the death event fires and the brain transitions.
            bool died = false;
            System.Action<GameObject> onDied = who =>
            {
                if (who == handles.Enemy.gameObject) died = true;
            };
            GladToSeeYou.Core.EventBus.Died += onDied;
            try
            {
                enemyHealth.Kill();
                yield return null;
            }
            finally
            {
                GladToSeeYou.Core.EventBus.Died -= onDied;
            }

            Assert.IsTrue(died, "death event not raised for the enemy");
            Assert.AreEqual(GladToSeeYou.AI.EnemyStateId.Dead,
                handles.Enemy.GetComponent<GladToSeeYou.AI.EnemyBrain>().CurrentStateId);
        }

        [UnityTest]
        public IEnumerator Virtual_Input_Moves_The_Player()
        {
            var handles = VerticalSliceFactory.Build();
            yield return null;
            yield return null;

            float startZ = handles.Player.transform.position.z;
            var router = handles.Root.Input;
            Assert.IsNotNull(router, "InputRouter not wired");

            router.Virtual.Move = Vector2.up; // camera-relative forward

            for (int i = 0; i < 20; i++)
            {
                yield return null;
            }

            router.Virtual.Move = Vector2.zero;

            float movedZ = handles.Player.transform.position.z - startZ;
            Assert.Greater(movedZ, 0.05f, "player did not move forward from virtual input");
        }
    }
}
