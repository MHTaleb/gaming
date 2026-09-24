using GladToSeeYou.Combat;
using GladToSeeYou.Data;
using GladToSeeYou.Input;
using NUnit.Framework;
using UnityEngine;

namespace GladToSeeYou.Tests.EditMode
{
    public class InputPipelineTests
    {
        [Test]
        public void Default_Asset_Exposes_All_Gameplay_Actions()
        {
            var asset = InputActionLibrary.CreateDefaultAsset();
            try
            {
                var map = asset.FindActionMap(InputActionLibrary.GameplayMapName, true);
                foreach (var actionName in new[]
                         {
                             InputActionLibrary.MoveAction, InputActionLibrary.LookAction,
                             InputActionLibrary.LightAction, InputActionLibrary.HeavyAction,
                             InputActionLibrary.DodgeAction, InputActionLibrary.LockAction,
                             InputActionLibrary.InteractAction, InputActionLibrary.AbilityAction
                         })
                {
                    Assert.IsNotNull(map.FindAction(actionName), $"{actionName} missing from default asset");
                }
            }
            finally
            {
                Object.DestroyImmediate(asset);
            }
        }

        [Test]
        public void VirtualLayer_Merges_Move_And_Queues_Edges()
        {
            var layer = new VirtualInputLayer();
            layer.Move = new Vector2(0.5f, 1f);
            layer.PressLight();

            var commands = InputCommands.Empty;
            layer.ConsumeInto(ref commands);

            Assert.AreEqual(1f, commands.Move.magnitude, 0.001f, "move must be clamped to 1");
            Assert.IsTrue(commands.LightAttackPressed);

            var second = InputCommands.Empty;
            layer.ConsumeInto(ref second);
            Assert.IsFalse(second.LightAttackPressed, "edge flags must be one-shot");
        }

        [Test]
        public void VirtualLayer_Clamps_Combined_Move()
        {
            var layer = new VirtualInputLayer { Move = Vector2.right };

            var commands = new InputCommands { Move = Vector2.right }; // desktop stick already at full
            layer.ConsumeInto(ref commands);

            Assert.LessOrEqual(commands.Move.magnitude, 1.0001f);
        }

        [Test]
        public void WeaponData_Clamps_Light_Chain_Index()
        {
            var weapon = ScriptableObject.CreateInstance<WeaponData>();
            try
            {
                Assert.AreEqual(1, weapon.LightChainLength);
                var step = weapon.LightStep(99);
                Assert.IsNotNull(step);
                Assert.Greater(step.damage, 0f);
            }
            finally
            {
                Object.DestroyImmediate(weapon);
            }
        }

        [Test]
        public void Health_Rejects_Damage_When_Dead()
        {
            var go = new GameObject("DeadTest");
            try
            {
                var health = go.AddComponent<GladToSeeYou.Core.Health>();
                health.Configure(GladToSeeYou.Core.Team.Enemy, 10f, 10f);
                health.Kill();

                var info = DamageInfo.Simple(5f, 5f, null, GladToSeeYou.Core.Team.Player, Vector3.zero, Vector3.forward);
                Assert.AreEqual(GladToSeeYou.Core.DamageResult.AlreadyDead, health.ApplyDamage(info));
            }
            finally
            {
                Object.DestroyImmediate(go);
            }
        }
    }
}
