using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Mirror;

namespace LegacyVR.KartRacing.Networking
{
    /// <summary>
    /// Mac/Windows operator console (IMGUI, so it needs no Canvas/prefab wiring).
    /// Controls up to MasterKartNetworkManager.MaxHeadsets (8) Pico headsets on the local network:
    /// start/stop everything, see live battery + scene state, group headsets, pick the Player 1 leader and a game,
    /// launch, send headsets back to the hub, recenter them, or reboot / shut them down.
    /// </summary>
    public class MasterOperatorPanel : MonoBehaviour
    {
        private const double StaleAfterSeconds = 15.0;

        [Header("Layout")]
        [SerializeField] private float uiScale = 1f;

        [Header("Defaults")]
        [SerializeField] private int nextSessionId = 1;

        private readonly HashSet<string> _selectedMacs = new HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
        private string _leaderMac = string.Empty;
        private int _selectedModuleIndex;
        private string _sessionIdText;
        private string _status = "Server stopped.";
        private Vector2 _headsetScroll;
        private bool _armPowerCommands;
        private MasterBootstrap _bootstrap;

        private void Awake()
        {
            _sessionIdText = nextSessionId.ToString();
        }

        private void Start()
        {
            _bootstrap = FindObjectOfType<MasterBootstrap>();
        }

        private void OnGUI()
        {
            MasterKartNetworkManager manager = MasterKartNetworkManager.singleton;
            if (manager == null)
            {
                GUILayout.Label("No MasterKartNetworkManager in the scene.");
                return;
            }

            GUI.matrix = Matrix4x4.Scale(new Vector3(uiScale, uiScale, 1f));
            GUILayout.BeginArea(new Rect(12, 12, 900, Screen.height / uiScale - 24), GUI.skin.box);

            DrawServerBar(manager);
            DrawNetworkInfo(manager);
            GUILayout.Space(6);
            DrawHeadsetList(manager);
            GUILayout.Space(6);
            DrawLaunchBar(manager);
            GUILayout.Space(4);
            DrawDeviceControls(manager);
            GUILayout.Space(6);
            DrawSessions(manager);

            GUILayout.FlexibleSpace();
            GUILayout.Label(_status);
            GUILayout.EndArea();
        }

        // ------------------------------------------------------------------ top bar
        private void DrawServerBar(MasterKartNetworkManager manager)
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label($"MowgliKart Master  |  {manager.RegisteredHeadsetCount}/{MasterKartNetworkManager.MaxHeadsets} headsets  |  {manager.sendRate} Hz");
            GUILayout.FlexibleSpace();

            if (!NetworkServer.active)
            {
                if (GUILayout.Button("Start Server", GUILayout.Width(120)))
                {
                    if (_bootstrap != null) _bootstrap.StartAll(); else manager.StartServer();
                    _status = $"Server listening for up to {MasterKartNetworkManager.MaxHeadsets} headsets.";
                }
            }
            else if (GUILayout.Button("Stop Server", GUILayout.Width(120)))
            {
                if (_bootstrap != null) _bootstrap.StopAll(); else manager.StopServer();
                _selectedMacs.Clear();
                _leaderMac = string.Empty;
                _status = "Server stopped.";
            }

            GUILayout.EndHorizontal();
        }

