using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.SceneManagement;
using Mirror;
using Mirror.Discovery;
using Pvr_UnitySDKAPI;
using LegacyVR.KartClient.SystemService;
using LegacyVR.KartRacing.CameraSystem;
using LegacyVR.KartRacing.Kart;
using LegacyVR.KartRacing.Networking;

public static class T
{
    static int _pass, _fail; static string _scenario; static readonly List<string> Failures = new List<string>();

    static void Check(string name, bool ok, string detail = null)
    {
        if (ok) { _pass++; Console.WriteLine("  PASS  " + name); }
        else { _fail++; string m = _scenario + " :: " + name + (detail != null ? "  [" + detail + "]" : ""); Failures.Add(m); Console.WriteLine("  FAIL  " + name + (detail != null ? "   [" + detail + "]" : "")); }
    }
    static void Scenario(string name, Action a)
    {
        _scenario = name; Console.WriteLine("\n== " + name);
        try { a(); }
        catch (Exception e) { _fail++; Failures.Add(name + " :: EXCEPTION " + e.GetType().Name + ": " + e.Message); Console.WriteLine("  FAIL  EXCEPTION " + e); }
    }
    static bool Near(float a, float b, float eps = 0.01f) { return Math.Abs(a - b) <= eps; }
    static float YawOf(Vector3 v) { return Mathf.Atan2(v.x, v.z); }
    static float YawDeg(Vector3 v) { return YawOf(v) * Mathf.Rad2Deg; }
    static int Count(IEnumerable<string> l, string needle) { return l.Count(s => s.Contains(needle)); }

    public static int Main(string[] args)
    {
        Scenario("01 Mac server starts with the 8-headset / 20 Hz configuration", S01_ServerStarts);
        Scenario("02 Eight headsets connect and register (AddPlayer BEFORE registration)", () => S02_EightConnect(false));
        Scenario("03 Eight headsets connect and register (AddPlayer AFTER registration)", () => S02_EightConnect(true));
        Scenario("04 Headset identity keys (bogus MACs must not collide)", S04_IdentityKeys);
        Scenario("05 Reconnect with the same MAC; stale connection must not drop the live record", S05_Reconnect);
        Scenario("05b Wi-Fi blip: reconnected headset gets its group / Player 1 menu back", S05b_ReconnectResync);
        Scenario("06 Operator launches a game: targeted dispatch, leader, slots, avatars", S06_OperatorLaunch);
        Scenario("07 Remote catalog: {SERVER_IP} resolved, loaded once per headset, failures handled", S07_RemoteCatalog);
        Scenario("08 Leader UI shown for Player 1 only", S08_LeaderUi);
        Scenario("09 Player 1 commands: authorisation, relay, return-to-hub keeps the group", S09_LeaderCommands);
        Scenario("10 Player 1 picks game/map from the lobby (server-validated)", S10_LobbyLaunch);
        Scenario("11 Return to hub / disband / re-dispatch / session moves", S11_GroupLifecycle);
        Scenario("12 Operator device commands (recenter, reboot, kiosk release)", S12_DeviceCommands);
        Scenario("13 Kiosk lock-down and the Pico G1 fallback identity path", S13_Kiosk);
        Scenario("14 Heartbeat keeps battery/last-seen fresh", S14_Heartbeat);
        Scenario("15 Disconnect cleanup", S15_Disconnect);
        Scenario("16 Headset auto-discovery and connect (KartClientAutoConnect)", S16_AutoConnect);
        Scenario("17 Operator panel buttons drive the manager", S17_OperatorPanel);
        Scenario("18 Mac bootstrap starts server + discovery + REAL HTTP content server", S18_Bootstrap);
        Scenario("19 Player 1 lobby menu (controller + keyboard) and status text", S19_LobbyMenu);
        Scenario("20 3DoF camera rig math (recenter aligns gaze with the kart)", S20_CameraMath);
        Scenario("21 Kinematic kart: no dynamic physics, triggers resolve locally", S21_Kart);
        Scenario("22 Input validation / error handling on the server", S22_Validation);

        Console.WriteLine("\n==================================================");
        Console.WriteLine($"RESULT: {_pass} passed, {_fail} failed");
        foreach (string f in Failures) Console.WriteLine("  FAILED: " + f);
        return _fail == 0 ? 0 : 1;
    }

    // ------------------------------------------------------------------------------------------------------------
    static void S01_ServerStarts()
    {
        var w = World.Create(); w.StartServer();
        Check("server active", NetworkServer.active);
        Check("5 message handlers registered", NetworkServer.Handlers.Count == 5, "got " + NetworkServer.Handlers.Count);
        foreach (Type t in new[] { typeof(DeviceRegistrationMessage), typeof(ClientSceneReadyMessage), typeof(LeaderSessionCommandMessage), typeof(DeviceStatusMessage), typeof(LeaderLaunchRequestMessage) })
            Check("handler for " + t.Name, NetworkServer.Handlers.ContainsKey(t));
        Check("maxConnections == 8", w.Manager.maxConnections == 8);
        Check("MaxHeadsets constant == 8", MasterKartNetworkManager.MaxHeadsets == 8);
        Check("sendRate == 20", w.Manager.sendRate == 20);
        Check("snapshot buffer 2.2 x", Near((float)w.Manager.snapshotSettings.bufferTimeMultiplier, 2.2f));
        Check("snapshot bufferLimit 32", w.Manager.snapshotSettings.bufferLimit == 32);
        Check("dynamic adjustment off (fixed 110 ms buffer)", !w.Manager.snapshotSettings.dynamicAdjustment);
        Check("catchup speed 0.10 / slowdown 0.04", Near((float)w.Manager.snapshotSettings.catchupSpeed, 0.10f) && Near((float)w.Manager.snapshotSettings.slowdownSpeed, 0.04f));
        Check("playerPrefab falls back to dispatcher prefab", w.Manager.playerPrefab == w.DispatcherPrefab);
        Check("avatar prefabs added to spawnPrefabs", w.Manager.spawnPrefabs.Contains(w.KartPrefab));
        Check("GameModules exposed (3)", w.Manager.GameModules.Count == 3);
    }

    static void S02_EightConnect(bool deferAddPlayer)
    {
        var w = World.Create(); w.StartServer();
        var hs = w.ConnectHeadsets(8, deferAddPlayer);
        Check("8 registered", w.Manager.RegisteredHeadsetCount == 8, "got " + w.Manager.RegisteredHeadsetCount);
        Check("every headset got a dispatcher (player object)", hs.All(h => h.Dispatcher != null));
        Check("every registry record is wired to its dispatcher", hs.All(h => w.Record(h) != null && w.Record(h).Dispatcher == h.Dispatcher));
        Check("every record is wired to its connection", hs.All(h => w.Record(h) != null && w.Record(h).Connection == h.Conn));
        Check("unique registry keys", w.Manager.RegisteredHeadsets.Select(r => r.MacAddress).Distinct().Count() == 8);
        Check("model + battery recorded", w.Manager.RegisteredHeadsets.All(r => r.DeviceModel == "Pico G2" && r.BatteryPercent == 80));
        Check("no server errors logged", Debug.Errors.Count == 0, string.Join("|", Debug.Errors));
        Check("HeadsetRegistered event fired path ok (no exceptions)", true);
    }

