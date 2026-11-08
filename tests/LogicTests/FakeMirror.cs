// In-memory Mirror. One process plays Mac + N headsets: NetworkServer routes client messages to registered handlers,
// [TargetRpc] methods simply execute (they are ordinary methods here), and NetworkClient.Current says WHICH headset
// is "running" so NetworkClient.Send knows the sender. Mirror's real KCP/serialisation/weaver are NOT exercised.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Mirror
{
    public interface NetworkMessage { }
    public class ServerAttribute : Attribute { }
    public class TargetRpcAttribute : Attribute { }
    public class SyncVarAttribute : Attribute { }

    public class NetworkConnection { public int connectionId; public NetworkIdentity identity; public string address = "10.0.0.x"; }
    public class NetworkConnectionToClient : NetworkConnection { public bool Connected = true; }

    public class NetworkIdentity : MonoBehaviour { public NetworkConnectionToClient owner; }

    public class NetworkBehaviour : MonoBehaviour
    {
        public bool isOwned, isLocalPlayer;
        public NetworkConnectionToClient FakeOwner;
        public virtual void OnStartLocalPlayer() { }
        public virtual void OnStartAuthority() { }
        public virtual void OnStopAuthority() { }
    }

    public struct SnapshotInterpolationSettings
    {
        public double bufferTimeMultiplier; public int bufferLimit; public float catchupNegativeThreshold, catchupPositiveThreshold;
        public double catchupSpeed, slowdownSpeed; public bool dynamicAdjustment;
    }

    public class NetworkManager : MonoBehaviour
    {
        public int sendRate = 60, maxConnections = 100;
        public List<GameObject> spawnPrefabs = new List<GameObject>();
        public GameObject playerPrefab;
        public bool autoCreatePlayer = true;
        public string networkAddress = "localhost";
        public SnapshotInterpolationSettings snapshotSettings = new SnapshotInterpolationSettings();
        public static NetworkManager singleton { get; internal set; }

        public List<Uri> StartClientUris = new List<Uri>();
        public int StartClientCalls, StartServerCalls, StopServerCalls;

        public virtual void Awake() { singleton = this; }
        public virtual void OnValidate() { }
        public virtual void OnStartServer() { }
        public virtual void OnServerConnect(NetworkConnectionToClient c) { }
        public virtual void OnServerAddPlayer(NetworkConnectionToClient c)
        {
            // Mirror's default; the project overrides it. Kept so a missing playerPrefab reproduces the real error.
            if (autoCreatePlayer && playerPrefab == null) { Debug.LogError("The PlayerPrefab is empty on the NetworkManager."); return; }
        }
        public virtual void OnServerDisconnect(NetworkConnectionToClient c) { }
        public virtual void OnClientConnect()
        {
            // Same as Mirror 96: ready + AddPlayer.
            NetworkClient.Ready();
            if (autoCreatePlayer) NetworkClient.AddPlayer();
        }

        public void StartServer() { StartServerCalls++; NetworkServer.active = true; OnStartServer(); }
        public void StopServer() { StopServerCalls++; NetworkServer.active = false; }
        public void StartClient() { StartClientCalls++; StartClientUris.Add(null); NetworkClient.active = true; }
        public void StartClient(Uri u) { StartClientCalls++; StartClientUris.Add(u); NetworkClient.active = true; }
    }

    /// <summary>"Which headset is executing right now". Set by the test world / coroutine scheduler.</summary>
    public class FakeClientContext { public NetworkConnectionToClient Conn; public bool AddPlayerDeferred; public bool PendingAddPlayer; }

    public static class NetworkServer
    {
        public static bool active;
        public static readonly Dictionary<Type, Delegate> Handlers = new Dictionary<Type, Delegate>();
        public static readonly List<GameObject> Spawned = new List<GameObject>();
        public static readonly List<string> Log = new List<string>();

        public static void Reset() { active = false; Handlers.Clear(); Spawned.Clear(); Log.Clear(); }

        public static void RegisterHandler<T>(Action<NetworkConnectionToClient, T> h, bool requireAuthentication = true) where T : struct, NetworkMessage
        { Handlers[typeof(T)] = h; }

        /// <summary>Delivers a message exactly as the server would after receiving it from `conn`.</summary>
        public static void Dispatch<T>(NetworkConnectionToClient conn, T msg) where T : struct, NetworkMessage
        {
            Delegate d;
            if (!Handlers.TryGetValue(typeof(T), out d)) { Log.Add("no handler for " + typeof(T).Name); return; }
            ((Action<NetworkConnectionToClient, T>)d)(conn, msg);
        }

        public static bool AddPlayerForConnection(NetworkConnectionToClient conn, GameObject player)
        {
            conn.identity = player.GetComponent<NetworkIdentity>();
            conn.identity.owner = conn;
            foreach (Component c in player.components)
            {
                var nb = c as NetworkBehaviour;
                if (nb == null) continue;
                nb.FakeOwner = conn; nb.isOwned = true; nb.isLocalPlayer = true;
                NetworkClient.RunAs(conn, () => nb.OnStartLocalPlayer());
            }
            return true;
        }

        public static void Spawn(GameObject o, NetworkConnectionToClient conn = null)
        {
            Spawned.Add(o);
            var id = o.GetComponent<NetworkIdentity>();
            if (id != null) id.owner = conn;
            if (conn == null) return;
            foreach (Component c in o.components)
            {
                var nb = c as NetworkBehaviour;
                if (nb == null) continue;
                nb.FakeOwner = conn; nb.isOwned = true; // owned object: OnStartAuthority, NOT OnStartLocalPlayer (as in Mirror)
                NetworkClient.RunAs(conn, () => nb.OnStartAuthority());
            }
        }

        public static void Destroy(GameObject o) { Spawned.Remove(o); UnityEngine.Object.Destroy(o); }
    }

    public static class NetworkClient
    {
        public static bool active;
        public static NetworkConnectionToClient Current;
        public static FakeClientContext Context = new FakeClientContext();
        public static bool isConnected { get { return Current != null && Current.Connected; } }
        public static bool ready;

        public static void Ready() { ready = true; }

        public static void AddPlayer()
        {
            if (Context.AddPlayerDeferred) { Context.PendingAddPlayer = true; return; }
            NetworkManager.singleton.OnServerAddPlayer(Current);
        }

        /// <summary>Test helper: complete a deferred AddPlayer (simulates the message arriving after the registration).</summary>
        public static void FlushAddPlayer(NetworkConnectionToClient conn)
        {
            if (!Context.PendingAddPlayer) return;
            Context.PendingAddPlayer = false;
            NetworkManager.singleton.OnServerAddPlayer(conn);
        }

        public static void Send<T>(T msg, int channel = 0) where T : struct, NetworkMessage
        {
            if (Current == null) throw new InvalidOperationException("NetworkClient.Send called outside any headset context");
            NetworkServer.Dispatch(Current, msg);
        }

        public static void RunAs(NetworkConnectionToClient conn, Action a)
        {
            NetworkConnectionToClient prev = Current; Current = conn;
            try { a(); } finally { Current = prev; }
        }

        public static void Reset() { active = false; Current = null; Context = new FakeClientContext(); ready = false; }
    }
}

namespace Mirror.Discovery
{
    public struct ServerResponse : NetworkMessage { public Uri uri; public long serverId; }
    public class ServerFoundUnityEvent<T> : UnityEngine.Events.UnityEvent<T> { }

    public class NetworkDiscovery : MonoBehaviour
    {
        public ServerFoundUnityEvent<ServerResponse> OnServerFound = new ServerFoundUnityEvent<ServerResponse>();
        public int StartDiscoveryCalls, StopDiscoveryCalls, AdvertiseCalls;
        public bool ThrowOnAdvertise;
        public void StartDiscovery() { StartDiscoveryCalls++; }
        public void StopDiscovery() { StopDiscoveryCalls++; }
        public void AdvertiseServer() { if (ThrowOnAdvertise) throw new System.Net.Sockets.SocketException(); AdvertiseCalls++; }
        /// <summary>Simulates a UDP discovery reply from a Mac.</summary>
        public void FireServerFound(Uri uri) { OnServerFound.Invoke(new ServerResponse { uri = uri }); }
    }
}
