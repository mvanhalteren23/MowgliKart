// Builds a Mac "server" world and simulated Pico headsets around the REAL project scripts.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityEngine.AddressableAssets;
using Mirror;
using Mirror.Discovery;
using Pvr_UnitySDKAPI;
using LegacyVR.KartClient.SystemService;
using LegacyVR.KartRacing.CameraSystem;
using LegacyVR.KartRacing.Kart;
using LegacyVR.KartRacing.Networking;

public static class R
{
    private const BindingFlags F = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
    public static T Get<T>(object o, string name)
    {
        for (Type t = o.GetType(); t != null; t = t.BaseType)
        {
            FieldInfo f = t.GetField(name, F | BindingFlags.DeclaredOnly); if (f != null) return (T)f.GetValue(o);
            PropertyInfo p = t.GetProperty(name, F | BindingFlags.DeclaredOnly); if (p != null) return (T)p.GetValue(o, null);
        }
        throw new MissingMemberException(o.GetType().Name, name);
    }
    public static void Set(object o, string name, object v)
    {
        for (Type t = o.GetType(); t != null; t = t.BaseType)
        {
            FieldInfo f = t.GetField(name, F | BindingFlags.DeclaredOnly); if (f != null) { f.SetValue(o, v); return; }
            PropertyInfo p = t.GetProperty(name, F | BindingFlags.DeclaredOnly);
            if (p != null) { p.GetSetMethod(true).Invoke(o, new[] { v }); return; }
        }
        throw new MissingMemberException(o.GetType().Name, name);
    }
    public static void SetStatic(Type type, string name, object v)
    {
        PropertyInfo p = type.GetProperty(name, F); if (p != null) { p.GetSetMethod(true).Invoke(null, new[] { v }); return; }
        FieldInfo f = type.GetField(name, F); f.SetValue(null, v);
    }
    public static object Call(object o, string method, params object[] args)
    {
        MethodInfo m = o.GetType().GetMethod(method, F);
        if (m == null) throw new MissingMethodException(o.GetType().Name, method);
        try { return m.Invoke(o, args); } catch (TargetInvocationException e) { throw e.InnerException; }
    }
}

public class Headset
{
    private static int _nextConn = 100;
    public string Mac, Serial, Model = "Pico G2"; public float Battery = 0.8f;
    public NetworkConnectionToClient Conn; public KartClientDispatcher Dispatcher;

    public Headset(string mac, string serial) { Mac = mac; Serial = serial; }

    /// <summary>Boots the headset's identity and runs the real connect sequence (server accept, OnClientConnect, AddPlayer).</summary>
    public void Connect(World w, bool addPlayerAfterRegistration = false)
    {
        w.SetKioskIdentity(Mac, Serial);
        SystemInfo.batteryLevel = Battery; SystemInfo.deviceModel = Model;
        Conn = new NetworkConnectionToClient { connectionId = ++_nextConn };
        w.Manager.OnServerConnect(Conn);
        NetworkClient.Context = new FakeClientContext { AddPlayerDeferred = addPlayerAfterRegistration };
        NetworkClient.RunAs(Conn, () => w.Manager.OnClientConnect());
        if (addPlayerAfterRegistration) NetworkClient.RunAs(Conn, () => NetworkClient.FlushAddPlayer(Conn));
        Dispatcher = Conn.identity != null ? Conn.identity.GetComponent<KartClientDispatcher>() : null;
    }

    public void Disconnect(World w) { Conn.Connected = false; w.Manager.OnServerDisconnect(Conn); }
    public void As(Action a) { NetworkClient.RunAs(Conn, a); }
    public string Key { get { return MasterKartNetworkManager.BuildHeadsetKey(Mac, Serial, Conn != null ? Conn.connectionId : 0); } }
}

public class World
{
    public MasterKartNetworkManager Manager;
    public GameObject DispatcherPrefab, KartPrefab;
    public NetworkDiscovery Discovery;
    public PicoKioskController Kiosk;
    public Pico3DoFKartCameraRig Rig;
    public Transform RigHead;

