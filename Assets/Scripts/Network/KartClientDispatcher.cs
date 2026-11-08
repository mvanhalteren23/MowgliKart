using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.AddressableAssets;
using UnityEngine.AddressableAssets.ResourceLocators;
using UnityEngine.ResourceManagement.AsyncOperations;
using UnityEngine.ResourceManagement.ResourceProviders;
using Mirror;
using LegacyVR.KartClient.SystemService;
using LegacyVR.KartRacing.CameraSystem;

namespace LegacyVR.KartRacing.Networking
{
    /// <summary>
    /// Persistent NetworkBehaviour attached to each client's player object.
    /// Supports loading external Addressable Content Catalogs for future games as well as
    /// Addressable scenes and "Player 1" UI leader privileges.
    /// </summary>
    [RequireComponent(typeof(NetworkIdentity))]
    public class KartClientDispatcher : NetworkBehaviour
    {
        public const string LeaderControlUiTag = "LeaderControlUI";

        public static KartClientDispatcher LocalInstance { get; private set; }

        [SyncVar] public int CurrentSessionId = -1;
        [SyncVar] public bool IsPlayerOneLeader;
        [SyncVar] public int AssignedGridSlot;

        private readonly HashSet<string> _loadedCatalogUrls = new HashSet<string>();
        private AsyncOperationHandle<SceneInstance> _currentSceneHandle;
        private bool _hasLoadedAddressableScene;
        private bool _isTransitioningScene;

        public override void OnStartLocalPlayer()
        {
            base.OnStartLocalPlayer();
            LocalInstance = this;
            DontDestroyOnLoad(gameObject);
        }

        /// <summary>
        /// Dispatched by MasterKartNetworkManager on the Windows Laptop to a specific Pico headset.
        /// Optionally loads a secondary remote Addressables catalog before loading the target scene.
        /// </summary>
        [TargetRpc]
        public void TargetLoadAddressableScene(
            NetworkConnection target,
            string addressableSceneKey,
            string remoteCatalogUrl,
            string gameModuleId,
            int sessionId,
            bool isLeader,
            int assignedGridSlot,
            byte cameraRigMode)
        {
            if (_isTransitioningScene)
            {
                Debug.LogWarning($"[KartClientDispatcher] Scene transition already in progress. Ignoring '{addressableSceneKey}'.");
                return;
            }

            CurrentSessionId = sessionId;
            IsPlayerOneLeader = isLeader;
            AssignedGridSlot = assignedGridSlot;

            if (Pico3DoFKartCameraRig.Instance != null)
            {
                Pico3DoFKartCameraRig.Instance.SetTrackingMode((CameraRigTrackingMode)cameraRigMode);
            }

            StartCoroutine(LoadAddressableSceneRoutine(
                addressableSceneKey,
                remoteCatalogUrl,
                gameModuleId,
                sessionId,
                isLeader,
                assignedGridSlot
            ));
        }

