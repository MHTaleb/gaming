using UnityEngine;

namespace GladToSeeYou.Core
{
    /// <summary>
    /// Named physics layers, created by the editor bootstrap (Glad To See You ▸ Bootstrap ▸ 1. Setup Project).
    /// Never hard-code layer indices in gameplay code — always go through these members.
    /// </summary>
    public static class PhysicsLayers
    {
        public const string PlayerName = "Player";
        public const string EnemyName = "Enemy";
        public const string GroundName = "Ground";
        public const string FxName = "Fx";

        private static readonly string[] AllNames = { PlayerName, EnemyName, GroundName, FxName };
        private static int[] _indices = new int[AllNames.Length];

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void ResetCache()
        {
            _indices = CreateCache();
        }

        private static int[] CreateCache()
        {
            var result = new int[AllNames.Length];
            for (int i = 0; i < AllNames.Length; i++) result[i] = -1;
            return result;
        }

        private static int Resolve(int slot)
        {
            if (_indices == null || _indices.Length != AllNames.Length) _indices = CreateCache();
            if (_indices[slot] < 0)
            {
                _indices[slot] = LayerMask.NameToLayer(AllNames[slot]);
                if (_indices[slot] < 0)
                {
                    Debug.LogWarning($"[PhysicsLayers] Layer '{AllNames[slot]}' does not exist. " +
                                     "Run 'Glad to See You ▸ Bootstrap ▸ 1. Setup Project'. Falling back to Default.");
                    _indices[slot] = 0;
                }
            }

            return _indices[slot];
        }

        public static int Player => Resolve(0);
        public static int Enemy => Resolve(1);
        public static int Ground => Resolve(2);
        public static int Fx => Resolve(3);

        public static int PlayerMask => 1 << Player;
        public static int EnemyMask => 1 << Enemy;
        public static int GroundMask => 1 << Ground;

        /// <summary>Layers a player attack can hit.</summary>
        public static int PlayerAttackMask => 1 << Enemy;

        /// <summary>Layers an enemy attack can hit.</summary>
        public static int EnemyAttackMask => 1 << Player;

        /// <summary>Stable name for tools/tests.</summary>
        public static string[] Names => (string[])AllNames.Clone();
    }
}
