using GladToSeeYou.Audio;
using GladToSeeYou.CameraRig;
using GladToSeeYou.Combat;
using GladToSeeYou.Input;
using GladToSeeYou.Player;
using GladToSeeYou.Save;
using GladToSeeYou.VFX;
using UnityEngine;

namespace GladToSeeYou.Core
{
    /// <summary>
    /// Composition root: creates/wires services and exposes them via a tiny registry.
    /// Contains NO gameplay logic. One instance per scene (the slice has exactly one scene).
    /// </summary>
    public class GameRoot : MonoBehaviour
    {
        public static GameRoot Instance { get; private set; }

        public InputRouter Input { get; private set; }
        public AudioService Audio { get; private set; }
        public VFXService Vfx { get; private set; }
        public HitStopService HitStop { get; private set; }
        public QualityProfileService Quality { get; private set; }
        public SaveService Save { get; private set; }
        public ThirdPersonCameraRig CameraRig { get; private set; }
        public PlayerRoot Player { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Debug.LogWarning($"[GameRoot] Duplicate instance on '{name}' destroyed.", this);
                Destroy(gameObject);
                return;
            }

            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        /// <summary>Called once by the scene factory after all services exist.</summary>
        public void Wire(InputRouter input, AudioService audio, VFXService vfx, HitStopService hitStop,
            QualityProfileService quality, SaveService save, ThirdPersonCameraRig cameraRig, PlayerRoot player)
        {
            Input = input;
            Audio = audio;
            Vfx = vfx;
            HitStop = hitStop;
            Quality = quality;
            Save = save;
            CameraRig = cameraRig;
            Player = player;

            quality?.ApplyCurrentProfile();
        }

        public static bool TryGet(out GameRoot root)
        {
            root = Instance;
            return root != null;
        }
    }
}
