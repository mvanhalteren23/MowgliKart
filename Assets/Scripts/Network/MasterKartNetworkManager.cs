using System;
using System.Collections.Generic;
using UnityEngine;
using Mirror;
using LegacyVR.KartClient.SystemService;
using LegacyVR.KartRacing.Networking.Local;

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
        public double LastSeenRealtime;
        /// <summary>Set when a headset that already belonged to a group re-registers (Wi-Fi blip); cleared once its state is re-sent.</summary>
        public bool NeedsResync;
    }

    [Serializable]
    public class RaceSessionGroup
    {
        public int SessionId;
        public string GameModuleId;
        public string AddressableSceneKey;
        public string LeaderMacAddress;
        public List<string> MemberMacAddresses = new List<string>(MasterKartNetworkManager.MaxHeadsets);
        public List<NetworkIdentity> SpawnedSessionAvatars = new List<NetworkIdentity>(MasterKartNetworkManager.MaxHeadsets);
    }

    /// <summary>
    /// Custom Mirror NetworkManager running on the Windows Master Control Server (and Thin Client APK).
    /// Supports Kart Racing and future VR game modules via GameModuleDescriptor registry and Remote Catalogs.
    /// </summary>
    public class MasterKartNetworkManager : NetworkManager
    {
        /// <summary>Maximum simultaneous headsets controlled from the Mac master.</summary>
        public const int MaxHeadsets = 8;

        /// <summary>Port of the built-in Addressables content server (LocalContentServer).</summary>
        public const int ContentServerPort = 8080;

        /// <summary>Token an operator can put in a module's RemoteCatalogUrl; replaced by the Mac's LAN IP at dispatch time.</summary>
        public const string ServerIpToken = "{SERVER_IP}";
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

        /// <summary>Mac LAN address used to fill {SERVER_IP} in remote catalog URLs. Override from the UI if auto-detection picks the wrong NIC.</summary>
        public string ServerLanAddress
        {
            get => string.IsNullOrEmpty(_lanOverride) ? (_lanCached ?? (_lanCached = LanAddress.GetPrimaryIPv4())) : _lanOverride;
            set => _lanOverride = value;
        }

        private string _lanOverride;
        private string _lanCached;

        public void RefreshLanAddress() => _lanCached = LanAddress.GetPrimaryIPv4();

        /// <summary>Replaces {SERVER_IP} so a module can ship a catalog URL that works on whatever network the Mac is on.</summary>
        public string ResolveCatalogUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return string.Empty;
            return url.Replace(ServerIpToken, ServerLanAddress ?? "127.0.0.1");
        }

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
        /// Snapdragon 820 budget: 20 Hz tick, 8 headsets, 110 ms snapshot interpolation buffer (2.2 x 50 ms).
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
            NetworkServer.RegisterHandler<DeviceStatusMessage>(OnServerReceiveDeviceStatus, false);
            NetworkServer.RegisterHandler<LeaderLaunchRequestMessage>(OnServerReceiveLeaderLaunch, false);

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
                TryResyncReturningHeadset(record);
            }
        }

        public override void OnServerDisconnect(NetworkConnectionToClient conn)
        {
            if (_registryByConnId.TryGetValue(conn.connectionId, out RegisteredHeadsetRecord record))
            {
                _registryByConnId.Remove(conn.connectionId);

                if (record.ConnectionId != conn.connectionId)
                {
                    // A Wi-Fi blip: the headset already re-registered on a NEW connection and this is the old socket
                    // finally timing out. The record belongs to the live connection, so it must stay.
                    Debug.Log($"[MasterServer] Stale connection {conn.connectionId} closed for MAC={record.MacAddress}; headset is already back on connection {record.ConnectionId}.");
                }
                else
                {
                    Debug.Log($"[MasterServer] Headset Disconnected: MAC={record.MacAddress}, SN={record.SerialNumber}");

                    if (_registryByMac.TryGetValue(record.MacAddress, out RegisteredHeadsetRecord current) && current == record)
                    {
                        _registryByMac.Remove(record.MacAddress);
                    }

                    OnHeadsetDisconnected?.Invoke(record.MacAddress);
                }
            }

            base.OnServerDisconnect(conn);
        }

        /// <summary>
        /// A headset that reconnected (new player object on its side) lost its lobby role / game scene state.
        /// In the lobby: re-send the group + Player 1 role. If it was mid-game its kart was destroyed with the old
        /// connection, so send it back to the lobby; the group is kept and Player 1 can relaunch.
        /// </summary>
        private void TryResyncReturningHeadset(RegisteredHeadsetRecord record)
        {
            if (!record.NeedsResync || record.Dispatcher == null || record.Connection == null)
                return;

            record.NeedsResync = false;

            if (!_activeSessions.ContainsKey(record.AssignedSessionId))
            {
                record.AssignedSessionId = -1;
                record.IsPlayerOneLeader = false;
                return;
            }

            if (record.IsSceneLoadedAndReady)
            {
                DestroyHeadsetAvatar(record);
                record.IsSceneLoadedAndReady = false;
                record.AssignedGameModuleId = "Hub";
                record.ActiveSceneKey = "HubScene";
                record.Dispatcher.TargetReturnToHub(record.Connection);
            }

            SendLobbyRole(record);
            Debug.Log($"[MasterServer] Restored group state for reconnected headset {record.MacAddress} (session {record.AssignedSessionId}, leader={record.IsPlayerOneLeader}).");
        }

        /// <summary>
        /// Android 6+ hides the real Wi-Fi MAC (02:00:00:00:00:00) and some ROMs return nothing, so two headsets could
        /// otherwise collapse into ONE registry record. Falls back to the serial number, then to the connection id.
        /// </summary>
        public static string BuildHeadsetKey(string mac, string serial, int connectionId)
        {
            string m = string.IsNullOrWhiteSpace(mac) ? string.Empty : mac.Trim().ToUpperInvariant();
            bool bogus = m.Length == 0 || m == "UNKNOWN_MAC" || m == "02:00:00:00:00:00" || m == "00:00:00:00:00:00";
            if (!bogus) return m;

            if (!string.IsNullOrWhiteSpace(serial)) return "SN_" + serial.Trim().ToUpperInvariant();
            return $"CONN_{connectionId}";
        }

        private void OnServerReceiveDeviceRegistration(NetworkConnectionToClient conn, DeviceRegistrationMessage msg)
        {
            string macKey = BuildHeadsetKey(msg.MacAddress, msg.SerialNumber, conn.connectionId);

            bool returning = false;
            if (!_registryByMac.TryGetValue(macKey, out RegisteredHeadsetRecord record))
            {
                record = new RegisteredHeadsetRecord();
                _registryByMac[macKey] = record;
            }
            else
            {
                // Same headset registering again (reconnect): remember if it was part of a group so its state can be restored.
                returning = record.AssignedSessionId >= 0;
            }

            record.ConnectionId = conn.connectionId;
            record.Connection = conn;
            record.MacAddress = macKey;
            record.SerialNumber = msg.SerialNumber;
            record.DeviceModel = msg.DeviceModel;
            record.BatteryPercent = msg.BatteryPercent;
            record.ActiveSceneKey = msg.CurrentLoadedSceneKey;
            record.LastSeenRealtime = Time.realtimeSinceStartupAsDouble;

            // Never keep the previous connection's dispatcher: its TargetRpcs would go to a dead player object.
            record.Dispatcher = conn.identity != null ? conn.identity.GetComponent<KartClientDispatcher>() : null;
            if (returning) record.NeedsResync = true;

            _registryByConnId[conn.connectionId] = record;
            TryResyncReturningHeadset(record);

            Debug.Log($"[MasterServer] Registered Headset #{_registryByMac.Count}/{MaxHeadsets} | MAC={record.MacAddress} | SN={record.SerialNumber} | Model={record.DeviceModel} | Battery={record.BatteryPercent}%");
            OnHeadsetRegistered?.Invoke(record);
        }

        private void OnServerReceiveDeviceStatus(NetworkConnectionToClient conn, DeviceStatusMessage msg)
        {
            if (!_registryByConnId.TryGetValue(conn.connectionId, out RegisteredHeadsetRecord record))
                return;

            record.BatteryPercent = msg.BatteryPercent;
            record.ActiveSceneKey = msg.CurrentLoadedSceneKey;
            record.LastSeenRealtime = Time.realtimeSinceStartupAsDouble;
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
                ResolveCatalogUrl(module.RemoteCatalogUrl),
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

                RemoveFromOtherSessions(mac, sessionId);

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
                    ResolveCatalogUrl(remoteCatalogUrl),
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

        /// <summary>
        /// Forms a group in the lobby WITHOUT launching a game. Player 1 then picks the game / map from the lobby menu
        /// on their own headset (LeaderLaunchRequestMessage). The operator can still launch from the Mac as well.
        /// </summary>
        [Server]
        public void FormLobbyGroup(int sessionId, List<string> selectedMacAddresses, string leaderMacAddress)
        {
            if (selectedMacAddresses == null || selectedMacAddresses.Count == 0)
                return;

            if (_activeSessions.TryGetValue(sessionId, out RaceSessionGroup previous))
            {
                DestroySessionAvatars(previous);
            }

            string leader = string.IsNullOrWhiteSpace(leaderMacAddress)
                ? selectedMacAddresses[0].Trim().ToUpperInvariant()
                : leaderMacAddress.Trim().ToUpperInvariant();

            var session = new RaceSessionGroup
            {
                SessionId = sessionId,
                GameModuleId = "Hub",
                AddressableSceneKey = string.Empty,
                LeaderMacAddress = leader,
                MemberMacAddresses = new List<string>(selectedMacAddresses.Count)
            };

            _activeSessions[sessionId] = session;

            for (int i = 0; i < selectedMacAddresses.Count; i++)
            {
                string mac = selectedMacAddresses[i].Trim().ToUpperInvariant();
                if (!_registryByMac.TryGetValue(mac, out RegisteredHeadsetRecord record) || record.Connection == null)
                    continue;

                RemoveFromOtherSessions(mac, sessionId);
                DestroyHeadsetAvatar(record);

                record.AssignedSessionId = sessionId;
                record.AssignedGameModuleId = "Hub";
                record.IsPlayerOneLeader = string.Equals(mac, leader, StringComparison.OrdinalIgnoreCase);
                record.AssignedGridSlot = i;
                record.IsSceneLoadedAndReady = false;
                session.MemberMacAddresses.Add(mac);

                SendLobbyRole(record);
            }
        }

        private string[] ModuleIds()
        {
            var ids = new List<string>(_modulesById.Count);
            foreach (GameModuleDescriptor m in registeredGameModules)
            {
                if (m != null && !string.IsNullOrWhiteSpace(m.GameModuleId)) ids.Add(m.GameModuleId.Trim());
            }
            return ids.ToArray();
        }

        [Server]
        private void SendLobbyRole(RegisteredHeadsetRecord record)
        {
            if (record.Dispatcher != null && record.Connection != null)
            {
                record.Dispatcher.TargetSetLobbyRole(record.Connection, record.AssignedSessionId, record.IsPlayerOneLeader, ModuleIds());
            }
        }

        /// <summary>
        /// A headset can only belong to one group: drop it from any other group's member list, and forget groups that
        /// end up with nobody in them (otherwise empty sessions pile up in the operator panel).
        /// </summary>
        private void RemoveFromOtherSessions(string mac, int keepSessionId)
        {
            List<int> emptied = null;
            foreach (KeyValuePair<int, RaceSessionGroup> kv in _activeSessions)
            {
                if (kv.Key == keepSessionId)
                    continue;

                kv.Value.MemberMacAddresses.RemoveAll(m => string.Equals(m, mac, StringComparison.OrdinalIgnoreCase));
                if (kv.Value.MemberMacAddresses.Count == 0)
                {
                    if (emptied == null) emptied = new List<int>();
                    emptied.Add(kv.Key);
                }
            }

            if (emptied == null)
                return;

            foreach (int id in emptied)
            {
                DestroySessionAvatars(_activeSessions[id]);
                _activeSessions.Remove(id);
            }
        }

        /// <summary>
        /// Sends a whole group back to the always-resident HubScene and clears its avatars. The group (and its Player 1)
        /// stays together so Player 1 can immediately pick the next game from the lobby menu.
        /// </summary>
        [Server]
        public void ReturnSessionToHub(int sessionId)
        {
            if (!_activeSessions.TryGetValue(sessionId, out RaceSessionGroup session))
                return;

            DestroySessionAvatars(session);
            session.GameModuleId = "Hub";
            session.AddressableSceneKey = string.Empty;

            foreach (string mac in session.MemberMacAddresses)
            {
                if (!_registryByMac.TryGetValue(mac, out RegisteredHeadsetRecord record))
                    continue;

                DestroyHeadsetAvatar(record);
                record.AssignedGameModuleId = "Hub";
                record.IsSceneLoadedAndReady = false;
                record.ActiveSceneKey = "HubScene";

                if (record.Dispatcher != null && record.Connection != null)
                {
                    record.Dispatcher.TargetReturnToHub(record.Connection);
                    SendLobbyRole(record); // re-arms the lobby menu on Player 1
                }
            }
        }

        /// <summary>Ends the group entirely (headsets go back to the plain lobby with no Player 1).</summary>
        [Server]
        public void DisbandSession(int sessionId)
        {
            if (!_activeSessions.TryGetValue(sessionId, out RaceSessionGroup session))
                return;

            DestroySessionAvatars(session);
            ReturnHeadsetsToHub(new List<string>(session.MemberMacAddresses));
            _activeSessions.Remove(sessionId);
        }

        /// <summary>Sends individual headsets to the lobby and removes them from their group.</summary>
        [Server]
        public void ReturnHeadsetsToHub(IEnumerable<string> macAddresses)
        {
            foreach (string rawMac in new List<string>(macAddresses))
            {
                string mac = rawMac.Trim().ToUpperInvariant();
                if (!_registryByMac.TryGetValue(mac, out RegisteredHeadsetRecord record))
                    continue;

                RemoveFromOtherSessions(mac, int.MinValue);
                DestroyHeadsetAvatar(record);
                record.AssignedSessionId = -1;
                record.AssignedGameModuleId = "Hub";
                record.IsPlayerOneLeader = false;
                record.IsSceneLoadedAndReady = false;
                record.ActiveSceneKey = "HubScene";

                if (record.Dispatcher != null && record.Connection != null)
                {
                    record.Dispatcher.TargetReturnToHub(record.Connection);
                    record.Dispatcher.TargetSetLobbyRole(record.Connection, -1, false, new string[0]);
                }
            }
        }

        /// <summary>
        /// Pushes a hardware/view command (recenter, reboot, shutdown) to the chosen headsets.
        /// </summary>
        [Server]
        public int SendDeviceCommand(IEnumerable<string> macAddresses, DeviceCommandType command)
        {
            int sent = 0;
            foreach (string rawMac in macAddresses)
            {
                if (_registryByMac.TryGetValue(rawMac.Trim().ToUpperInvariant(), out RegisteredHeadsetRecord record) &&
                    record.Dispatcher != null && record.Connection != null)
                {
                    record.Dispatcher.TargetDeviceCommand(record.Connection, (byte)command);
                    sent++;
                }
            }

            Debug.Log($"[MasterServer] Sent {command} to {sent} headset(s).");
            return sent;
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

        /// <summary>Player 1 picked a game/map in the lobby menu: launch it for the whole group.</summary>
        private void OnServerReceiveLeaderLaunch(NetworkConnectionToClient conn, LeaderLaunchRequestMessage msg)
        {
            if (!_registryByConnId.TryGetValue(conn.connectionId, out RegisteredHeadsetRecord sender) || !sender.IsPlayerOneLeader)
            {
                Debug.LogWarning($"[MasterServer] Rejected launch request from non-leader connectionId={conn.connectionId}");
                return;
            }

            if (sender.AssignedSessionId != msg.SessionId || !_activeSessions.TryGetValue(msg.SessionId, out RaceSessionGroup session))
            {
                Debug.LogWarning($"[MasterServer] Rejected launch request for session {msg.SessionId} (leader belongs to {sender.AssignedSessionId}).");
                return;
            }

            if (string.IsNullOrWhiteSpace(msg.GameModuleId) || !_modulesById.ContainsKey(msg.GameModuleId.Trim()))
            {
                Debug.LogWarning($"[MasterServer] Rejected launch request: unknown game module '{msg.GameModuleId}'.");
                return;
            }

            Debug.Log($"[MasterServer] Player 1 ({sender.MacAddress}) launched '{msg.GameModuleId}' for session {msg.SessionId}.");
            DispatchGameModuleSession(msg.SessionId, msg.GameModuleId, new List<string>(session.MemberMacAddresses), session.LeaderMacAddress);
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

            // Command 3 changes server state (avatars, registry), so the server executes it instead of just relaying it.
            if (msg.CommandType == 3)
            {
                ReturnSessionToHub(msg.SessionId);
                return;
            }

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
