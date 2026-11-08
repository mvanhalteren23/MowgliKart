using System;
using System.Collections.Generic;
using UnityEngine;
using Mirror;
using LegacyVR.KartClient.SystemService;

namespace LegacyVR.KartRacing.Networking
{
    /// <summary>
    /// Defines a pluggable VR game module (Kart Racing or any future game added to the platform).
    /// </summary>
    [Serializable]
    public class GameModuleDescriptor
    {
        [Tooltip("Unique identifier for this game module (e.g., 'KartRacing_Track01', 'CyberTurret_Arena').")]
        public string GameModuleId = "KartRacing_Track01";

        [Tooltip("Addressable scene key to load on dispatched headsets.")]
        public string AddressableSceneKey = "Assets/Scenes/Tracks/Track01.unity";

        [Tooltip("Optional HTTP URL to an external Addressables catalog.json on the Windows Laptop for future games.")]
        public string RemoteCatalogUrl = "";

        [Tooltip("Networked player vehicle/avatar prefab spawned for each client in this game (must also be in spawnPrefabs).")]
        public GameObject PlayerAvatarPrefab;

        [Tooltip("3DoF camera rig decoupling behavior for this game.")]
        public CameraRigTrackingMode CameraTrackingMode = CameraRigTrackingMode.VehicleHorizonLocked;

        [Tooltip("Grid/Arena spawn spacing (in meters) when scene-specific spawn points are not yet bound.")]
        public float DefaultSlotSpacing = 2.5f;
    }

    [Serializable]
    public class RegisteredHeadsetRecord
    {
        public int ConnectionId;
        public NetworkConnectionToClient Connection;
        public string MacAddress;
        public string SerialNumber;
        public string DeviceModel;
        public int BatteryPercent;
        public int AssignedSessionId = -1;
        public string AssignedGameModuleId = "Hub";
        public bool IsPlayerOneLeader;
        public int AssignedGridSlot;
        public string ActiveSceneKey = "HubScene";
        public bool IsSceneLoadedAndReady;
        public KartClientDispatcher Dispatcher;
        public NetworkIdentity SpawnedAvatar;
    }

    [Serializable]
    public class RaceSessionGroup
    {
        public int SessionId;
        public string GameModuleId;
        public string AddressableSceneKey;
        public string LeaderMacAddress;
        public List<string> MemberMacAddresses = new List<string>(13);
        public List<NetworkIdentity> SpawnedSessionAvatars = new List<NetworkIdentity>(13);
    }

    /// <summary>
    /// Custom Mirror NetworkManager running on the Windows Master Control Server (and Thin Client APK).
    /// Supports Kart Racing and future VR game modules via GameModuleDescriptor registry and Remote Catalogs.
    /// </summary>
    public class MasterKartNetworkManager : NetworkManager
    {
        public const int MaxHeadsets = 13;
        public const int KinematicSendRateHz = 20;

        public static new MasterKartNetworkManager singleton => (MasterKartNetworkManager)NetworkManager.singleton;

        [Header("Core Hub Dispatcher Prefab")]
        [Tooltip("Persistent dispatcher prefab with NetworkIdentity spawned per connected headset.")]
        [SerializeField] private GameObject clientDispatcherPrefab;

        [Header("Multi-Game Module Registry (Kart Racing + Future Games)")]
        [SerializeField] private List<GameModuleDescriptor> registeredGameModules = new List<GameModuleDescriptor>();

        [Tooltip("Fallback kinematic kart prefab if no module-specific prefab is assigned.")]
        [SerializeField] private GameObject defaultKinematicKartPrefab;

        [Tooltip("Optional ordered spawn transforms in the active scene.")]
        [SerializeField] private Transform[] sceneSpawnPoints;

        private readonly Dictionary<string, RegisteredHeadsetRecord> _registryByMac =
            new Dictionary<string, RegisteredHeadsetRecord>(16, StringComparer.OrdinalIgnoreCase);

        private readonly Dictionary<int, RegisteredHeadsetRecord> _registryByConnId =
            new Dictionary<int, RegisteredHeadsetRecord>(16);

        private readonly Dictionary<int, RaceSessionGroup> _activeSessions =
            new Dictionary<int, RaceSessionGroup>(4);

        private readonly Dictionary<string, GameModuleDescriptor> _modulesById =
            new Dictionary<string, GameModuleDescriptor>(StringComparer.OrdinalIgnoreCase);