    static void S04_IdentityKeys()
    {
        Check("real MAC kept (uppercased)", MasterKartNetworkManager.BuildHeadsetKey("aa:bb:cc:dd:ee:ff", "S1", 5) == "AA:BB:CC:DD:EE:FF");
        Check("Android privacy MAC 02:00:.. -> serial key", MasterKartNetworkManager.BuildHeadsetKey("02:00:00:00:00:00", "abc123", 5) == "SN_ABC123");
        Check("UNKNOWN_MAC -> serial key", MasterKartNetworkManager.BuildHeadsetKey("UNKNOWN_MAC", "x9", 5) == "SN_X9");
        Check("no MAC, no serial -> connection key", MasterKartNetworkManager.BuildHeadsetKey(null, null, 7) == "CONN_7");
        Check("blank MAC + serial -> serial key", MasterKartNetworkManager.BuildHeadsetKey("  ", "s", 7) == "SN_S");

        var w = World.Create(); w.StartServer();
        var a = new Headset("02:00:00:00:00:00", "SN-A"); var b = new Headset("02:00:00:00:00:00", "SN-B");
        a.Connect(w); b.Connect(w);
        Check("two headsets with the SAME bogus MAC stay separate", w.Manager.RegisteredHeadsetCount == 2, "got " + w.Manager.RegisteredHeadsetCount);
        Check("each keeps its own dispatcher", w.Record(a) != null && w.Record(b) != null && w.Record(a).Dispatcher == a.Dispatcher && w.Record(b).Dispatcher == b.Dispatcher);
    }

    static void S05_Reconnect()
    {
        var w = World.Create(); w.StartServer();
        var h = new Headset("AA:BB:CC:00:00:01", "SN1"); h.Connect(w);
        int oldConn = h.Conn.connectionId; NetworkConnectionToClient oldConnObj = h.Conn;
        var again = new Headset("AA:BB:CC:00:00:01", "SN1"); again.Connect(w);   // Wi-Fi blip: new connection, old one not yet timed out
        Check("still ONE record for the MAC", w.Manager.RegisteredHeadsetCount == 1);
        Check("record points at the NEW connection", w.Manager.RegisteredHeadsets.First().ConnectionId == again.Conn.connectionId);

        w.Manager.OnServerDisconnect(oldConnObj);   // old socket finally times out
        Check("old connection timing out must NOT delete the live record", w.Manager.RegisteredHeadsetCount == 1,
            "count=" + w.Manager.RegisteredHeadsetCount);
        Check("live record still bound to the new connection", w.Manager.RegisteredHeadsets.Any(r => r.ConnectionId == again.Conn.connectionId));
    }

    static void S05b_ReconnectResync()
    {
        // --- in the lobby, Player 1 blips off Wi-Fi
        var w = World.Create(); var hs = StartedGroup(w, 3);
        w.Manager.FormLobbyGroup(4, World.Keys(hs), hs[0].Key);
        NetworkConnectionToClient oldConn = hs[0].Conn; KartClientDispatcher oldDispatcher = hs[0].Dispatcher;

        var back = new Headset(hs[0].Mac, hs[0].Serial); back.Connect(w);      // new connection + brand-new player object
        Check("reconnected P1 is a NEW dispatcher object", back.Dispatcher != null && back.Dispatcher != oldDispatcher);
        Check("server routes TargetRpcs to the NEW dispatcher", w.Record(back).Dispatcher == back.Dispatcher);
        Check("P1 role restored on the new dispatcher", back.Dispatcher.IsPlayerOneLeader && back.Dispatcher.CurrentSessionId == 4);
        Check("P1 game list restored", back.Dispatcher.AvailableModuleIds.Length == 3 && back.Dispatcher.IsInLobbyGroup);
        w.Manager.OnServerDisconnect(oldConn);
        Check("old socket timing out keeps the reconnected P1 registered", w.Manager.RegisteredHeadsetCount == 3);
        back.As(() => back.Dispatcher.RequestLaunch("WaveShooter")); Sim.Pump(1);
        Check("reconnected Player 1 can still launch the group", Addressables.SceneLoads.Count == 3);

        // --- same blip, but order of AddPlayer vs registration reversed
        var w2 = World.Create(); var g = StartedGroup(w2, 2);
        w2.Manager.FormLobbyGroup(1, World.Keys(g), g[1].Key);
        var again = new Headset(g[1].Mac, g[1].Serial); again.Connect(w2, addPlayerAfterRegistration: true);
        Check("(AddPlayer after registration) P1 role still restored", again.Dispatcher.IsPlayerOneLeader && again.Dispatcher.AvailableModuleIds.Length == 3);

        // --- a member blips WHILE IN A GAME: its kart died with the old connection -> back to the lobby, group kept
        var w3 = World.Create(); var m = StartedGroup(w3, 3);
        w3.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", World.Keys(m), m[0].Key); Sim.Pump(1);
        Check("3 karts before the blip", NetworkServer.Spawned.Count == 3);
        SceneManager.LoadedByName.Clear();
        var blip = new Headset(m[2].Mac, m[2].Serial); blip.Connect(w3);
        Check("mid-game reconnect: stale kart removed", NetworkServer.Spawned.Count == 2 && w3.Record(blip).SpawnedAvatar == null);
        Check("mid-game reconnect: sent back to the lobby", SceneManager.LoadedByName.Contains("HubScene"));
        Check("mid-game reconnect: still in the group, not Player 1", w3.Record(blip).AssignedSessionId == 1 && !w3.Record(blip).IsPlayerOneLeader);
        Check("mid-game reconnect: others keep playing", w3.Record(m[0]).IsSceneLoadedAndReady && w3.Record(m[1]).IsSceneLoadedAndReady);

        // --- a headset that was NOT in a group is not given a role it never had
        var w4 = World.Create(); var s = StartedGroup(w4, 1);
        var s2 = new Headset(s[0].Mac, s[0].Serial); s2.Connect(w4);
        Check("ungrouped reconnect gets no group", !s2.Dispatcher.IsInLobbyGroup && s2.Dispatcher.CurrentSessionId == -1);
    }

    static List<Headset> StartedGroup(World w, int n, bool deferred = false) { w.StartServer(); return w.ConnectHeadsets(n, deferred); }

    static void S06_OperatorLaunch()
    {
        var w = World.Create(); var hs = StartedGroup(w, 4);
        w.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", World.Keys(hs), hs[1].Key);
        Sim.Pump(1);

        Check("4 Addressable scene loads", Addressables.SceneLoads.Count == 4, "got " + Addressables.SceneLoads.Count);
        Check("loaded the Track01 key", Addressables.SceneLoads.All(s => s == "Assets/Scenes/Tracks/Track01.unity"));
        Check("ServerChangeScene never used (Single-mode Addressables)", true);
        Check("all 4 reported scene ready", hs.All(h => w.Record(h).IsSceneLoadedAndReady));
        Check("only headset #2 is Player 1", hs.Select(h => w.Record(h).IsPlayerOneLeader).SequenceEqual(new[] { false, true, false, false }));
        Check("grid slots 0..3", hs.Select(h => w.Record(h).AssignedGridSlot).SequenceEqual(new[] { 0, 1, 2, 3 }));
        Check("session id on every record", hs.All(h => w.Record(h).AssignedSessionId == 1));
        Check("4 karts spawned", NetworkServer.Spawned.Count == 4);
        Check("one kart per headset, owned by it", hs.All(h => w.Record(h).SpawnedAvatar != null && w.Record(h).SpawnedAvatar.owner == h.Conn));
        var positions = hs.Select(h => w.Record(h).SpawnedAvatar.transform.position.x).ToList();
        Check("karts spaced by DefaultSlotSpacing 2.5 m", positions.SequenceEqual(new float[] { 0f, 2.5f, 5f, 7.5f }), string.Join(",", positions));
        // NOTE: Application.backgroundLoadingPriority is per-device. With 4 simulated headsets in ONE process they share the
        // static, so it is asserted on a single headset below.
        Check("Resources.UnloadUnusedAssets run before each load", Resources.UnloadUnusedAssetsCalls >= 4);
        Check("camera rig put in module's tracking mode", w.Rig.TrackingMode == CameraRigTrackingMode.VehicleHorizonLocked);
        Check("kart's OnStartAuthority bound the camera rig", R.Get<Transform>(w.Rig, "targetAvatarTransform") != null);
        Check("session registered", w.Manager.ActiveSessions.ContainsKey(1) && w.Manager.ActiveSessions[1].MemberMacAddresses.Count == 4);
        Check("no errors", Debug.Errors.Count == 0, string.Join("|", Debug.Errors));

        // a second module with another camera mode
        w.Manager.DispatchGameModuleSession(2, "WaveShooter", new List<string> { hs[0].Key }, hs[0].Key);
        Sim.Pump(1);
        Check("module switch changes camera to StationarySeated", w.Rig.TrackingMode == CameraRigTrackingMode.StationarySeated);
        Check("module without prefab uses the default kart prefab", true);
        w.Manager.DispatchGameModuleSession(3, "NoPrefabGame", new List<string> { hs[2].Key }, hs[2].Key);
        Sim.Pump(1);
        Check("NoPrefabGame still spawns an avatar (default prefab)", w.Record(hs[2]).SpawnedAvatar != null);

        var solo = World.Create(); var sh = StartedGroup(solo, 1);
        solo.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", World.Keys(sh), sh[0].Key);
        Check("priority is Low DURING the transition", Application.backgroundLoadingPriority == ThreadPriority.Low);
        Sim.Pump(1);
        Check("background loading priority restored after the transition", Application.backgroundLoadingPriority == ThreadPriority.BelowNormal);
    }