        private IEnumerator LoadAddressableSceneRoutine(
            string addressableSceneKey,
            string remoteCatalogUrl,
            string gameModuleId,
            int sessionId,
            bool isLeader,
            int assignedGridSlot)
        {
            _isTransitioningScene = true;

            // Lower background loading thread priority to avoid starving the 70Hz ATW VR compositor on Snapdragon 820
            ThreadPriority previousPriority = Application.backgroundLoadingPriority;
            Application.backgroundLoadingPriority = ThreadPriority.Low;

            // 1. If a future game specifies an external catalog URL on the local 5GHz HTTP server, load it first
            if (!string.IsNullOrWhiteSpace(remoteCatalogUrl) && !_loadedCatalogUrls.Contains(remoteCatalogUrl))
            {
                bool catalogSucceeded = false;
                AsyncOperationHandle<IResourceLocator> catalogHandle =
                    Addressables.LoadContentCatalogAsync(remoteCatalogUrl, true);

                // autoRelease=true frees the handle right after completion callbacks, so capture the result there
                // instead of touching catalogHandle.Status after the yield.
                catalogHandle.Completed += op => catalogSucceeded = op.Status == AsyncOperationStatus.Succeeded;

                yield return catalogHandle;

                if (catalogSucceeded)
                {
                    _loadedCatalogUrls.Add(remoteCatalogUrl);
                    Debug.Log($"[KartClientDispatcher] Loaded external game catalog: {remoteCatalogUrl}");
                }
                else
                {
                    Debug.LogError($"[KartClientDispatcher] Failed to load external catalog '{remoteCatalogUrl}'");
                }
            }

            // 2. Release previous Addressable scene bundle to stay strictly under the 1.5 GB RAM budget on Pico G1
            bool previousSceneStillHeld = false;
            if (_hasLoadedAddressableScene && _currentSceneHandle.IsValid())
            {
                if (SceneManager.sceneCount > 1)
                {
                    yield return Addressables.UnloadSceneAsync(_currentSceneHandle, true);
                    _hasLoadedAddressableScene = false;
                }
                else
                {
                    // Unity refuses to unload the only loaded scene; the Single-mode load below replaces it,
                    // and the stale handle is released once the new scene is active.
                    previousSceneStillHeld = true;
                }
            }

            AsyncOperationHandle<SceneInstance> staleHandle = _currentSceneHandle;

            yield return Resources.UnloadUnusedAssets();
            System.GC.Collect();

            // 3. Load the target Addressable scene in Single mode
            AsyncOperationHandle<SceneInstance> loadHandle = Addressables.LoadSceneAsync(
                addressableSceneKey,
                LoadSceneMode.Single,
                true,
                100
            );

            while (!loadHandle.IsDone)
            {
                yield return null;
            }

            if (loadHandle.Status == AsyncOperationStatus.Succeeded)
            {
                if (previousSceneStillHeld && staleHandle.IsValid())
                {
                    Addressables.Release(staleHandle);
                }

                _currentSceneHandle = loadHandle;
                _hasLoadedAddressableScene = true;

                ConfigureInGameLeaderUI(isLeader);

                string mac = PicoKioskController.Instance != null
                    ? PicoKioskController.Instance.CachedMacAddress
                    : SystemInfo.deviceUniqueIdentifier;

                NetworkClient.Send(new ClientSceneReadyMessage
                {
                    MacAddress = mac,
                    SessionId = sessionId,
                    GameModuleId = gameModuleId,
                    LoadedSceneKey = addressableSceneKey,
                    IsPlayerOneLeader = isLeader,
                    AssignedGridSlot = assignedGridSlot
                });
            }
            else
            {
                Debug.LogError($"[KartClientDispatcher] Failed to load Addressable scene '{addressableSceneKey}': {loadHandle.OperationException}");
            }

            Application.backgroundLoadingPriority = previousPriority;
            _isTransitioningScene = false;
        }

        /// <summary>
        /// Enables the "LeaderControlUI" canvas only for the Player 1 headset.
        /// Searches inactive objects too, because the canvas ships disabled in the track scene.
        /// </summary>
        private void ConfigureInGameLeaderUI(bool isLeader)
        {
            Canvas[] canvases = FindObjectsOfType<Canvas>(true);
            for (int i = 0; i < canvases.Length; i++)
            {
                if (canvases[i].CompareTag(LeaderControlUiTag))
                {
                    canvases[i].gameObject.SetActive(isLeader);
                }
            }
        }

        public void RequestLeaderSessionCommand(byte commandType)
        {
            if (!isLocalPlayer || !IsPlayerOneLeader)
                return;

            NetworkClient.Send(new LeaderSessionCommandMessage
            {
                SessionId = CurrentSessionId,
                CommandType = commandType
            });
        }

        [TargetRpc]
        public void TargetReceiveLeaderCommand(NetworkConnection target, int sessionId, byte commandType)
        {
            Debug.Log($"[KartClientDispatcher] Session {sessionId} received Leader Command: {commandType}");
        }
    }
}
