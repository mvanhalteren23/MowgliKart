using System;
using System.Collections;
using UnityEngine;
using Mirror;
using Mirror.Discovery;

namespace LegacyVR.KartRacing.Networking
{
    /// <summary>
    /// Headset side: finds the Mac master on the local network (UDP broadcast via Mirror NetworkDiscovery) and keeps
    /// the connection alive without any on-headset UI. Falls back to a fixed address when manualServerAddress is set
    /// (useful when the router blocks broadcast). Reconnects automatically after Wi-Fi drops or a server restart.
    /// </summary>
    public class KartClientAutoConnect : MonoBehaviour
    {
        [Tooltip("Optional. Leave empty to auto-discover the Mac on the LAN. Example: 192.168.1.20")]
        [SerializeField] private string manualServerAddress = "";

        [SerializeField] private float retrySeconds = 3f;
        [SerializeField] private float discoveryTimeoutSeconds = 8f;
        [SerializeField] private bool autoStart = true;

        private NetworkDiscovery _discovery;
        private Uri _foundServer;

        public static KartClientAutoConnect Instance { get; private set; }

        public string Status { get; private set; } = "Idle";

        private void Awake()
        {
            Instance = this;
        }

        private void Start()
        {
            if (!autoStart)
                return;

            StartCoroutine(ConnectLoop());
        }

        private IEnumerator ConnectLoop()
        {
            var wait = new WaitForSecondsRealtime(retrySeconds);

            // NetworkManager prefab is instantiated in the same scene; give it a frame to run Awake/Start.
            yield return null;

            _discovery = FindObjectOfType<NetworkDiscovery>();
            if (_discovery != null)
            {
                _discovery.OnServerFound.AddListener(OnServerFound);
            }

            while (true)
            {
                NetworkManager manager = NetworkManager.singleton;

                if (manager != null && !NetworkClient.active && !NetworkServer.active)
                {
                    if (!string.IsNullOrWhiteSpace(manualServerAddress))
                    {
                        Status = $"Connecting to {manualServerAddress}";
                        manager.networkAddress = manualServerAddress.Trim();
                        manager.StartClient();
                    }
                    else if (_discovery != null)
                    {
                        Status = "Searching for master on LAN";
                        _foundServer = null;
                        _discovery.StartDiscovery();

                        float waited = 0f;
                        while (_foundServer == null && waited < discoveryTimeoutSeconds)
                        {
                            waited += Time.unscaledDeltaTime;
                            yield return null;
                        }

                        _discovery.StopDiscovery();

                        if (_foundServer != null)
                        {
                            Status = $"Connecting to {_foundServer.Host}";
                            manager.StartClient(_foundServer);
                        }
                    }
                    else
                    {
                        Status = "No NetworkDiscovery component and no manual address";
                    }
                }
                else if (NetworkClient.isConnected)
                {
                    Status = "Connected";
                }

                yield return wait;
            }
        }

        private void OnServerFound(ServerResponse response)
        {
            _foundServer = response.uri;
        }

        private void OnDestroy()
        {
            if (_discovery != null)
            {
                _discovery.OnServerFound.RemoveListener(OnServerFound);
            }
        }
    }
}