        /// <summary>Read-only views used by the Windows operator panel.</summary>
        public IEnumerable<RegisteredHeadsetRecord> RegisteredHeadsets => _registryByMac.Values;
        public IReadOnlyList<GameModuleDescriptor> GameModules => registeredGameModules;
        public IReadOnlyDictionary<int, RaceSessionGroup> ActiveSessions => _activeSessions;
        public int RegisteredHeadsetCount => _registryByMac.Count;

        public event Action<RegisteredHeadsetRecord> OnHeadsetRegistered;
        public event Action<string> OnHeadsetDisconnected;
        public event Action<int, string> OnHeadsetSceneReady;

        public override void Awake()
        {
            ApplyKinematicNetworkSettings();
            base.Awake();
            RebuildModuleLookup();
        }

        public override void OnValidate()
        {
            ApplyKinematicNetworkSettings();
            base.OnValidate();
        }

        /// <summary>
        /// Snapdragon 820 budget: 20 Hz tick, 13 headsets, 110 ms snapshot interpolation buffer (2.2 x 50 ms).
        /// Applied in code as well as on the prefab so the values can never silently drift.
        /// </summary>
        private void ApplyKinematicNetworkSettings()
        {
            sendRate = KinematicSendRateHz;
            maxConnections = MaxHeadsets;

            // Mirror's NetworkManager requires a playerPrefab when autoCreatePlayer is on, even though
            // OnServerAddPlayer is overridden below to spawn the dispatcher instead.
            if (playerPrefab == null && clientDispatcherPrefab != null)
            {
                playerPrefab = clientDispatcherPrefab;
            }

            snapshotSettings.bufferTimeMultiplier = 2.2;
            snapshotSettings.bufferLimit = 32;
            snapshotSettings.catchupPositiveThreshold = 4.0f;
            snapshotSettings.catchupSpeed = 0.10;
            snapshotSettings.slowdownSpeed = 0.04;
            // Fixed 110 ms buffer per the spec; Mirror's dynamic adjustment would otherwise override it.
            snapshotSettings.dynamicAdjustment = false;
        }

        private void RebuildModuleLookup()
        {
            _modulesById.Clear();
            foreach (GameModuleDescriptor module in registeredGameModules)
            {
                if (module != null && !string.IsNullOrWhiteSpace(module.GameModuleId))
                {
                    _modulesById[module.GameModuleId.Trim()] = module;
                    if (module.PlayerAvatarPrefab != null && !spawnPrefabs.Contains(module.PlayerAvatarPrefab))
                    {
                        spawnPrefabs.Add(module.PlayerAvatarPrefab);
                    }
                }
            }

            if (defaultKinematicKartPrefab != null && !spawnPrefabs.Contains(defaultKinematicKartPrefab))
            {
                spawnPrefabs.Add(defaultKinematicKartPrefab);
            }
        }

        /// <summary>
        /// Allows registering new game modules at runtime on the Windows Master Server.
        /// </summary>
        public void RegisterGameModuleAtRuntime(GameModuleDescriptor newModule)
        {
            if (newModule == null || string.IsNullOrWhiteSpace(newModule.GameModuleId))
                return;

            registeredGameModules.Add(newModule);
            _modulesById[newModule.GameModuleId.Trim()] = newModule;

            if (newModule.PlayerAvatarPrefab != null && !spawnPrefabs.Contains(newModule.PlayerAvatarPrefab))
            {
                spawnPrefabs.Add(newModule.PlayerAvatarPrefab);
            }
        }

        #region Server Lifecycle & Message Handlers

        public override void OnStartServer()
        {
            base.OnStartServer();
            RebuildModuleLookup();

            NetworkServer.RegisterHandler<DeviceRegistrationMessage>(OnServerReceiveDeviceRegistration, false);
            NetworkServer.RegisterHandler<ClientSceneReadyMessage>(OnServerReceiveClientSceneReady, false);
            NetworkServer.RegisterHandler<LeaderSessionCommandMessage>(OnServerReceiveLeaderCommand, false);

            Debug.Log($"[MasterServer] Started for up to {maxConnections} headsets at {sendRate} Hz tick rate. Registered Game Modules: {_modulesById.Count}");
        }

