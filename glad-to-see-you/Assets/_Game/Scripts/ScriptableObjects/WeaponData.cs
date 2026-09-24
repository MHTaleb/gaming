using System;
using UnityEngine;

namespace GladToSeeYou.Data
{
    /// <summary>One attack in a chain: timings drive windows/hitboxes; damage drives combat.</summary>
    [Serializable]
    public class AttackStep
    {
        [Header("Timing (seconds)")]
        public float windup = 0.18f;
        public float active = 0.10f;
        public float recovery = 0.32f;
        [Tooltip("How long after entering recovery a next input is accepted for a combo.")]
        public float comboChainWindow = 0.45f;

        [Header("Damage")]
        public float damage = 18f;
        public float poiseDamage = 12f;

        [Header("Motion")]
        [Tooltip("Forward lunge speed while attacking (m/s). 0 = rooted.")]
        public float lungeSpeed = 2.2f;

        [Header("Hitbox (relative to attacker root)")]
        public float hitboxRadius = 0.9f;
        public float hitboxForwardOffset = 1.1f;
        public float hitboxHeight = 1.0f;

        [Header("Feel")]
        public float hitStopSeconds = 0.07f;
        public float cameraImpulse = 0.045f;
    }

    /// <summary>Weapon + moveset definition for the hero. Data lives here; PlayerCombat only executes it.</summary>
    [CreateAssetMenu(fileName = "WeaponData", menuName = "Glad To See You/Weapon Data")]
    public class WeaponData : ScriptableObject
    {
        public string displayName = "Cursed Longsword";

        [Tooltip("Light attack combo chain, played in order.")]
        public AttackStep[] lightChain = { new AttackStep() };

        public AttackStep heavy = new AttackStep
        {
            windup = 0.42f,
            active = 0.12f,
            recovery = 0.55f,
            damage = 42f,
            poiseDamage = 40f,
            lungeSpeed = 1.4f,
            hitboxRadius = 1.05f,
            hitboxForwardOffset = 1.25f,
            hitStopSeconds = 0.11f,
            cameraImpulse = 0.085f
        };

        public AttackStep LightStep(int index)
        {
            if (lightChain == null || lightChain.Length == 0) return new AttackStep();
            return lightChain[Mathf.Clamp(index, 0, lightChain.Length - 1)];
        }

        public int LightChainLength => lightChain == null || lightChain.Length == 0 ? 1 : lightChain.Length;
    }
}