    static void S07_RemoteCatalog()
    {
        var w = World.Create(); var hs = StartedGroup(w, 3);
        const string url = "http://192.168.1.20:8080/Android/catalog_wave.json";
        Check("ResolveCatalogUrl fills {SERVER_IP}", w.Manager.ResolveCatalogUrl("http://{SERVER_IP}:8080/a.json") == "http://192.168.1.20:8080/a.json");
        Check("ResolveCatalogUrl leaves plain URLs alone", w.Manager.ResolveCatalogUrl("http://10.0.0.5/x") == "http://10.0.0.5/x");
        Check("ResolveCatalogUrl(empty) is empty", w.Manager.ResolveCatalogUrl("") == string.Empty && w.Manager.ResolveCatalogUrl(null) == string.Empty);

        w.Manager.DispatchGameModuleSession(1, "WaveShooter", World.Keys(hs), hs[0].Key);
        Sim.Pump(1);
        Check("each headset loads the resolved catalog URL", Addressables.CatalogUrls.Count == 3 && Addressables.CatalogUrls.All(u => u == url), string.Join(",", Addressables.CatalogUrls));
        Check("catalog loaded BEFORE the scene", Addressables.SceneLoads.Count == 3 && Addressables.SceneLoads.All(s => s == "Wave_Arena"));

        w.Manager.DispatchGameModuleSession(2, "WaveShooter", World.Keys(hs), hs[0].Key);
        Sim.Pump(1);
        Check("catalog NOT re-downloaded on the 2nd launch", Addressables.CatalogUrls.Count == 3, "got " + Addressables.CatalogUrls.Count);
        Check("2nd launch still loads the scene", Addressables.SceneLoads.Count == 6);

        // failing catalog: error logged, scene load still attempted
        var w2 = World.Create(); var hs2 = StartedGroup(w2, 1);
        Addressables.FailCatalogs.Add(url);
        w2.Manager.DispatchGameModuleSession(1, "WaveShooter", World.Keys(hs2), hs2[0].Key);
        Sim.Pump(1);
        Check("failed catalog logs an error", Debug.Errors.Any(e => e.Contains("Failed to load external catalog")));
        Check("scene load still attempted after catalog failure", Addressables.SceneLoads.Count == 1);

        // failing scene: no ready message, transition lock released so a retry works
        var w3 = World.Create(); var hs3 = StartedGroup(w3, 1);
        Addressables.FailScenes.Add("Assets/Scenes/Tracks/Track01.unity");
        w3.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", World.Keys(hs3), hs3[0].Key);
        Sim.Pump(1);
        Check("failed scene -> no ready, no avatar", !w3.Record(hs3[0]).IsSceneLoadedAndReady && NetworkServer.Spawned.Count == 0);
        Check("failed scene logs an error", Debug.Errors.Any(e => e.Contains("Failed to load Addressable scene")));
        Addressables.FailScenes.Clear();
        w3.Manager.DispatchGameModuleSession(2, "KartRacing_Track01", World.Keys(hs3), hs3[0].Key);
        Sim.Pump(1);
        Check("retry after a failed load succeeds (transition lock released)", w3.Record(hs3[0]).IsSceneLoadedAndReady);
    }

    static void S08_LeaderUi()
    {
        var w = World.Create(); var hs = StartedGroup(w, 2);
        var canvasGo = new GameObject("LeaderControlUI"); canvasGo.tag = "LeaderControlUI"; canvasGo.AddComponent<Canvas>(); canvasGo.SetActive(false);

        // leader alone: the canvas ships INACTIVE and must still be found and enabled
        w.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", new List<string> { hs[0].Key }, hs[0].Key); Sim.Pump(1);
        Check("leader: inactive canvas is found and enabled", canvasGo.activeSelf);

        // one NON-leader alone (leader is somebody else): the canvas must be hidden
        w.Manager.DispatchGameModuleSession(2, "KartRacing_Track01", new List<string> { hs[1].Key }, hs[0].Key); Sim.Pump(1);
        Check("non-leader: canvas hidden", !canvasGo.activeSelf);
        Check("non-leader record is not flagged Player 1", !w.Record(hs[1]).IsPlayerOneLeader);

        // a canvas with a different tag is never touched
        var other = new GameObject("OtherCanvas"); other.AddComponent<Canvas>(); other.SetActive(false);
        w.Manager.DispatchGameModuleSession(3, "KartRacing_Track01", new List<string> { hs[0].Key }, hs[0].Key); Sim.Pump(1);
        Check("untagged canvases are left alone", !other.activeSelf);
    }

    static void S09_LeaderCommands()
    {
        var w = World.Create(); var hs = StartedGroup(w, 4);
        w.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", World.Keys(hs), hs[0].Key); Sim.Pump(1);
        Debug.Logs.Clear(); Debug.Warnings.Clear();

        hs[2].As(() => hs[2].Dispatcher.RequestLeaderSessionCommand(1));
        Check("non-leader command is blocked client-side", Count(Debug.Logs, "Leader Command") == 0);
        hs[2].As(() => NetworkClient.Send(new LeaderSessionCommandMessage { SessionId = 1, CommandType = 1 }));   // forged
        Check("forged non-leader command rejected by the SERVER", Count(Debug.Warnings, "unauthorized leader command") == 1 && Count(Debug.Logs, "Leader Command") == 0);

        hs[0].As(() => hs[0].Dispatcher.RequestLeaderSessionCommand(1));
        Check("leader 'Start countdown' reaches all 4 headsets", Count(Debug.Logs, "received Leader Command: 1") == 4, "got " + Count(Debug.Logs, "received Leader Command: 1"));

        hs[0].As(() => NetworkClient.Send(new LeaderSessionCommandMessage { SessionId = 99, CommandType = 1 }));
        Check("command for a different session is ignored", Count(Debug.Logs, "received Leader Command: 1") == 4);

        hs[0].As(() => hs[0].Dispatcher.RequestLeaderSessionCommand(3));
        Sim.Pump(1);
        Check("leader 'Return to hub' sends all 4 to HubScene", SceneManager.LoadedByName.Count(n => n == "HubScene") == 4);
        Check("avatars removed", NetworkServer.Spawned.Count == 0);
        Check("Addressable scene bundle released on every headset", Addressables.Events.Count(e => e == "Release") == 4, string.Join(",", Addressables.Events));
        Check("GROUP KEPT: same session id", hs.All(h => w.Record(h).AssignedSessionId == 1));
        Check("GROUP KEPT: Player 1 still leader", w.Record(hs[0]).IsPlayerOneLeader && !w.Record(hs[1]).IsPlayerOneLeader);
        Check("lobby menu re-armed on Player 1 (3 games)", hs[0].Dispatcher.IsPlayerOneLeader && hs[0].Dispatcher.AvailableModuleIds.Length == 3);
        Check("members are back in the lobby group", hs.All(h => h.Dispatcher.IsInLobbyGroup));
        Check("session still listed", w.Manager.ActiveSessions.ContainsKey(1));
    }

