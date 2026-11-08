using UnityEngine;

namespace LegacyVR.KartClient.SystemService
{
    /// <summary>
    /// Marks a bootstrap root (Pvr_UnitySDK, ControllerManager, NetworkManager...) as DontDestroyOnLoad so the
    /// resident systems survive Addressable scene swaps and Return-To-Hub. Roots only.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public class PersistAcrossScenes : MonoBehaviour
    {
        private void Awake()
        {
            if (transform.parent == null)
            {
                DontDestroyOnLoad(gameObject);
            }
        }
    }
}
