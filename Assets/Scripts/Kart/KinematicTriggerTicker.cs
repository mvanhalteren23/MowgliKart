using UnityEngine;

namespace LegacyVR.KartRacing.Kart
{
    /// <summary>
    /// ProjectSettings disables Physics auto-simulation (the PhysX solver never runs at the 70 Hz frame rate).
    /// Unity only raises OnTriggerEnter/Stay/Exit from a physics step, so without a step the kart bump and
    /// boost-pad triggers would never fire. This ticker runs one tiny step at 20 Hz. Every body in the
    /// project is kinematic, so the step only performs broadphase overlap detection and trigger dispatch -
    /// no dynamics, no collision response, no gravity.
    /// Installs itself automatically; no scene wiring is required.
    /// </summary>
    public sealed class KinematicTriggerTicker : MonoBehaviour
    {
        public const float TickInterval = 0.05f; // 20 Hz, matches ProjectSettings Fixed Timestep

        private float _accumulator;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            if (FindObjectOfType<KinematicTriggerTicker>() != null)
                return;

            var go = new GameObject("KinematicTriggerTicker");
            go.hideFlags = HideFlags.HideInHierarchy;
            DontDestroyOnLoad(go);
            go.AddComponent<KinematicTriggerTicker>();
        }

        private void Update()
        {
            if (Physics.autoSimulation)
                return; // Project is not configured for manual stepping (e.g. in a test scene); do nothing.

            // Cap the catch-up so a long scene load can never trigger a burst of steps on the Snapdragon 820.
            _accumulator = Mathf.Min(_accumulator + Time.unscaledDeltaTime, TickInterval * 2f);

            if (_accumulator >= TickInterval)
            {
                _accumulator -= TickInterval;
                Physics.Simulate(TickInterval);
            }
        }
    }
}