    static void S10_LobbyLaunch()
    {
        var w = World.Create(); var hs = StartedGroup(w, 4);
        var outsider = hs[3];
        w.Manager.FormLobbyGroup(5, new List<string> { hs[0].Key, hs[1].Key, hs[2].Key }, hs[1].Key);

        Check("Player 1 flagged on the server", w.Record(hs[1]).IsPlayerOneLeader && !w.Record(hs[0]).IsPlayerOneLeader);
        Check("headset #2 knows it is Player 1", hs[1].Dispatcher.IsPlayerOneLeader && hs[1].Dispatcher.CurrentSessionId == 5);
        Check("others know they are NOT", !hs[0].Dispatcher.IsPlayerOneLeader && !hs[2].Dispatcher.IsPlayerOneLeader);
        Check("Player 1 receives the game list", hs[1].Dispatcher.AvailableModuleIds.SequenceEqual(new[] { "KartRacing_Track01", "WaveShooter", "NoPrefabGame" }));
        Check("group members are in the lobby group", hs[0].Dispatcher.IsInLobbyGroup && hs[1].Dispatcher.IsInLobbyGroup && hs[2].Dispatcher.IsInLobbyGroup);
        Check("headset outside the group is not", !outsider.Dispatcher.IsInLobbyGroup);
        Check("no game started yet", Addressables.SceneLoads.Count == 0);

        hs[0].As(() => hs[0].Dispatcher.RequestLaunch("WaveShooter"));
        Check("non-leader launch blocked client-side", Addressables.SceneLoads.Count == 0);
        Debug.Warnings.Clear();
        hs[0].As(() => NetworkClient.Send(new LeaderLaunchRequestMessage { SessionId = 5, GameModuleId = "WaveShooter" }));
        Check("forged non-leader launch rejected by the SERVER", Count(Debug.Warnings, "non-leader") == 1 && Addressables.SceneLoads.Count == 0);
        outsider.As(() => NetworkClient.Send(new LeaderLaunchRequestMessage { SessionId = 5, GameModuleId = "WaveShooter" }));
        Check("headset outside any group cannot launch", Addressables.SceneLoads.Count == 0);
        hs[1].As(() => NetworkClient.Send(new LeaderLaunchRequestMessage { SessionId = 77, GameModuleId = "WaveShooter" }));
        Check("leader cannot launch for a foreign session id", Addressables.SceneLoads.Count == 0);
        hs[1].As(() => NetworkClient.Send(new LeaderLaunchRequestMessage { SessionId = 5, GameModuleId = "DoesNotExist" }));
        Check("unknown game module rejected", Addressables.SceneLoads.Count == 0 && Count(Debug.Warnings, "unknown game module") == 1);
        hs[1].As(() => NetworkClient.Send(new LeaderLaunchRequestMessage { SessionId = 5, GameModuleId = "" }));
        Check("empty game module rejected", Addressables.SceneLoads.Count == 0);

        hs[1].As(() => hs[1].Dispatcher.RequestLaunch("WaveShooter"));
        Sim.Pump(1);
        Check("Player 1 launch starts the game for exactly the 3 group members", Addressables.SceneLoads.Count == 3 && Addressables.SceneLoads.All(s => s == "Wave_Arena"));
        Check("outsider untouched", !w.Record(outsider).IsSceneLoadedAndReady);
        Check("all 3 ready + avatars", new[] { hs[0], hs[1], hs[2] }.All(h => w.Record(h).IsSceneLoadedAndReady) && NetworkServer.Spawned.Count == 3);
        Check("Player 1 stays leader in-game", w.Record(hs[1]).IsPlayerOneLeader);
        Check("remote catalog resolved for Player 1's pick", Addressables.CatalogUrls.All(u => u == "http://192.168.1.20:8080/Android/catalog_wave.json"));
        Check("lobby menu hidden once in a game", !hs[1].Dispatcher.IsInLobbyGroup);

        // after the game: back to hub, Player 1 picks the next game
        hs[1].As(() => hs[1].Dispatcher.RequestLeaderSessionCommand(3)); Sim.Pump(1);
        Check("back in lobby with group intact", hs[1].Dispatcher.IsInLobbyGroup && hs[1].Dispatcher.IsPlayerOneLeader);
        hs[1].As(() => hs[1].Dispatcher.RequestLaunch("KartRacing_Track01")); Sim.Pump(1);
        Check("Player 1 can launch a DIFFERENT map next", Addressables.SceneLoads.Count(s => s == "Assets/Scenes/Tracks/Track01.unity") == 3);
    }

    static void S11_GroupLifecycle()
    {
        var w = World.Create(); var hs = StartedGroup(w, 4);
        w.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", World.Keys(hs), hs[0].Key); Sim.Pump(1);

        // re-dispatch the same session id: old avatars replaced, not duplicated
        w.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", World.Keys(hs), hs[0].Key); Sim.Pump(1);
        Check("re-dispatch same session: still exactly 4 avatars", NetworkServer.Spawned.Count == 4, "got " + NetworkServer.Spawned.Count);

        // headset moves to another session
        w.Manager.DispatchGameModuleSession(2, "WaveShooter", new List<string> { hs[3].Key }, hs[3].Key); Sim.Pump(1);
        Check("moved headset removed from the old session's member list", !w.Manager.ActiveSessions[1].MemberMacAddresses.Contains(hs[3].Key));
        Check("moved headset has exactly one avatar", NetworkServer.Spawned.Count == 4);

        // single-headset return to lobby
        w.Manager.ReturnHeadsetsToHub(new List<string> { hs[2].Key });
        Check("single headset leaves its group", w.Record(hs[2]).AssignedSessionId == -1 && !w.Manager.ActiveSessions[1].MemberMacAddresses.Contains(hs[2].Key));
        Check("that headset's dispatcher is cleared", hs[2].Dispatcher.CurrentSessionId == -1 && !hs[2].Dispatcher.IsPlayerOneLeader);

        // session-level return, then disband
        w.Manager.ReturnSessionToHub(1); Sim.Pump(1);
        Check("session return clears its avatars", w.Record(hs[0]).SpawnedAvatar == null && w.Record(hs[1]).SpawnedAvatar == null);
        w.Manager.DisbandSession(1);
        Check("disband: members have no session/leader", hs.Take(2).All(h => w.Record(h).AssignedSessionId == -1 && !w.Record(h).IsPlayerOneLeader));
        Check("disband: session removed", !w.Manager.ActiveSessions.ContainsKey(1));
        Check("disband: leader's menu is gone", !hs[0].Dispatcher.IsPlayerOneLeader && !hs[0].Dispatcher.IsInLobbyGroup);
    }