    public static World Create(bool server = true, bool withRig = true)
    {
        // ---- reset every static the project scripts keep
        Sim.Reset(); NetworkServer.Reset(); NetworkClient.Reset(); FakePico.Reset(); Addressables.Reset();
        Pvr_ControllerManager.ResetStatic();
        NetworkManager.singleton = null;
        R.SetStatic(typeof(PicoKioskController), "Instance", null);
        R.SetStatic(typeof(KartClientDispatcher), "LocalInstance", null);
        R.SetStatic(typeof(Pico3DoFKartCameraRig), "Instance", null);
        R.SetStatic(typeof(KartClientAutoConnect), "Instance", null);

        var ctx = new Stack<NetworkConnectionToClient>();
        Sim.EnterContext = mb =>
        {
            ctx.Push(NetworkClient.Current);
            var nb = mb as NetworkBehaviour;
            if (nb != null && nb.FakeOwner != null) NetworkClient.Current = nb.FakeOwner;
        };
        Sim.ExitContext = () => { NetworkClient.Current = ctx.Pop(); };

        var w = new World();

        // ---- prefabs (components only; serialized values are applied where the test needs them)
        w.DispatcherPrefab = new GameObject("KartClientDispatcher");
        w.DispatcherPrefab.AddComponent<NetworkIdentity>();
        w.DispatcherPrefab.AddComponent<KartClientDispatcher>();

        w.KartPrefab = new GameObject("KinematicKart"); w.KartPrefab.tag = "PlayerKart";
        w.KartPrefab.AddComponent<NetworkIdentity>(); w.KartPrefab.AddComponent<Rigidbody>(); w.KartPrefab.AddComponent<BoxCollider>();
        w.KartPrefab.AddComponent<KinematicKartController>();

        var modules = new List<GameModuleDescriptor>
        {
            new GameModuleDescriptor { GameModuleId = "KartRacing_Track01", AddressableSceneKey = "Assets/Scenes/Tracks/Track01.unity",
                RemoteCatalogUrl = "", PlayerAvatarPrefab = w.KartPrefab, CameraTrackingMode = CameraRigTrackingMode.VehicleHorizonLocked, DefaultSlotSpacing = 2.5f },
            new GameModuleDescriptor { GameModuleId = "WaveShooter", AddressableSceneKey = "Wave_Arena",
                RemoteCatalogUrl = "http://{SERVER_IP}:8080/Android/catalog_wave.json", PlayerAvatarPrefab = w.KartPrefab,
                CameraTrackingMode = CameraRigTrackingMode.StationarySeated, DefaultSlotSpacing = 4f },
            new GameModuleDescriptor { GameModuleId = "NoPrefabGame", AddressableSceneKey = "NoPrefabScene", PlayerAvatarPrefab = null },
        };

        // ---- NetworkManager GameObject: manager + discovery (as in MasterKartNetworkManager.prefab)
        var go = new GameObject("MasterKartNetworkManager");
        w.Discovery = go.AddComponent<NetworkDiscovery>();
        if (server)
        {
            w.Manager = go.AddComponentWith<MasterKartNetworkManager>(m =>
            {
                R.Set(m, "clientDispatcherPrefab", w.DispatcherPrefab);
                R.Set(m, "defaultKinematicKartPrefab", w.KartPrefab);
                R.Get<List<GameModuleDescriptor>>(m, "registeredGameModules").AddRange(modules);
            });
            w.Manager.ServerLanAddress = "192.168.1.20";
        }
        else
        {
            w.Manager = go.AddComponentWith<MasterKartNetworkManager>(m => { });
        }

        w.Kiosk = new GameObject("PicoKioskController").AddComponent<PicoKioskController>();

        if (withRig)
        {
            var rigGo = new GameObject("Pvr_UnitySDK");
            var head = new GameObject("Head"); w.RigHead = head.transform; head.transform.parent = rigGo.transform;
            w.Rig = rigGo.AddComponentWith<Pico3DoFKartCameraRig>(r =>
            {
                R.Set(r, "pvrSdkRootTransform", rigGo.transform);
                R.Set(r, "pvrHeadTransform", head.transform);
            });
        }
        return w;
    }

    public void StartServer() { Manager.StartServer(); }

    public void SetKioskIdentity(string mac, string serial)
    {
        R.Set(Kiosk, "CachedMacAddress", mac); R.Set(Kiosk, "CachedSerialNumber", serial);
    }

    public List<Headset> ConnectHeadsets(int n, bool addPlayerAfterRegistration = false)
    {
        var list = new List<Headset>();
        for (int i = 0; i < n; i++)
        {
            var h = new Headset($"AA:BB:CC:00:00:{i + 1:X2}", $"SN{i + 1:000}");
            h.Connect(this, addPlayerAfterRegistration);
            list.Add(h);
        }
        return list;
    }

    public RegisteredHeadsetRecord Record(Headset h)
    {
        return Manager.RegisteredHeadsets.FirstOrDefault(r => r.ConnectionId == h.Conn.connectionId);
    }
    public static List<string> Keys(IEnumerable<Headset> hs) { return hs.Select(h => h.Key).ToList(); }
}
