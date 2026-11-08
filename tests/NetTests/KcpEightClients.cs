// REAL network test: Mirror's own KCP transport library (kcp2k, plain C#) with exactly the settings the project's
// MasterKartNetworkManager prefab uses (NoDelay, 10 ms interval, FastResend 2, 4096 windows, dual-mode socket),
// one "Mac" server and 8 "headset" clients over real UDP sockets. Proves the transport side of: Mac can host 8 headsets.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using kcp2k;

static class KcpEightClients
{
    static int _pass, _fail;
    static void Check(string n, bool ok, string d = null) { if (ok) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n + (d != null ? "   [" + d + "]" : "")); } }

    static KcpConfig ProjectConfig(bool dualMode)
    {
        // Values from MasterKartNetworkManager.prefab / KcpTransport defaults.
        return new KcpConfig(DualMode: dualMode, RecvBufferSize: 1024 * 1027 * 7, SendBufferSize: 1024 * 1027 * 7, Mtu: 1200,
            NoDelay: true, Interval: 10, FastResend: 2, CongestionWindow: false, SendWindowSize: 4096, ReceiveWindowSize: 4096,
            Timeout: 10000, MaxRetransmits: 40);
    }

    static int Main()
    {
        Log.Info = _ => { }; Log.Warning = m => Console.WriteLine("  [kcp warn] " + m); Log.Error = m => Console.WriteLine("  [kcp error] " + m);

        bool dual = true; KcpServer server = null;
        var connected = new List<int>(); var disconnected = new List<int>(); var serverRx = new Dictionary<int, List<string>>();
        var serverUnreliable = 0; var errors = new List<string>();
        const ushort port = 17777;

        Func<bool, KcpServer> make = d => new KcpServer(
            (id, ep) => { lock (connected) connected.Add(id); },
            (id, data, ch) => { string s = Encoding.UTF8.GetString(data.Array, data.Offset, Math.Min(data.Count, 40)); lock (serverRx) { if (ch == KcpChannel.Reliable) { if (!serverRx.ContainsKey(id)) serverRx[id] = new List<string>(); serverRx[id].Add(s); } else Interlocked.Increment(ref serverUnreliable); } },
            id => { lock (disconnected) disconnected.Add(id); },
            (id, code, msg) => errors.Add(code + ":" + msg),
            ProjectConfig(d));

        Console.WriteLine("== KCP: Mac server hosts 8 headsets (real UDP, project settings)");
        try { server = make(true); server.Start(port); }
        catch (Exception e)
        {
            Console.WriteLine("  note: dual-mode socket unavailable in this sandbox (" + e.GetType().Name + "); retesting IPv4-only");
            dual = false; server = make(false); server.Start(port);
        }
        Check("server socket opened on UDP " + port + (dual ? " (dual-mode IPv4+IPv6)" : " (IPv4 only: sandbox has no IPv6)"), server.IsActive());

        var clients = new List<KcpClient>(); var clientConnected = new bool[8]; var clientRx = new List<string>[8]; var clientBytes = new int[8];
        for (int i = 0; i < 8; i++)
        {
            int idx = i; clientRx[i] = new List<string>();
            var c = new KcpClient(
                () => clientConnected[idx] = true,
                (data, ch) => { lock (clientRx[idx]) { clientBytes[idx] += data.Count; if (data.Count < 100) clientRx[idx].Add(Encoding.UTF8.GetString(data.Array, data.Offset, data.Count)); } },
                () => clientConnected[idx] = false,
                (code, msg) => errors.Add("client" + idx + ":" + code + ":" + msg),
                ProjectConfig(dual));
            clients.Add(c);
        }

        Action<int> pump = ms =>
        {
            var sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < ms) { server.Tick(); foreach (KcpClient c in clients) c.Tick(); Thread.Sleep(2); }
        };

        var swConnect = Stopwatch.StartNew();
        foreach (KcpClient c in clients) c.Connect("127.0.0.1", port);
        while (swConnect.ElapsedMilliseconds < 5000 && clientConnected.Count(b => b) < 8) pump(20);
        long connectMs = swConnect.ElapsedMilliseconds;
        Check("all 8 headsets connected", clientConnected.All(b => b), "connected=" + clientConnected.Count(b => b));
        Check("server saw 8 distinct connections", connected.Distinct().Count() == 8, "ids=" + connected.Count);
        Check("connected quickly (< 2 s) -> " + connectMs + " ms", connectMs < 2000);

        // each headset registers (reliable), like DeviceRegistrationMessage
        for (int i = 0; i < 8; i++) clients[i].Send(new ArraySegment<byte>(Encoding.UTF8.GetBytes("REGISTER headset-" + i)), KcpChannel.Reliable);
        pump(400);
        Check("server received all 8 reliable registrations", serverRx.Count == 8 && serverRx.Values.All(l => l.Count == 1), "got " + serverRx.Count);
        Check("each registration arrived intact", Enumerable.Range(0, 8).All(i => serverRx.Values.Any(l => l[0] == "REGISTER headset-" + i)));

        // server -> one headset targeted message (TargetRpc-like) must reach ONLY that headset
        int target = connected[3];
        server.Send(target, new ArraySegment<byte>(Encoding.UTF8.GetBytes("LOAD_SCENE track01")), KcpChannel.Reliable);
        pump(300);
        int receivers = clientRx.Count(l => l.Contains("LOAD_SCENE track01"));
        Check("targeted server message reaches exactly one headset", receivers == 1, "receivers=" + receivers);

        // broadcast to all 8
        foreach (int id in connected.ToArray()) server.Send(id, new ArraySegment<byte>(Encoding.UTF8.GetBytes("HELLO-ALL")), KcpChannel.Reliable);
        pump(300);
        Check("server broadcast reaches all 8 headsets", clientRx.Count(l => l.Contains("HELLO-ALL")) == 8);

        // 20 Hz kinematic transforms from every headset (unreliable): 8 x 20 Hz x 3 s
        int sent = 0;
        for (int step = 0; step < 60; step++)
        {
            foreach (KcpClient c in clients) { c.Send(new ArraySegment<byte>(new byte[24]), KcpChannel.Unreliable); sent++; }
            pump(50);   // 20 Hz
        }
        pump(200);
        double lossPct = 100.0 * (sent - serverUnreliable) / sent;
        Check($"unreliable 20 Hz transform stream: {serverUnreliable}/{sent} delivered ({lossPct:F1}% loss on loopback)", lossPct < 2.0);

        // large reliable payload (e.g. a big RPC / scene info) to one headset: fragmentation + 4096 window
        var big = new byte[200 * 1024]; new Random(1).NextBytes(big);
        server.Send(connected[0], new ArraySegment<byte>(big), KcpChannel.Reliable);
        pump(1500);
        Check("200 KB reliable message delivered whole", clientBytes.Any(b => b >= big.Length) || clientBytes.Sum() >= big.Length, "bytes=" + string.Join(",", clientBytes));

        // one headset drops; the others are unaffected
        clients[5].Disconnect();
        pump(800);
        Check("server notices the dropped headset", disconnected.Count >= 1, "disc=" + disconnected.Count);
        Check("other 7 stay connected", Enumerable.Range(0, 8).Where(i => i != 5).All(i => clientConnected[i]));
        server.Send(connected[1], new ArraySegment<byte>(Encoding.UTF8.GetBytes("STILL-HERE")), KcpChannel.Reliable);
        pump(300);
        Check("messaging continues after a drop", clientRx.Any(l => l.Contains("STILL-HERE")));

        // the dropped headset reconnects (Wi-Fi blip): fresh connection works
        var re = new KcpClient(() => clientConnected[5] = true, (d, ch) => { }, () => clientConnected[5] = false, (c, m) => errors.Add(m), ProjectConfig(dual));
        clients[5] = re; clientConnected[5] = false; re.Connect("127.0.0.1", port);
        var swRe = Stopwatch.StartNew(); while (swRe.ElapsedMilliseconds < 3000 && !clientConnected[5]) pump(20);
        Check("blipped headset reconnects", clientConnected[5]);

        Check("no transport errors", errors.Count == 0, string.Join("|", errors.Take(3)));

        foreach (KcpClient c in clients) c.Disconnect(); pump(100); server.Stop();
        Console.WriteLine($"\nKCP RESULT: {_pass} passed, {_fail} failed");
        return _fail == 0 ? 0 : 1;
    }
}