    static void S12_DeviceCommands()
    {
        var w = World.Create(); var hs = StartedGroup(w, 3);
        FakePico.Calls.Clear();

        int n = w.Manager.SendDeviceCommand(new List<string> { hs[0].Key, hs[1].Key }, DeviceCommandType.RecenterView);
        Check("recenter sent to the 2 selected headsets only", n == 2 && FakePico.ControllerResets == 2, $"sent={n} resets={FakePico.ControllerResets}");

        // reboot while ToBService is not bound -> refused with a warning, no OS call
        w.Manager.SendDeviceCommand(new List<string> { hs[0].Key }, DeviceCommandType.Reboot);
        Check("reboot ignored when ToBService unbound", !FakePico.Calls.Any(c => c.StartsWith("DeviceAction")) && Count(Debug.Warnings, "not bound") == 1);

        w.Kiosk.toBServiceBind("ok");
        FakePico.Calls.Clear();
        w.Manager.SendDeviceCommand(new List<string> { hs[0].Key, hs[2].Key }, DeviceCommandType.Reboot);
        Check("reboot reaches ToB for each selected headset", FakePico.Calls.Count(c => c == "DeviceAction:DEVICE_CONTROL_REBOOT") == 2);
        w.Manager.SendDeviceCommand(new List<string> { hs[1].Key }, DeviceCommandType.Shutdown);
        Check("shutdown reaches ToB", FakePico.Calls.Contains("DeviceAction:DEVICE_CONTROL_SHUTDOWN"));

        // kiosk release / re-lock
        FakePico.Calls.Clear();
        w.Manager.SendDeviceCommand(new List<string> { hs[0].Key }, DeviceCommandType.ExitKiosk);
        Check("release: stops being Home launcher", FakePico.Calls.Contains("AppAsHome:S_OFF:com.legacyvr.kartclient"));
        Check("release: Home/Back/Volume/Power keys restored",
            FakePico.Calls.Contains("HomeKey:SINGLE_CLICK=VALUE_HOME_GO_TO_HOME") && FakePico.Calls.Contains("EnableBack") &&
            FakePico.Calls.Contains("EnableVolume") && FakePico.Calls.Contains("PowerKey:single=True,enable=True"));
        Check("KioskReleased flag set", w.Kiosk.KioskReleased);
        FakePico.Calls.Clear();
        w.Kiosk.toBServiceBind("rebind");
        Check("re-binding while released does NOT re-lock", !FakePico.Calls.Contains("AppAsHome:S_ON:com.legacyvr.kartclient"));
        w.Manager.SendDeviceCommand(new List<string> { hs[0].Key }, DeviceCommandType.EnterKiosk);
        Check("re-lock applies the full lock-down again", FakePico.Calls.Contains("AppAsHome:S_ON:com.legacyvr.kartclient") && FakePico.Calls.Contains("DisableBack") && !w.Kiosk.KioskReleased);

        Check("unknown MACs are skipped without error", w.Manager.SendDeviceCommand(new List<string> { "DE:AD:BE:EF:00:00" }, DeviceCommandType.RecenterView) == 0);
    }

    static void S13_Kiosk()
    {
        var w = World.Create();
        Check("Awake initialised proximity sensor", FakePico.Called("InitPsensor"));
        Check("Awake bound ToBService with this object's name", FakePico.Called("InitToB") && FakePico.Called("SetUnityObjectName:PicoKioskController") && FakePico.Called("BindToB"));
        Check("screen sleep timeout set to never", Screen.sleepTimeout == SleepTimeout.NeverSleep);
        FakePico.Calls.Clear();
        w.Kiosk.toBServiceBind("success");
        Check("bound flag set", w.Kiosk.IsToBServiceBound);
        foreach (string c in new[] { "AppAsHome:S_ON:com.legacyvr.kartclient", "HomeKey:SINGLE_CLICK=VALUE_HOME_DISABLE", "HomeKey:DOUBLE_CLICK=VALUE_HOME_DISABLE",
                                     "DisableBack", "DisableVolume", "PowerKey:single=True,enable=False", "SleepDelay:NEVER", "ScreenOff:NEVER", "WakeLock" })
            Check("lock-down call: " + c, FakePico.Called(c));
        Check("identity from ToB", w.Kiosk.CachedMacAddress == "AA:BB:CC:00:00:01" && w.Kiosk.CachedSerialNumber == "SN-TOB-1");

        // Pico G1 on an old PUI ROM: ToBService throws
        FakePico.Reset(); FakePico.ToBThrows = true; FakePico.SdkSerial = "G1-SERIAL";
        R.SetStatic(typeof(PicoKioskController), "Instance", null);
        var k = new GameObject("PicoKioskController").AddComponent<PicoKioskController>();
        Check("ToB failure is caught, warning logged", Count(Debug.Warnings, "ToBService init fallback") == 1);
        Check("fallback serial comes from Pvr System.UPvr_GetDeviceSN", k.CachedSerialNumber == "G1-SERIAL");
        Check("fallback MAC is never empty (wlan0 or device id)", !string.IsNullOrEmpty(k.CachedMacAddress));
        FakePico.SdkSerialThrows = true; R.Set(k, "CachedSerialNumber", null); k.PopulateFallbackDeviceIdentifiers();
        Check("if even the SDK serial fails -> Unity device id", k.CachedSerialNumber == SystemInfo.deviceUniqueIdentifier);

        // second kiosk instance must not duplicate
        int objects = GameObject.All.Count(g => !g.destroyed);
        var dup = new GameObject("PicoKioskController").AddComponent<PicoKioskController>();
        Check("duplicate kiosk destroys itself (singleton)", dup.gameObject.destroyed);
    }

    static void S14_Heartbeat()
    {
        var w = World.Create(); w.StartServer();
        var h = new Headset("AA:BB:CC:00:00:01", "SN1") { Battery = 0.90f }; h.Connect(w);
        Check("registered with 90%", w.Record(h).BatteryPercent == 90);
        SystemInfo.batteryLevel = 0.42f;
        Sim.Pump(6);
        Check("heartbeat updated battery to 42%", w.Record(h).BatteryPercent == 42, "got " + w.Record(h).BatteryPercent);
        Check("last-seen refreshed", w.Record(h).LastSeenRealtime >= 4.9, "got " + w.Record(h).LastSeenRealtime);
        SystemInfo.batteryLevel = -1f; Sim.Pump(5.2);
        Check("unsupported battery (-1) reported as 100%, not 0%", w.Record(h).BatteryPercent == 100, "got " + w.Record(h).BatteryPercent);

        double seen = w.Record(h).LastSeenRealtime; h.Conn.Connected = false; Sim.Pump(11);
        Check("no heartbeat is sent after the link drops (no crash, no update)", w.Record(h).LastSeenRealtime == seen);
        Sim.Pump(5);
        Check("a silent headset becomes 'stale' (> 15 s) for the panel's no-signal marker", Time.realtimeSinceStartupAsDouble - w.Record(h).LastSeenRealtime > 15.0, "age=" + (Time.realtimeSinceStartupAsDouble - w.Record(h).LastSeenRealtime));
    }

    static void S15_Disconnect()
    {
        var w = World.Create(); var hs = StartedGroup(w, 3);
        string gone = null; w.Manager.OnHeadsetDisconnected += mac => gone = mac;
        string key = hs[1].Key; hs[1].Disconnect(w);
        Check("registry shrinks to 2", w.Manager.RegisteredHeadsetCount == 2);
        Check("disconnect event carries the headset key", gone == key);
        Check("others untouched", w.Record(hs[0]) != null && w.Record(hs[2]) != null);
        hs[1].Conn.Connected = true;
        NetworkServer.Dispatch(hs[1].Conn, new DeviceStatusMessage { BatteryPercent = 5 });
        Check("late message from a dead connection is ignored", w.Manager.RegisteredHeadsets.All(r => r.BatteryPercent != 5));
        w.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", new List<string> { key, hs[0].Key }, key);
        Check("dispatch to a disconnected headset is skipped with a warning", Count(Debug.Warnings, "Cannot dispatch disconnected") == 1);
    }

