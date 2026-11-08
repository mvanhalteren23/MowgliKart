using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace LegacyVR.KartClient.SystemService
{
    /// <summary>
    /// Lives in BootScene (build index 0). Gives the Pico SDK, ToBService and the NetworkManager a few frames to
    /// initialise, then loads the lobby HubScene. Everything persistent was already marked DontDestroyOnLoad.
    /// </summary>
    public class BootLoader : MonoBehaviour
    {
        [SerializeField] private string hubSceneName = "HubScene";
        [SerializeField] private int framesToWait = 5;

        private IEnumerator Start()
        {
            for (int i = 0; i < framesToWait; i++)
            {
                yield return null;
            }

            SceneManager.LoadScene(hubSceneName, LoadSceneMode.Single);
        }
    }
}
