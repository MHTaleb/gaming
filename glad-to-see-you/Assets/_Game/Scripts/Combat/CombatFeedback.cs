using System.Collections.Generic;
using GladToSeeYou.Audio;
using GladToSeeYou.CameraRig;
using GladToSeeYou.Core;
using GladToSeeYou.Data;
using GladToSeeYou.UI;
using GladToSeeYou.VFX;
using UnityEngine;

namespace GladToSeeYou.Combat
{
    /// <summary>
    /// The deliberate boundary between "damage happened" (gameplay) and how it looks/sounds/feels.
    /// Subscribes to damage/death events and drives VFX, SFX, camera impulse, damage numbers, hit flash.
    /// Gameplay code must NEVER reference this class.
    /// </summary>
    public class CombatFeedback : MonoBehaviour
    {
        [Header("Data (wired by the factory)")]
        [SerializeField] private VFXData hitSpark;
        [SerializeField] private VFXData heavySpark;
        [SerializeField] private VFXData deathBurst;
        [SerializeField] private AudioEvent hitLightSound;
        [SerializeField] private AudioEvent hitHeavySound;
        [SerializeField] private AudioEvent deathSound;

        [Header("Services")]
        [SerializeField] private VFXService vfxService;
        [SerializeField] private AudioService audioService;
        [SerializeField] private ThirdPersonCameraRig cameraRig;
        [SerializeField] private DamageNumberSpawner damageNumbers;

        private readonly Dictionary<int, Renderer[]> _rendererCache = new Dictionary<int, Renderer[]>();
        private readonly Dictionary<int, Coroutine> _flashRoutines = new Dictionary<int, Coroutine>();

        public void Configure(VFXService vfx, AudioService audio, ThirdPersonCameraRig rig, DamageNumberSpawner numbers,
            VFXData spark, VFXData heavy, VFXData death, AudioEvent light, AudioEvent heavySfx, AudioEvent deathSfx)
        {
            vfxService = vfx;
            audioService = audio;
            cameraRig = rig;
            damageNumbers = numbers;
            hitSpark = spark;
            heavySpark = heavy;
            deathBurst = death;
            hitLightSound = light;
            hitHeavySound = heavySfx;
            deathSound = deathSfx;
        }

        private void OnEnable()
        {
            EventBus.DamageApplied += OnDamageApplied;
            EventBus.Died += OnDied;
        }

        private void OnDisable()
        {
            EventBus.DamageApplied -= OnDamageApplied;
            EventBus.Died -= OnDied;
        }

        private void OnDamageApplied(DamageInfo info, GameObject victim)
        {
            bool heavy = info.IsHeavy;
            float intensity = Mathf.Clamp01(info.Amount / 40f) + 0.25f;

            if (vfxService != null)
            {
                vfxService.Play(heavy ? heavySpark : hitSpark, info.Point, -info.Direction, intensity);
            }

            if (audioService != null)
            {
                audioService.Play(heavy ? hitHeavySound : hitLightSound, info.Point);
            }

            if (cameraRig != null)
            {
                cameraRig.AddImpulse((heavy ? 0.09f : 0.045f) * intensity, info.Point);
            }

            // Damage numbers only when the player hits an enemy (enemy hitting player = HUD feedback).
            if (damageNumbers != null && victim != null && victim.TryGetComponent<Health>(out var health))
            {
                if (health.Team == Team.Enemy && info.SourceTeam == Team.Player)
                {
                    damageNumbers.Spawn(info.Amount, info.Point, heavy);
                }
            }

            if (victim != null && victim.TryGetComponent<Health>(out var victimHealth) && victimHealth.Team == Team.Enemy)
            {
                FlashVictim(victim);
            }
        }

        private void OnDied(GameObject who)
        {
            if (who == null) return;
            var position = who.transform.position + Vector3.up * 0.9f;
            if (vfxService != null) vfxService.Play(deathBurst, position, Vector3.up, 1f);
            if (audioService != null) audioService.Play(deathSound, position);
        }

        private void FlashVictim(GameObject victim)
        {
            int id = victim.GetInstanceID();
            if (!_rendererCache.TryGetValue(id, out var renderers) || renderers == null || renderers.Length == 0)
            {
                renderers = victim.GetComponentsInChildren<Renderer>();
                _rendererCache[id] = renderers;
            }

            if (_flashRoutines.TryGetValue(id, out var running) && running != null)
            {
                StopCoroutine(running);
            }

            _flashRoutines[id] = StartCoroutine(FlashRoutine(renderers, new Color(1f, 0.45f, 0.3f, 1f), 0.09f));
        }

        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");

        private System.Collections.IEnumerator FlashRoutine(Renderer[] renderers, Color color, float duration)
        {
            var block = new MaterialPropertyBlock();
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i] == null) continue;
                renderers[i].GetPropertyBlock(block);
                block.SetColor(BaseColorId, color);
                renderers[i].SetPropertyBlock(block);
            }

            yield return new WaitForSeconds(duration);

            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i] == null) continue;
                renderers[i].SetPropertyBlock(null);
            }
        }
    }
}