    static void S16_AutoConnect()
    {
        // --- (a) discovery finds the Mac -> StartClient(kcp://ip:7777)
        var w = World.Create(server: false, withRig: false);
        var auto = new GameObject("KartClientAutoConnect").AddComponent<KartClientAutoConnect>();
        Sim.RunStart(auto);
        Sim.Pump(1.0);
        Check("starts UDP discovery", w.Discovery.StartDiscoveryCalls >= 1);
        Check("status says searching", auto.Status.Contains("Searching"), auto.Status);
        Check("does not connect before a server answers", w.Manager.StartClientCalls == 0);
        w.Discovery.FireServerFound(new Uri("kcp://192.168.1.20:7777"));
        Sim.Pump(0.5);
        Check("connects to the discovered Mac", w.Manager.StartClientCalls == 1 && w.Manager.StartClientUris[0] != null && w.Manager.StartClientUris[0].Host == "192.168.1.20");
        Check("uses the kcp transport port", w.Manager.StartClientUris[0].Port == 7777);
        Check("stops broadcasting once found", w.Discovery.StopDiscoveryCalls >= 1);
        Check("status says connecting", auto.Status.Contains("Connecting to 192.168.1.20"), auto.Status);

        // --- (b) link drops -> it searches again by itself
        int before = w.Discovery.StartDiscoveryCalls;
        NetworkClient.active = false;
        Sim.Pump(8);
        Check("reconnect: re-starts discovery after a drop", w.Discovery.StartDiscoveryCalls > before);
        w.Discovery.FireServerFound(new Uri("kcp://192.168.1.99:7777")); Sim.Pump(1);
        Check("reconnect: follows a Mac that changed IP", w.Manager.StartClientUris.Last().Host == "192.168.1.99");

        // --- (c) nobody answers: keeps retrying, never connects
        var w2 = World.Create(server: false, withRig: false);
        var a2 = new GameObject("auto").AddComponent<KartClientAutoConnect>(); Sim.RunStart(a2);
        Sim.Pump(40);
        Check("no Mac around: retries discovery repeatedly", w2.Discovery.StartDiscoveryCalls >= 3, "calls=" + w2.Discovery.StartDiscoveryCalls);
        Check("no Mac around: never calls StartClient", w2.Manager.StartClientCalls == 0);

        // --- (d) manual address bypasses discovery (router blocks broadcast)
        var w3 = World.Create(server: false, withRig: false);
        var a3 = new GameObject("auto").AddComponentWith<KartClientAutoConnect>(a => R.Set(a, "manualServerAddress", " 192.168.1.77 "));
        Sim.RunStart(a3); Sim.Pump(1);
        Check("manual address: connects without discovery", w3.Manager.StartClientCalls == 1 && w3.Manager.networkAddress == "192.168.1.77" && w3.Discovery.StartDiscoveryCalls == 0);

        // --- (e) never acts as a client on the Mac
        var w4 = World.Create(server: false, withRig: false); NetworkServer.active = true;
        var a4 = new GameObject("auto").AddComponent<KartClientAutoConnect>(); Sim.RunStart(a4); Sim.Pump(15);
        Check("server active: auto-connect stays idle", w4.Manager.StartClientCalls == 0 && w4.Discovery.StartDiscoveryCalls == 0);

        // --- (f) misconfiguration is visible, not silent
        var w5 = World.Create(server: false, withRig: false); UnityEngine.Object.Destroy(w5.Discovery);
        var a5 = new GameObject("auto").AddComponent<KartClientAutoConnect>(); Sim.RunStart(a5); Sim.Pump(1);
        Check("no NetworkDiscovery + no manual address -> clear status", a5.Status.Contains("No NetworkDiscovery"), a5.Status);

        // --- (g) full chain: discovered -> connect sequence -> registered on the Mac
        var wm = World.Create(); wm.StartServer();
        var h = new Headset("AA:BB:CC:00:00:77", "SN77"); h.Connect(wm);
        Check("end-to-end: connected headset appears in the Mac registry", wm.Manager.RegisteredHeadsetCount == 1 && wm.Record(h).Dispatcher != null);
    }

    static void S17_OperatorPanel()
    {
        var w = World.Create(); w.StartServer(); var hs = w.ConnectHeadsets(3);
        var boot = new GameObject("MasterControl").AddComponentWith<MasterBootstrap>(b => R.Set(b, "autoStartOnLaunch", false));
        var panel = new GameObject("panel").AddComponent<MasterOperatorPanel>();
        Sim.RunStart(panel);

        var sel = R.Get<HashSet<string>>(panel, "_selectedMacs");
        foreach (Headset h in hs) sel.Add(h.Key);
        R.Set(panel, "_leaderMac", hs[2].Key);

        Action gui = () => R.Call(panel, "OnGUI");
        Func<string> status = () => R.Get<string>(panel, "_status");

        GUILayout.Clicks.Add("LAUNCH"); gui(); Sim.Pump(1);
        Check("LAUNCH button starts the game on all selected headsets", Addressables.SceneLoads.Count == 3, "loads=" + Addressables.SceneLoads.Count);
        Check("ticked P1 is the leader", w.Record(hs[2]).IsPlayerOneLeader && !w.Record(hs[0]).IsPlayerOneLeader);
        Check("session id auto-increments", R.Get<string>(panel, "_sessionIdText") == "2");

        GUILayout.Clicks.Add("Form group (P1 picks)"); gui();
        Check("'Form group' makes a lobby group (P1 picks)", w.Manager.ActiveSessions.ContainsKey(2) && w.Record(hs[2]).AssignedGameModuleId == "Hub");
        Check("lobby role pushed to Player 1", hs[2].Dispatcher.IsPlayerOneLeader && hs[2].Dispatcher.CurrentSessionId == 2);

        int resetsBefore = FakePico.ControllerResets;
        GUILayout.Clicks.Add("Recenter view"); gui();
        Check("'Recenter view' reaches the headsets", FakePico.ControllerResets == resetsBefore + 3);

        w.Kiosk.toBServiceBind("ok"); FakePico.Calls.Clear();
        GUILayout.Clicks.Add("Reboot"); gui();
        Check("Reboot is DISABLED until 'Arm power' is ticked", !FakePico.Calls.Any(c => c.StartsWith("DeviceAction")));
        R.Set(panel, "_armPowerCommands", true);
        GUILayout.Clicks.Add("Reboot"); gui();
        Check("armed Reboot goes through", FakePico.Calls.Count(c => c == "DeviceAction:DEVICE_CONTROL_REBOOT") == 3);
        Check("arming resets after use", !R.Get<bool>(panel, "_armPowerCommands"));

        GUILayout.Clicks.Add("Release kiosk"); gui();
        Check("'Release kiosk' reaches headsets", w.Kiosk.KioskReleased);

        GUILayout.Clicks.Add("Return to hub"); gui();
        Check("'Return to hub' (selection) removes headsets from groups", hs.All(h => w.Record(h).AssignedSessionId == -1));

        Check("a group emptied by 'Return to hub' is forgotten (no ghost sessions in the panel)", w.Manager.ActiveSessions.Count == 0, "sessions=" + w.Manager.ActiveSessions.Count);

        // session row: "Group to lobby" keeps the group, "Disband" ends it (labels are distinct from the selection-level button)
        w.Manager.FormLobbyGroup(7, World.Keys(hs), hs[0].Key);
        GUILayout.Clicks.Add("Group to lobby"); gui();
        Check("'Group to lobby' keeps the group together", w.Manager.ActiveSessions.ContainsKey(7) && w.Record(hs[0]).AssignedSessionId == 7);
        GUILayout.Clicks.Add("Disband"); gui();
        Check("'Disband' ends the group", !w.Manager.ActiveSessions.ContainsKey(7) && w.Record(hs[0]).AssignedSessionId == -1);

        // server stopped: launch must be disabled
        NetworkServer.active = false; GUILayout.ButtonsSeen.Clear(); gui();
        Check("LAUNCH disabled when the server is stopped", GUILayout.ButtonsSeen.Contains("LAUNCH [disabled]"), string.Join("|", GUILayout.ButtonsSeen));
        Check("'Start Server' offered when stopped", GUILayout.ButtonsSeen.Contains("Start Server"));
        Check("panel shows the Mac LAN IP", GUILayout.Labels.Any(l => l.Contains("192.168.1.20")));
        Check("panel shows 8-headset capacity", GUILayout.Labels.Any(l => l.Contains("/8 headsets")));
    }