        private void DrawNetworkInfo(MasterKartNetworkManager manager)
        {
            GUILayout.BeginHorizontal();
            string ip = manager.ServerLanAddress ?? "(no network)";
            GUILayout.Label($"Mac LAN IP: {ip}   |   Game port: UDP 7777   |   Discovery: {(_bootstrap != null && _bootstrap.DiscoveryAdvertising ? "advertising" : "off")}");
            if (GUILayout.Button("Refresh IP", GUILayout.Width(90)))
            {
                manager.RefreshLanAddress();
            }
            GUILayout.EndHorizontal();

            if (_bootstrap != null)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label($"Content: {_bootstrap.ContentStatus}   (served: {_bootstrap.ContentRequestsServed})");
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("Open content folder", GUILayout.Width(150)))
                {
                    _bootstrap.OpenContentFolder();
                }
                GUILayout.EndHorizontal();
            }
        }

        // ------------------------------------------------------------------ headset table
        private void DrawHeadsetList(MasterKartNetworkManager manager)
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Headsets", GUILayout.Width(80));
            if (GUILayout.Button("Select all", GUILayout.Width(90)))
            {
                foreach (RegisteredHeadsetRecord r in manager.RegisteredHeadsets) _selectedMacs.Add(r.MacAddress);
            }

            if (GUILayout.Button("Clear", GUILayout.Width(70)))
            {
                _selectedMacs.Clear();
            }
            GUILayout.EndHorizontal();

            _headsetScroll = GUILayout.BeginScrollView(_headsetScroll, GUILayout.Height(230));

            List<RegisteredHeadsetRecord> headsets = manager.RegisteredHeadsets
                .OrderBy(r => r.MacAddress, System.StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (headsets.Count == 0)
            {
                GUILayout.Label(NetworkServer.active ? "Waiting for headsets to connect..." : "Start the server first.");
            }

            double now = Time.realtimeSinceStartupAsDouble;
            foreach (RegisteredHeadsetRecord r in headsets)
            {
                GUILayout.BeginHorizontal();

                bool selected = _selectedMacs.Contains(r.MacAddress);
                bool nowSelected = GUILayout.Toggle(selected, string.Empty, GUILayout.Width(24));
                if (nowSelected != selected)
                {
                    if (nowSelected) _selectedMacs.Add(r.MacAddress);
                    else _selectedMacs.Remove(r.MacAddress);
                }

                bool isLeader = string.Equals(_leaderMac, r.MacAddress, System.StringComparison.OrdinalIgnoreCase);
                bool nowLeader = GUILayout.Toggle(isLeader, "P1", GUILayout.Width(40));
                if (nowLeader && !isLeader)
                {
                    _leaderMac = r.MacAddress;
                    _selectedMacs.Add(r.MacAddress); // the leader must be part of the group
                }

                string state = r.AssignedSessionId < 0
                    ? "Hub"
                    : $"S{r.AssignedSessionId} {r.AssignedGameModuleId} {(r.IsSceneLoadedAndReady ? "READY" : "loading")}{(r.IsPlayerOneLeader ? " [P1]" : string.Empty)}";

                bool stale = now - r.LastSeenRealtime > StaleAfterSeconds;

                GUILayout.Label(r.MacAddress, GUILayout.Width(150));
                GUILayout.Label($"{r.BatteryPercent}%", GUILayout.Width(44));
                GUILayout.Label(Truncate(r.DeviceModel, 14), GUILayout.Width(110));
                GUILayout.Label(stale ? state + "  (no signal)" : state);

                GUILayout.EndHorizontal();
            }

            GUILayout.EndScrollView();
        }

        // ------------------------------------------------------------------ launch
        private void DrawLaunchBar(MasterKartNetworkManager manager)
        {
            IReadOnlyList<GameModuleDescriptor> modules = manager.GameModules;
            if (modules.Count == 0)
            {
                GUILayout.Label("No game modules registered on the NetworkManager.");
                return;
            }

            _selectedModuleIndex = Mathf.Clamp(_selectedModuleIndex, 0, modules.Count - 1);

            GUILayout.BeginHorizontal();
            GUILayout.Label("Game", GUILayout.Width(80));
            string[] names = modules.Select(m => m.GameModuleId).ToArray();
            _selectedModuleIndex = GUILayout.SelectionGrid(_selectedModuleIndex, names, Mathf.Min(3, names.Length));
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            GUILayout.Label("Session ID", GUILayout.Width(80));
            _sessionIdText = GUILayout.TextField(_sessionIdText, GUILayout.Width(60));
            GUILayout.Label($"Selected: {_selectedMacs.Count}   Leader: {(string.IsNullOrEmpty(_leaderMac) ? "(first selected)" : _leaderMac)}");
            GUILayout.FlexibleSpace();

            GUI.enabled = NetworkServer.active && _selectedMacs.Count > 0;
            if (GUILayout.Button("LAUNCH", GUILayout.Width(120), GUILayout.Height(28)))
            {
                Launch(manager, modules[_selectedModuleIndex]);
            }
            GUI.enabled = true;

            GUILayout.EndHorizontal();
        }

        private void Launch(MasterKartNetworkManager manager, GameModuleDescriptor module)
        {
            if (!int.TryParse(_sessionIdText, out int sessionId) || sessionId < 0)
            {
                _status = "Session ID must be a non-negative number.";
                return;
            }

            // Order is stable (sorted by MAC) so grid slots are predictable between launches.
            List<string> macs = _selectedMacs.OrderBy(m => m, System.StringComparer.OrdinalIgnoreCase).ToList();

            // Leader is whoever was ticked "P1" if still in the group, otherwise the first selected headset.
            string leader = _selectedMacs.Contains(_leaderMac) ? _leaderMac : macs[0];

            manager.DispatchGameModuleSession(sessionId, module.GameModuleId, macs, leader);
            _status = $"Launched '{module.GameModuleId}' as session {sessionId} on {macs.Count} headset(s); leader {leader}.";

            nextSessionId = sessionId + 1;
            _sessionIdText = nextSessionId.ToString();
        }

        // ------------------------------------------------------------------ device control
        private void DrawDeviceControls(MasterKartNetworkManager manager)
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Selected headsets:", GUILayout.Width(120));

            GUI.enabled = NetworkServer.active && _selectedMacs.Count > 0;

            if (GUILayout.Button("Recenter view", GUILayout.Width(120)))
            {
                int n = manager.SendDeviceCommand(_selectedMacs.ToList(), DeviceCommandType.RecenterView);
                _status = $"Recenter sent to {n} headset(s).";
            }

            if (GUILayout.Button("Return to hub", GUILayout.Width(120)))
            {
                manager.ReturnHeadsetsToHub(_selectedMacs.ToList());
                _status = $"Return-to-hub sent to {_selectedMacs.Count} headset(s).";
            }

            if (GUILayout.Button("Release kiosk", GUILayout.Width(110)))
            {
                int n = manager.SendDeviceCommand(_selectedMacs.ToList(), DeviceCommandType.ExitKiosk);
                _status = $"Kiosk released on {n} headset(s) (Home/Back/Volume/Power work again).";
            }

            if (GUILayout.Button("Re-lock kiosk", GUILayout.Width(110)))
            {
                int n = manager.SendDeviceCommand(_selectedMacs.ToList(), DeviceCommandType.EnterKiosk);
                _status = $"Kiosk re-locked on {n} headset(s).";
            }

            GUILayout.FlexibleSpace();
            GUI.enabled = true;

            _armPowerCommands = GUILayout.Toggle(_armPowerCommands, "Arm power", GUILayout.Width(90));

            GUI.enabled = NetworkServer.active && _selectedMacs.Count > 0 && _armPowerCommands;
            if (GUILayout.Button("Reboot", GUILayout.Width(80)))
            {
                int n = manager.SendDeviceCommand(_selectedMacs.ToList(), DeviceCommandType.Reboot);
                _status = $"Reboot sent to {n} headset(s).";
                _armPowerCommands = false;
            }

            if (GUILayout.Button("Shut down", GUILayout.Width(90)))
            {
                int n = manager.SendDeviceCommand(_selectedMacs.ToList(), DeviceCommandType.Shutdown);
                _status = $"Shutdown sent to {n} headset(s).";
                _armPowerCommands = false;
            }

            GUI.enabled = true;
            GUILayout.EndHorizontal();
        }

        // ------------------------------------------------------------------ sessions
        private void DrawSessions(MasterKartNetworkManager manager)
        {
            GUILayout.Label($"Active sessions: {manager.ActiveSessions.Count}");

            // Copy: ReturnSessionToHub mutates the dictionary while we iterate.
            List<RaceSessionGroup> sessions = manager.ActiveSessions.Values.ToList();
            foreach (RaceSessionGroup s in sessions)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label($"  Session {s.SessionId}: {s.GameModuleId} | {s.MemberMacAddresses.Count} headsets | avatars {s.SpawnedSessionAvatars.Count} | leader {s.LeaderMacAddress}");
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("Return to hub", GUILayout.Width(110)))
                {
                    manager.ReturnSessionToHub(s.SessionId);
                    _status = $"Session {s.SessionId} returned to hub.";
                }
                GUILayout.EndHorizontal();
            }
        }

        private static string Truncate(string value, int max)
        {
            if (string.IsNullOrEmpty(value)) return "-";
            return value.Length <= max ? value : value.Substring(0, max);
        }
    }
}