        public override void OnServerConnect(NetworkConnectionToClient conn)
        {
            base.OnServerConnect(conn);
            Debug.Log($"[MasterServer] Raw socket connected: connectionId={conn.connectionId}, IP={conn.address}");
        }

        public override void OnServerAddPlayer(NetworkConnectionToClient conn)
        {
            GameObject dispatcherObj = Instantiate(clientDispatcherPrefab);
            DontDestroyOnLoad(dispatcherObj);
            NetworkServer.AddPlayerForConnection(conn, dispatcherObj);

            KartClientDispatcher dispatcher = dispatcherObj.GetComponent<KartClientDispatcher>();
            if (_registryByConnId.TryGetValue(conn.connectionId, out RegisteredHeadsetRecord record))
            {
                record.Dispatcher = dispatcher;
            }
        }

        public override void OnServerDisconnect(NetworkConnectionToClient conn)
        {
            if (_registryByConnId.TryGetValue(conn.connectionId, out RegisteredHeadsetRecord record))
            {
                Debug.Log($"[MasterServer] Headset Disconnected: MAC={record.MacAddress}, SN={record.SerialNumber}");

                // A re-registered headset may already own a newer record under the same MAC; only drop our own.
                if (_registryByMac.TryGetValue(record.MacAddress, out RegisteredHeadsetRecord current) && current == record)
                {
                    _registryByMac.Remove(record.MacAddress);
                }

                _registryByConnId.Remove(conn.connectionId);
                OnHeadsetDisconnected?.Invoke(record.MacAddress);
            }

            base.OnServerDisconnect(conn);
        }

        private void OnServerReceiveDeviceRegistration(NetworkConnectionToClient conn, DeviceRegistrationMessage msg)
        {
            string macKey = string.IsNullOrWhiteSpace(msg.MacAddress)
                ? $"CONN_{conn.connectionId}"
                : msg.MacAddress.Trim().ToUpperInvariant();

            if (!_registryByMac.TryGetValue(macKey, out RegisteredHeadsetRecord record))
            {
                record = new RegisteredHeadsetRecord();
                _registryByMac[macKey] = record;
            }

            record.ConnectionId = conn.connectionId;
            record.Connection = conn;
            record.MacAddress = macKey;
            record.SerialNumber = msg.SerialNumber;
            record.DeviceModel = msg.DeviceModel;
            record.BatteryPercent = msg.BatteryPercent;
            record.ActiveSceneKey = msg.CurrentLoadedSceneKey;

            if (conn.identity != null)
            {
                record.Dispatcher = conn.identity.GetComponent<KartClientDispatcher>();
            }

            _registryByConnId[conn.connectionId] = record;

            Debug.Log($"[MasterServer] Registered Headset #{_registryByMac.Count}/{MaxHeadsets} | MAC={record.MacAddress} | SN={record.SerialNumber} | Model={record.DeviceModel} | Battery={record.BatteryPercent}%");
            OnHeadsetRegistered?.Invoke(record);
        }

        #endregion

        #region Master Laptop UI Session Grouping & Multi-Game TargetRpc Dispatch

        /// <summary>
        /// Dispatches a registered GameModuleDescriptor (Kart Racing or any future game) to a subset of headsets.
        /// </summary>
        [Server]
        public void DispatchGameModuleSession(
            int sessionId,
            string gameModuleId,
            List<string> selectedMacAddresses,
            string leaderMacAddress)
        {
            if (string.IsNullOrWhiteSpace(gameModuleId) ||
                !_modulesById.TryGetValue(gameModuleId.Trim(), out GameModuleDescriptor module))
            {
                Debug.LogError($"[MasterServer] Unknown GameModuleId '{gameModuleId}'. Register it in registeredGameModules first.");
                return;
            }

            CreateSessionAndDispatchScene(
                sessionId,
                selectedMacAddresses,
                leaderMacAddress,
                module.AddressableSceneKey,
                module.GameModuleId,
                module.RemoteCatalogUrl,
                module.CameraTrackingMode
            );
        }