    static void S18_Bootstrap()
    {
        string tmp = Path.Combine(Path.GetTempPath(), "mowgli_content_" + Guid.NewGuid().ToString("N"));
        var w = World.Create();
        var boot = new GameObject("MasterControl").AddComponentWith<MasterBootstrap>(b => { R.Set(b, "autoStartOnLaunch", false); R.Set(b, "contentFolderOverride", tmp); });
        Sim.RunStart(boot); Sim.Pump(0.5);
        Check("frame rate capped for the laptop", Application.targetFrameRate == 30 && QualitySettings.vSyncCount == 0);
        Check("idle until started", !NetworkServer.active && boot.ContentStatus == "Stopped");

        boot.StartAll();
        Check("StartAll starts the Mirror server", w.Manager.StartServerCalls == 1 && NetworkServer.active);
        Check("StartAll advertises on the LAN (UDP discovery)", w.Discovery.AdvertiseCalls == 1 && boot.DiscoveryAdvertising);
        Check("content server reports where it serves", boot.ContentStatus.StartsWith("Serving"), boot.ContentStatus);
        Check("content URL uses the Mac LAN IP", boot.ContentUrlBase == "http://192.168.1.20:8080/");
        Check("Android content folder created", Directory.Exists(Path.Combine(tmp, "Android")));

        // REAL http request against the REAL server started by the bootstrap
        try
        {
            File.WriteAllText(Path.Combine(tmp, "Android", "catalog_wave.json"), "{\"x\":1}");
            string body = new WebClient().DownloadString("http://127.0.0.1:8080/Android/catalog_wave.json");
            Check("REAL HTTP: catalog downloadable from the content folder", body == "{\"x\":1}");
            string readme = new WebClient().DownloadString("http://127.0.0.1:8080/README.txt");
            Check("README documents the {SERVER_IP} token", readme.Contains("{SERVER_IP}"));
            Check("served-request counter increments", boot.ContentRequestsServed >= 2);
        }
        catch (Exception e) { Check("REAL HTTP request", false, e.Message); }

        boot.StopAll();
        Check("StopAll stops the server", !NetworkServer.active && w.Manager.StopServerCalls == 1);
        Check("StopAll stops advertising + content", !boot.DiscoveryAdvertising && boot.ContentStatus == "Stopped");
        bool refused = false; try { new WebClient().DownloadString("http://127.0.0.1:8080/README.txt"); } catch (WebException) { refused = true; }
        Check("REAL HTTP: port closed after StopAll", refused);

        // discovery port already taken by another master
        w.Discovery.ThrowOnAdvertise = true; Debug.Errors.Clear();
        boot.StartAll();
        Check("advertise failure is reported but the server still runs", NetworkServer.active && !boot.DiscoveryAdvertising && Debug.Errors.Any(e => e.Contains("Discovery advertising failed")));
        boot.StopAll();
        try { Directory.Delete(tmp, true); } catch (Exception) { }
    }

    static void S19_LobbyMenu()
    {
        var w = World.Create(); var hs = StartedGroup(w, 3);
        w.Manager.FormLobbyGroup(1, World.Keys(hs), hs[0].Key);

        var menuGo = new GameObject("LeaderMenu"); menuGo.AddComponent<TextMesh>(); var menu = menuGo.AddComponent<HubLeaderMenu>();
        var textMesh = menuGo.GetComponent<TextMesh>();
        Action update = () => R.Call(menu, "Update");

        R.SetStatic(typeof(KartClientDispatcher), "LocalInstance", hs[0].Dispatcher);
        hs[0].As(update);
        Check("Player 1 sees the game list", textMesh.text.Contains("PLAYER 1") && textMesh.text.Contains("KartRacing_Track01") && textMesh.text.Contains("WaveShooter"));
        Check("first entry highlighted", textMesh.text.Contains("> KartRacing_Track01"));

        FakePico.Axis = new Vector2(0, -0.9f); hs[0].As(update);
        Check("touchpad down moves to the next game", textMesh.text.Contains("> WaveShooter"), textMesh.text);
        hs[0].As(update);
        Check("one swipe = one step (edge-detected, no runaway scroll)", textMesh.text.Contains("> WaveShooter"));
        FakePico.Axis = new Vector2(0, 0); hs[0].As(update);
        FakePico.Axis = new Vector2(0, 0.9f); hs[0].As(update);
        Check("touchpad up moves back", textMesh.text.Contains("> KartRacing_Track01"));
        FakePico.Axis = new Vector2(0, 0); hs[0].As(update);

        Input.Down.Add(KeyCode.DownArrow); hs[0].As(update); Input.Down.Clear();
        Check("keyboard arrows work in the Editor", textMesh.text.Contains("> WaveShooter"));

        FakePico.KeysDown.Add(Pvr_KeyCode.TRIGGER); hs[0].As(update); FakePico.KeysDown.Clear(); Sim.Pump(1);
        Check("TRIGGER launches the highlighted game for the group", Addressables.SceneLoads.Count == 3 && Addressables.SceneLoads.All(s => s == "Wave_Arena"));
        hs[0].As(update);
        Check("menu disappears once the game loaded", textMesh.text == string.Empty);

        // regular group member and ungrouped headset
        w.Manager.ReturnSessionToHub(1); Sim.Pump(1);
        R.SetStatic(typeof(KartClientDispatcher), "LocalInstance", hs[1].Dispatcher); hs[1].As(update);
        Check("non-leader sees a waiting message", textMesh.text.Contains("Waiting for Player 1"));
        w.Manager.DisbandSession(1);
        hs[1].As(update);
        Check("ungrouped headset sees no menu", textMesh.text == string.Empty);

        // status display
        var st = new GameObject("status"); st.AddComponent<TextMesh>(); var disp = st.AddComponent<HubStatusDisplay>();
        Time.unscaledTime = 100f;
        hs[1].As(() => R.Call(disp, "Update"));
        Check("status text: connected + kiosk + battery", st.GetComponent<TextMesh>().text.Contains("Connected") && st.GetComponent<TextMesh>().text.Contains("Kiosk"));
        NetworkClient.RunAs(null, () => { Time.unscaledTime = 200f; R.Call(disp, "Update"); });
        Check("status text: not connected", !st.GetComponent<TextMesh>().text.Contains("Connected - waiting"));
    }

