using System.Collections.Generic;
using GladToSeeYou.AI;
using GladToSeeYou.Animation;
using GladToSeeYou.Combat;
using GladToSeeYou.Data;
using NUnit.Framework;
using UnityEngine;

namespace GladToSeeYou.Tests.EditMode
{
    /// <summary>
    /// State machine tests against a real (but inert) enemy rig. States are plain classes and the
    /// context is injected — no scene, no play mode, deterministic time via ctx.Now.
    /// </summary>
    public class EnemyStateMachineTests
    {
        private readonly List<GameObject> _spawned = new List<GameObject>();
        private EnemyRoot _root;
        private EnemyData _data;

        [SetUp]
        public void SetUp()
        {
            _data = ScriptableObject.CreateInstance<EnemyData>();

            var go = new GameObject("EnemyTestRig");
            _spawned.Add(go);

            var sensor = go.AddComponent<EnemySensor>();
            var locomotion = go.AddComponent<EnemyLocomotion>();
            var combat = go.AddComponent<EnemyCombat>();
            var health = go.AddComponent<GladToSeeYou.Core.Health>();
            var enemyHealth = go.AddComponent<EnemyHealth>();
            var animation = go.AddComponent<EnemyAnimation>();
            var hitbox = go.AddComponent<WeaponHitbox>();
            var brain = go.AddComponent<EnemyBrain>();
            var driver = go.AddComponent<ProceduralAnimationDriver>();
            var root = go.AddComponent<EnemyRoot>();

            root.Configure(_data, null, new Transform[0],
                sensor, locomotion, combat, enemyHealth, animation, brain, driver, hitbox);
            _root = root;
        }

        [TearDown]
        public void TearDown()
        {
            if (_data != null) Object.DestroyImmediate(_data);
            foreach (var go in _spawned)
            {
                if (go != null) Object.DestroyImmediate(go);
            }

            _spawned.Clear();
        }

        private EnemyContext Context(bool canSee, float distance, bool attackReady, float now)
        {
            return new EnemyContext
            {
                Root = _root,
                Now = now,
                DeltaTime = 0.016f,
                Config = new EnemyConfig
                {
                    CanSeePlayer = canSee,
                    DistanceToPlayer = distance,
                    AttackReady = attackReady
                }
            };
        }

        [Test]
        public void Idle_Chases_When_Player_Seen()
        {
            var state = new EnemyIdleState();
            state.Enter(Context(false, 99f, false, 0f));

            var next = state.Tick(Context(canSee: true, 5f, false, now: 0.1f));
            Assert.AreEqual(EnemyStateId.Chase, next);
        }

        [Test]
        public void Idle_Patrols_After_Pause()
        {
            var state = new EnemyIdleState();
            var ctx = Context(false, 99f, false, 100f);
            state.Enter(ctx);

            var next = state.Tick(Context(false, 99f, false, now: 102f));
            Assert.AreEqual(EnemyStateId.Patrol, next);
        }

        [Test]
        public void Chase_Attacks_In_Range_When_Ready()
        {
            var state = new EnemyChaseState();
            _data.attackRange = 2.5f;

            var next = state.Tick(Context(true, distance: 2.0f, attackReady: true, now: 10f));
            Assert.AreEqual(EnemyStateId.Attack, next);
        }

        [Test]
        public void Chase_Does_Not_Attack_While_On_Cooldown()
        {
            var state = new EnemyChaseState();
            _data.attackRange = 2.5f;

            var next = state.Tick(Context(true, distance: 2.0f, attackReady: false, now: 10f));
            Assert.AreEqual(EnemyStateId.Chase, next);
        }

        [Test]
        public void Chase_Returns_To_Patrol_After_Losing_Sight()
        {
            var state = new EnemyChaseState();
            state.Tick(Context(true, 6f, false, now: 10f)); // sees player, arms the grace timer

            var next = state.Tick(Context(false, 99f, false, now: 14f)); // 4s later, still no sight
            Assert.AreEqual(EnemyStateId.Patrol, next);
        }

        [Test]
        public void Stunned_Recovers_After_Stagger_Duration()
        {
            var state = new EnemyStunnedState();
            _data.staggerSeconds = 0.8f;

            var ctx = Context(true, 3f, false, 50f);
            state.Enter(ctx);
            Assert.AreEqual(EnemyStateId.Stunned, state.Tick(Context(true, 3f, false, now: 50.4f)));
            Assert.AreEqual(EnemyStateId.Chase, state.Tick(Context(true, 3f, false, now: 51f)));
        }

        [Test]
        public void Brain_Transitions_To_Dead_When_Health_Dies()
        {
            var health = _root.GetComponent<GladToSeeYou.Core.Health>();
            health.Kill();

            typeof(EnemyBrain).GetMethod("Update",
                    System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
                ?.Invoke(_root.GetComponent<EnemyBrain>(), null);

            Assert.AreEqual(EnemyStateId.Dead, _root.GetComponent<EnemyBrain>().CurrentStateId);
        }
    }
}