        /// <summary>
        /// Direct overload allowing the Master Laptop UI to dispatch any Addressable scene key and optional remote catalog.
        /// Groups the selected headsets, destroys prior session avatars, assigns the Player 1 leader and issues a
        /// targeted RPC per headset. Mirror's ServerChangeScene() is deliberately never called.
        /// </summary>
        [Server]
        public void CreateSessionAndDispatchScene(
            int sessionId,
            List<string> selectedMacAddresses,
            string leaderMacAddress,
            string addressableSceneKey,
            string gameModuleId = "KartRacing_Default",
            string remoteCatalogUrl = "",
            CameraRigTrackingMode cameraMode = CameraRigTrackingMode.VehicleHorizonLocked)
        {
            if (selectedMacAddresses == null || selectedMacAddresses.Count == 0)
            {
                Debug.LogWarning("[MasterServer] CreateSessionAndDispatchScene called with no headsets selected.");
                return;
            }

            // Clean up any previously spawned session avatars if re-dispatching an existing session ID
            if (_activeSessions.TryGetValue(sessionId, out RaceSessionGroup previousSession))
            {
                DestroySessionAvatars(previousSession);
            }

            // A headset moving from another session must also lose its old avatar.
            foreach (string rawMac in selectedMacAddresses)
            {
                if (_registryByMac.TryGetValue(rawMac.Trim().ToUpperInvariant(), out RegisteredHeadsetRecord oldRecord))
                {
                    DestroyHeadsetAvatar(oldRecord);
                }
            }

            string normalizedLeader = string.IsNullOrWhiteSpace(leaderMacAddress)
                ? selectedMacAddresses[0].Trim().ToUpperInvariant()
                : leaderMacAddress.Trim().ToUpperInvariant();

            var session = new RaceSessionGroup
            {
                SessionId = sessionId,
                GameModuleId = gameModuleId,
                AddressableSceneKey = addressableSceneKey,
                LeaderMacAddress = normalizedLeader,
                MemberMacAddresses = new List<string>(selectedMacAddresses.Count)
            };

            _activeSessions[sessionId] = session;

            for (int i = 0; i < selectedMacAddresses.Count; i++)
            {
                string mac = selectedMacAddresses[i].Trim().ToUpperInvariant();
                if (!_registryByMac.TryGetValue(mac, out RegisteredHeadsetRecord record) || record.Connection == null)
                {
                    Debug.LogWarning($"[MasterServer] Cannot dispatch disconnected headset MAC={mac}");
                    continue;
                }

                if (record.Dispatcher == null && record.Connection.identity != null)
                {
                    record.Dispatcher = record.Connection.identity.GetComponent<KartClientDispatcher>();
                }

                if (record.Dispatcher == null)
                {
                    Debug.LogError($"[MasterServer] Missing KartClientDispatcher on connectionId={record.ConnectionId}");
                    continue;
                }

                bool isLeader = string.Equals(mac, session.LeaderMacAddress, StringComparison.OrdinalIgnoreCase);
                int gridSlot = i;

                record.AssignedSessionId = sessionId;
                record.AssignedGameModuleId = gameModuleId;
                record.IsPlayerOneLeader = isLeader;
                record.AssignedGridSlot = gridSlot;
                record.IsSceneLoadedAndReady = false;
                session.MemberMacAddresses.Add(mac);

                record.Dispatcher.TargetLoadAddressableScene(
                    record.Connection,
                    addressableSceneKey,
                    remoteCatalogUrl ?? string.Empty,
                    gameModuleId,
                    sessionId,
                    isLeader,
                    gridSlot,
                    (byte)cameraMode
                );
            }
        }

        [Server]
        private void DestroySessionAvatars(RaceSessionGroup session)
        {
            foreach (NetworkIdentity oldIdentity in session.SpawnedSessionAvatars)
            {
                if (oldIdentity != null)
                {
                    NetworkServer.Destroy(oldIdentity.gameObject);
                }
            }

            session.SpawnedSessionAvatars.Clear();
        }

        [Server]
        private void DestroyHeadsetAvatar(RegisteredHeadsetRecord record)
        {
            if (record.SpawnedAvatar != null)
            {
                NetworkServer.Destroy(record.SpawnedAvatar.gameObject);
            }

            record.SpawnedAvatar = null;
        }

        private void OnServerReceiveClientSceneReady(NetworkConnectionToClient conn, ClientSceneReadyMessage msg)
        {
            if (!_registryByConnId.TryGetValue(conn.connectionId, out RegisteredHeadsetRecord record))
                return;

            record.ActiveSceneKey = msg.LoadedSceneKey;
            record.AssignedGameModuleId = msg.GameModuleId;
            record.IsSceneLoadedAndReady = true;

            Debug.Log($"[MasterServer] Client MAC={record.MacAddress} loaded Game='{msg.GameModuleId}', Scene='{msg.LoadedSceneKey}' (Slot={msg.AssignedGridSlot}, Leader={msg.IsPlayerOneLeader})");

            SpawnGameAvatarForClient(conn, record);
            OnHeadsetSceneReady?.Invoke(msg.SessionId, record.MacAddress);
        }