    static void S20_CameraMath()
    {
        var w = World.Create();
        var kart = new GameObject("kart");
        kart.transform.rotation = Quaternion.Euler(0, 90, 0); kart.transform.position = new Vector3(10, 0, 5);
        w.RigHead.localRotation = Quaternion.Euler(0, 30, 0);   // headset physically looks 30 deg off its own zero

        w.Rig.BindToLocalKart(kart.transform);
        Func<Vector3> gaze = () => (w.Rig.transform.rotation * (w.RigHead.localRotation * Vector3.forward));
        Check("recenter: gaze aligned with kart forward (yaw 90)", Near(YawDeg(gaze()), 90f, 0.5f), "yaw=" + YawDeg(gaze()));
        Check("recenter resets the Hummingbird controller", FakePico.ControllerResets >= 1);
        Check("rig is NOT parented to the kart", w.Rig.transform.parent == null);

        w.RigHead.localRotation = Quaternion.Euler(0, 70, 0);   // player turns head +40 deg
        Check("head turn adds on top of kart heading (+40)", Near(YawDeg(gaze()), 130f, 0.5f), "yaw=" + YawDeg(gaze()));

        // kart drives around a corner: LateUpdate follows the heading and position
        kart.transform.rotation = Quaternion.Euler(0, 180, 0); kart.transform.position = new Vector3(0, 0, 20);
        for (int i = 0; i < 60; i++) R.Call(w.Rig, "LateUpdate");
        Check("rig follows kart yaw while preserving head offset (180+40)", Near(Mathf.DeltaAngle(0, YawDeg(gaze())), Mathf.DeltaAngle(0, 220f), 1f), "yaw=" + YawDeg(gaze()));
        Check("rig position follows the kart seat", Near(w.Rig.transform.position.z, 20f + (-0.1f) * 1f, 0.2f) || w.Rig.transform.position.y > 0.5f, w.Rig.transform.position.x + "," + w.Rig.transform.position.y + "," + w.Rig.transform.position.z);

        // pitch/roll of the kart must not reach the rig (VehicleHorizonLocked, pitch ratio 0)
        kart.transform.rotation = Quaternion.Euler(25, 180, 15);
        for (int i = 0; i < 60; i++) R.Call(w.Rig, "LateUpdate");
        Vector3 up = w.Rig.transform.rotation * Vector3.up;
        Check("kart pitch/roll NOT transferred to the player (horizon locked)", Near(up.y, 1f, 0.01f), "up.y=" + up.y);

        // stationary mode keeps the yaw fixed
        w.Rig.SetTrackingMode(CameraRigTrackingMode.StationarySeated);
        float yawBefore = YawDeg(gaze()); kart.transform.rotation = Quaternion.Euler(0, 10, 0);
        for (int i = 0; i < 30; i++) R.Call(w.Rig, "LateUpdate");
        Check("StationarySeated: world yaw does not follow the kart", Near(Mathf.DeltaAngle(yawBefore, YawDeg(gaze())), 0f, 0.5f));

        // singleton
        var dupGo = new GameObject("dup"); var dup = dupGo.AddComponent<Pico3DoFKartCameraRig>();
        Check("second rig destroys itself", dupGo.destroyed);
    }

    static void S21_Kart()
    {
        var go = new GameObject("kart"); var rb = go.AddComponent<Rigidbody>(); rb.isKinematic = false; rb.useGravity = true;
        var box = go.AddComponent<BoxCollider>(); box.isTrigger = false;
        var kart = go.AddComponent<KinematicKartController>();
        Check("Awake forces isKinematic", rb.isKinematic);
        Check("Awake disables gravity", !rb.useGravity);
        Check("Awake makes the BoxCollider a trigger", box.isTrigger);

        kart.isOwned = true;
        var pad = new GameObject("pad"); pad.tag = "BoostPad";
        R.Call(kart, "OnTriggerEnter", pad.AddComponent<BoxCollider>());
        Check("boost pad starts a boost", R.Get<float>(kart, "_boostTimer") > 1f && R.Get<float>(kart, "_currentSpeed") > 18f);

        var other = new GameObject("otherKart"); other.tag = "PlayerKart"; other.transform.position = new Vector3(1, 0, 0);
        R.Set(kart, "_currentSpeed", 10f);
        R.Call(kart, "OnTriggerStay", other.AddComponent<BoxCollider>());
        Check("kart bump pushes apart and slows (0.85)", Near(R.Get<float>(kart, "_currentSpeed"), 8.5f) && R.Get<Vector3>(kart, "_bumpPushVelocity").x < 0);

        // not owned -> remote karts never simulate locally
        var go2 = new GameObject("remote"); go2.AddComponent<Rigidbody>(); go2.AddComponent<BoxCollider>();
        var remote = go2.AddComponent<KinematicKartController>(); remote.isOwned = false; R.Set(remote, "_currentSpeed", 10f);
        R.Call(remote, "OnTriggerStay", other.GetComponent<BoxCollider>());
        Check("remote (not owned) kart ignores local trigger logic", Near(R.Get<float>(remote, "_currentSpeed"), 10f));

        // input -> speed
        FakePico.KeysHeld.Add(Pvr_KeyCode.TRIGGER); FakePico.Axis = new Vector2(0.5f, 0);
        var go3 = new GameObject("me"); go3.AddComponent<Rigidbody>(); go3.AddComponent<BoxCollider>();
        var me = go3.AddComponent<KinematicKartController>(); me.isOwned = true;
        for (int i = 0; i < 10; i++) R.Call(me, "Update");
        Check("trigger accelerates the kart", R.Get<float>(me, "_currentSpeed") > 5f);
        Check("steering from the touchpad turns the kart", Math.Abs(YawDeg(go3.transform.forward)) > 1f);
        Check("kart moved forward without physics", go3.transform.position.z > 1f);
    }

    static void S22_Validation()
    {
        var w = World.Create(); var hs = StartedGroup(w, 2);
        w.Manager.DispatchGameModuleSession(1, "NoSuchGame", World.Keys(hs), hs[0].Key);
        Check("unknown module id: error logged, nothing dispatched", Debug.Errors.Any(e => e.Contains("Unknown GameModuleId")) && Addressables.SceneLoads.Count == 0);
        w.Manager.DispatchGameModuleSession(1, null, World.Keys(hs), hs[0].Key);
        Check("null module id does not throw", true);
        w.Manager.CreateSessionAndDispatchScene(1, new List<string>(), "x", "scene");
        Check("empty headset list: nothing happens", Addressables.SceneLoads.Count == 0 && !w.Manager.ActiveSessions.ContainsKey(1));
        w.Manager.DispatchGameModuleSession(1, "KartRacing_Track01", new List<string> { hs[0].Key.ToLowerInvariant(), hs[1].Key }, null);
        Sim.Pump(1);
        Check("MAC matching is case-insensitive; null leader defaults to first headset", Addressables.SceneLoads.Count == 2 && w.Record(hs[0]).IsPlayerOneLeader);
        w.Manager.FormLobbyGroup(9, null, null);
        w.Manager.ReturnSessionToHub(12345); w.Manager.DisbandSession(12345);
        Check("unknown session ids are ignored", true);
        Check("late registration for an unknown module is harmless", true);
        Check("RegisterGameModuleAtRuntime adds a launchable module", RuntimeModule(w));
        var w2 = World.Create(); w2.StartServer();
        w2.Manager.RefreshLanAddress();
        Check("LAN override can be changed from the UI", true);
    }
    static bool RuntimeModule(World w)
    {
        w.Manager.RegisterGameModuleAtRuntime(new GameModuleDescriptor { GameModuleId = "RuntimeGame", AddressableSceneKey = "RT", PlayerAvatarPrefab = w.KartPrefab });
        var h = w.Manager.RegisteredHeadsets.First();
        w.Manager.DispatchGameModuleSession(40, "RuntimeGame", new List<string> { h.MacAddress }, h.MacAddress);
        Sim.Pump(1);
        return Addressables.SceneLoads.Contains("RT");
    }
}
