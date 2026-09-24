using System.Collections.Generic;
using GladToSeeYou.Core;
using NUnit.Framework;
using UnityEngine;

namespace GladToSeeYou.Tests.EditMode
{
    public class DamageAndHealthTests
    {
        private readonly List<GameObject> _spawned = new List<GameObject>();

        [TearDown]
        public void TearDown()
        {
            foreach (var go in _spawned)
            {
                if (go != null) Object.DestroyImmediate(go);
            }

            _spawned.Clear();
        }

        private Health MakeHealth(Team team, float health, float poise)
        {
            var go = new GameObject($"TestHealth_{team}");
            _spawned.Add(go);
            var healthComponent = go.AddComponent<Health>();
            healthComponent.Configure(team, health, poise);
            return healthComponent;
        }

        private static DamageInfo Hit(float amount, float poise, Team sourceTeam, GameObject source = null)
        {
            return DamageInfo.Simple(amount, poise, source, sourceTeam, Vector3.zero, Vector3.forward);
        }

        [Test]
        public void Damage_Reduces_Health_And_Raises_Event()
        {
            var health = MakeHealth(Team.Enemy, 100f, 50f);
            int events = 0;
            System.Action<DamageInfo, GameObject> handler = (_, __) => events++;
            EventBus.DamageApplied += handler;
            try
            {
                var result = health.ApplyDamage(Hit(20f, 5f, Team.Player));
                Assert.AreEqual(DamageResult.Applied, result);
                Assert.AreEqual(80f, health.Current, 0.001f);
                Assert.AreEqual(1, events);
            }
            finally
            {
                EventBus.DamageApplied -= handler;
            }
        }

        [Test]
        public void Damage_From_Same_Team_Is_Ignored()
        {
            var health = MakeHealth(Team.Enemy, 100f, 50f);
            var result = health.ApplyDamage(Hit(20f, 5f, Team.Enemy));
            Assert.AreEqual(DamageResult.Ignored, result);
            Assert.AreEqual(100f, health.Current, 0.001f);
        }

        [Test]
        public void Invulnerable_Target_Dodges_And_Takes_No_Damage()
        {
            var health = MakeHealth(Team.Player, 100f, 50f);
            health.SetInvulnerableFor(5f);

            var result = health.ApplyDamage(Hit(35f, 10f, Team.Enemy));
            Assert.AreEqual(DamageResult.Dodged, result);
            Assert.AreEqual(100f, health.Current, 0.001f);
        }

        [Test]
        public void Poise_Break_Flags_Stagger_Exactly_Once()
        {
            var health = MakeHealth(Team.Enemy, 100f, poise: 20f);
            Assert.IsFalse(health.ConsumeStaggered());

            health.ApplyDamage(Hit(5f, 20f, Team.Player));

            Assert.IsTrue(health.ConsumeStaggered(), "stagger should be flagged after poise break");
            Assert.IsFalse(health.ConsumeStaggered(), "stagger flag must be consumed (one-shot)");
        }

        [Test]
        public void Lethal_Damage_Kills_And_Raises_Died_Once()
        {
            var health = MakeHealth(Team.Enemy, 30f, 50f);
            int deaths = 0;
            System.Action<GameObject> handler = _ => deaths++;
            EventBus.Died += handler;
            try
            {
                health.ApplyDamage(Hit(50f, 5f, Team.Player));
                Assert.IsFalse(health.IsAlive);
                Assert.AreEqual(0f, health.Current, 0.001f);

                var second = health.ApplyDamage(Hit(50f, 5f, Team.Player));
                Assert.AreEqual(DamageResult.AlreadyDead, second);
                Assert.AreEqual(1, deaths, "death must be raised exactly once");
            }
            finally
            {
                EventBus.Died -= handler;
            }
        }

        [Test]
        public void Heal_Never_Exceeds_Max()
        {
            var health = MakeHealth(Team.Player, 100f, 50f);
            health.ApplyDamage(Hit(40f, 0f, Team.Enemy));
            health.Heal(200f);
            Assert.AreEqual(100f, health.Current, 0.001f);
        }
    }
}