        [Server]
        private void SpawnGameAvatarForClient(NetworkConnectionToClient conn, RegisteredHeadsetRecord record)
        {
            GameObject prefabToSpawn = defaultKinematicKartPrefab;
            float slotSpacing = 2.5f;

            if (!string.IsNullOrEmpty(record.AssignedGameModuleId) &&
                _modulesById.TryGetValue(record.AssignedGameModuleId, out GameModuleDescriptor module))
            {
                if (module.PlayerAvatarPrefab != null)
                {
                    prefabToSpawn = module.PlayerAvatarPrefab;
                }
                slotSpacing = module.DefaultSlotSpacing;
            }

            if (prefabToSpawn == null)
                return;

            // Never leave two avatars alive for one headset.
            DestroyHeadsetAvatar(record);

            Vector3 spawnPos = new Vector3(record.AssignedGridSlot * slotSpacing, 0f, 0f);
            Quaternion spawnRot = Quaternion.identity;

            if (sceneSpawnPoints != null && record.AssignedGridSlot < sceneSpawnPoints.Length && sceneSpawnPoints[record.AssignedGridSlot] != null)
            {
                spawnPos = sceneSpawnPoints[record.AssignedGridSlot].position;
                spawnRot = sceneSpawnPoints[record.AssignedGridSlot].rotation;
            }

            GameObject avatarObj = Instantiate(prefabToSpawn, spawnPos, spawnRot);
            NetworkServer.Spawn(avatarObj, conn);

            NetworkIdentity avatarIdentity = avatarObj.GetComponent<NetworkIdentity>();
            record.SpawnedAvatar = avatarIdentity;

            if (_activeSessions.TryGetValue(record.AssignedSessionId, out RaceSessionGroup session))
            {
                session.SpawnedSessionAvatars.Add(avatarIdentity);
            }
        }

        private void OnServerReceiveLeaderCommand(NetworkConnectionToClient conn, LeaderSessionCommandMessage msg)
        {
            if (!_registryByConnId.TryGetValue(conn.connectionId, out RegisteredHeadsetRecord senderRecord) || !senderRecord.IsPlayerOneLeader)
            {
                Debug.LogWarning($"[MasterServer] Rejected unauthorized leader command from connectionId={conn.connectionId}");
                return;
            }

            if (senderRecord.AssignedSessionId != msg.SessionId ||
                !_activeSessions.TryGetValue(msg.SessionId, out RaceSessionGroup session))
                return;

            foreach (string mac in session.MemberMacAddresses)
            {
                if (_registryByMac.TryGetValue(mac, out RegisteredHeadsetRecord member) && member.Dispatcher != null)
                {
                    member.Dispatcher.TargetReceiveLeaderCommand(member.Connection, msg.SessionId, msg.CommandType);
                }
            }
        }

        #endregion

        #region Client Connection & Registration Flow

        public override void OnClientConnect()
        {
            base.OnClientConnect();

            string mac = "UNKNOWN_MAC";
            string sn = SystemInfo.deviceUniqueIdentifier;

            if (PicoKioskController.Instance != null)
            {
                PicoKioskController.Instance.PopulateFallbackDeviceIdentifiers();
                mac = PicoKioskController.Instance.CachedMacAddress;
                sn = PicoKioskController.Instance.CachedSerialNumber;
            }

            // SystemInfo.batteryLevel is -1 when unsupported; report 100 in that case instead of clamping to 0.
            float rawBattery = SystemInfo.batteryLevel;
            int batteryPercent = rawBattery < 0f ? 100 : Mathf.RoundToInt(Mathf.Clamp01(rawBattery) * 100f);

            var regMsg = new DeviceRegistrationMessage
            {
                MacAddress = mac,
                SerialNumber = sn,
                DeviceModel = SystemInfo.deviceModel,
                BatteryPercent = batteryPercent,
                CurrentLoadedSceneKey = "HubScene"
            };

            NetworkClient.Send(regMsg);
        }

        #endregion
    }
}
