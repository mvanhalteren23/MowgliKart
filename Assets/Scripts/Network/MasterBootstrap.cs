using System;
using System.IO;
using UnityEngine;
using Mirror;
using Mirror.Discovery;
using LegacyVR.KartRacing.Networking.Local;

namespace LegacyVR.KartRacing.Networking
{
    /// <summary>
    /// Mac/Windows master side. One call starts everything a headset needs to find and use this machine:
    ///   1. the Mirror server (KCP/UDP 7777) for up to 8 headsets,
    ///   2. UDP discovery advertising (47777) so headsets auto-find the Mac,
    ///   3. the built-in HTTP content server (8080) hosting Addressables catalogs/bundles from ContentFolder.
    /// </summary>
    public class MasterBootstrap : MonoBehaviour
    {
        [SerializeField] private bool autoStartOnLaunch = true;
        [SerializeField] private int targetFrameRate = 30;

        [Tooltip("Folder served at http://<mac-ip>:8080/. Empty = ~/MowgliKart/ServerData")]
        [SerializeField] private string contentFolderOverride = "";

        private LocalContentServer _content;
        private NetworkDiscovery _discovery;

        public string ContentFolder { get; private set; }
        public string ContentStatus { get; private set; } = "Stopped";
        public bool DiscoveryAdvertising { get; private set; }
        public bool IsRunning => NetworkServer.active;
        public long ContentRequestsServed => _content?.RequestsServed ?? 0;

        public string ContentUrlBase
        {
            get
            {
                MasterKartNetworkManager m = MasterKartNetworkManager.singleton;
                return $"http://{(m != null ? m.ServerLanAddress : null) ?? "127.0.0.1"}:{MasterKartNetworkManager.ContentServerPort}/";
            }
        }

        private void Awake()
        {
            // The laptop only relays 8 kinematic karts at 20 Hz: no reason to spend 100% CPU on rendering the panel.
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = Mathf.Max(10, targetFrameRate);
            Application.runInBackground = true;

            ContentFolder = string.IsNullOrWhiteSpace(contentFolderOverride)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Personal), "MowgliKart", "ServerData")
                : contentFolderOverride;
        }

        private System.Collections.IEnumerator Start()
        {
            // Let NetworkManager / NetworkDiscovery finish Awake+Start first (discovery generates its ServerId in Start).
            yield return null;
            _discovery = FindObjectOfType<NetworkDiscovery>();

            if (autoStartOnLaunch)
            {
                StartAll();
            }
        }

        public void StartAll()
        {
            MasterKartNetworkManager manager = MasterKartNetworkManager.singleton;
            if (manager == null)
            {
                Debug.LogError("[MasterBootstrap] No MasterKartNetworkManager in the scene.");
                return;
            }

            manager.RefreshLanAddress();

            if (!NetworkServer.active)
            {
                manager.StartServer();
            }

            StartDiscoveryAdvertising();
            StartContentServer();
        }

        public void StopAll()
        {
            StopContentServer();

            if (_discovery != null)
            {
                _discovery.StopDiscovery();
            }
            DiscoveryAdvertising = false;

            if (NetworkServer.active)
            {
                MasterKartNetworkManager.singleton.StopServer();
            }
        }

        public void OpenContentFolder()
        {
            Directory.CreateDirectory(ContentFolder);
            Application.OpenURL("file://" + ContentFolder);
        }

        private void StartDiscoveryAdvertising()
        {
            if (_discovery == null)
            {
                Debug.LogWarning("[MasterBootstrap] No NetworkDiscovery component; headsets must use a manual server address.");
                return;
            }

            try
            {
                _discovery.AdvertiseServer();
                DiscoveryAdvertising = true;
            }
            catch (Exception ex)
            {
                // Typically: UDP port 47777 already used by a second copy of the master app.
                DiscoveryAdvertising = false;
                Debug.LogError($"[MasterBootstrap] Discovery advertising failed: {ex.Message}");
            }
        }

        private void StartContentServer()
        {
            try
            {
                Directory.CreateDirectory(Path.Combine(ContentFolder, "Android"));
                WriteReadmeOnce();

                _content?.Dispose();
                _content = new LocalContentServer(ContentFolder, MasterKartNetworkManager.ContentServerPort);
                _content.Log += message => Debug.Log($"[ContentServer] {message}");
                _content.Start();
                ContentStatus = $"Serving {ContentFolder} at {ContentUrlBase}";
            }
            catch (Exception ex)
            {
                ContentStatus = $"Content server failed: {ex.Message}";
                Debug.LogError($"[MasterBootstrap] {ContentStatus}");
            }
        }

        private void StopContentServer()
        {
            _content?.Dispose();
            _content = null;
            ContentStatus = "Stopped";
        }

        private void WriteReadmeOnce()
        {
            string readme = Path.Combine(ContentFolder, "README.txt");
            if (File.Exists(readme))
                return;

            File.WriteAllText(readme,
                "MowgliKart content folder (served over HTTP on port 8080).\n\n" +
                "Put Addressables build output here, one folder per platform, e.g.\n" +
                "  Android/catalog_newgame.json\n" +
                "  Android/catalog_newgame.hash\n" +
                "  Android/*.bundle\n\n" +
                "In the NetworkManager's game module use RemoteCatalogUrl:\n" +
                "  http://{SERVER_IP}:8080/Android/catalog_newgame.json\n" +
                "{SERVER_IP} is replaced with this machine's LAN address when a game is launched.\n");
        }

        private void OnApplicationQuit()
        {
            StopContentServer();
        }

        private void OnDestroy()
        {
            StopContentServer();
        }
    }
}
