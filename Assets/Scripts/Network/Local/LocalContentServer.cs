using System;
using System.IO;
using System.Net;
using System.Threading;

namespace LegacyVR.KartRacing.Networking.Local
{
    /// <summary>
    /// Tiny read-only static HTTP server so the Mac can host Addressables catalogs/AssetBundles
    /// (http://&lt;mac-ip&gt;:8080/Android/catalog_x.json) for the headsets without any extra software.
    /// Pure .NET (HttpListener) - no Unity dependency so it is testable outside the editor.
    /// GET/HEAD only, confined to RootDirectory (path traversal rejected).
    /// </summary>
    public sealed class LocalContentServer : IDisposable
    {
        public string RootDirectory { get; }
        public int Port { get; }
        public bool IsRunning => _listener != null && _listener.IsListening;
        public long RequestsServed => Interlocked.Read(ref _requestsServed);
        public event Action<string> Log;

        private HttpListener _listener;
        private Thread _thread;
        private long _requestsServed;
        private readonly string _rootFull;

        public LocalContentServer(string rootDirectory, int port = 8080)
        {
            if (string.IsNullOrWhiteSpace(rootDirectory)) throw new ArgumentException("rootDirectory");
            RootDirectory = rootDirectory;
            Port = port;
            Directory.CreateDirectory(rootDirectory);
            _rootFull = Path.GetFullPath(rootDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        }

        public void Start()
        {
            if (IsRunning) return;

            _listener = new HttpListener();
            // "+" listens on every interface (needed so headsets on the LAN can connect); no admin rights needed on macOS.
            _listener.Prefixes.Add($"http://+:{Port}/");
            try
            {
                _listener.Start();
            }
            catch (HttpListenerException)
            {
                // Fallback for platforms that refuse wildcard prefixes without elevation: loopback only (still lets the
                // operator test locally) and report it so the UI can warn.
                _listener.Close();
                _listener = new HttpListener();
                _listener.Prefixes.Add($"http://localhost:{Port}/");
                _listener.Start();
                Log?.Invoke($"Wildcard bind refused; serving on localhost:{Port} only.");
            }

            _thread = new Thread(Loop) { IsBackground = true, Name = "LocalContentServer" };
            _thread.Start();
            Log?.Invoke($"Serving '{RootDirectory}' on port {Port}.");
        }

        public void Stop()
        {
            try { _listener?.Stop(); } catch (Exception) { /* already stopped */ }
            try { _listener?.Close(); } catch (Exception) { /* already closed */ }
            _listener = null;
        }

        public void Dispose() => Stop();

        private void Loop()
        {
            HttpListener listener = _listener;
            while (listener != null && listener.IsListening)
            {
                HttpListenerContext ctx;
                try
                {
                    ctx = listener.GetContext();
                }
                catch (Exception)
                {
                    return; // listener stopped
                }

                ThreadPool.QueueUserWorkItem(_ => Handle(ctx));
            }
        }

        private void Handle(HttpListenerContext ctx)
        {
            try
            {
                HttpListenerRequest req = ctx.Request;
                HttpListenerResponse res = ctx.Response;

                if (req.HttpMethod != "GET" && req.HttpMethod != "HEAD")
                {
                    Respond(res, 405);
                    return;
                }

                string relative = Uri.UnescapeDataString(req.Url.AbsolutePath).TrimStart('/');
                if (relative.Length == 0) relative = "index.json";

                string full = Path.GetFullPath(Path.Combine(RootDirectory, relative));
                if (!full.StartsWith(_rootFull, StringComparison.Ordinal))
                {
                    Respond(res, 403); // path traversal
                    return;
                }

                if (!File.Exists(full))
                {
                    Respond(res, 404);
                    return;
                }

                using (FileStream fs = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    res.StatusCode = 200;
                    res.ContentType = MimeFor(full);
                    res.ContentLength64 = fs.Length;
                    res.AddHeader("Cache-Control", "no-cache");

                    if (req.HttpMethod == "GET")
                    {
                        fs.CopyTo(res.OutputStream);
                    }
                }

                res.OutputStream.Close();
                Interlocked.Increment(ref _requestsServed);
            }
            catch (Exception ex)
            {
                // Client aborted mid-download (headset slept / changed scene) - not an error worth surfacing loudly.
                Log?.Invoke($"Request failed: {ex.Message}");
                try { ctx.Response.Abort(); } catch (Exception) { /* ignore */ }
            }
        }

        private static void Respond(HttpListenerResponse res, int status)
        {
            res.StatusCode = status;
            res.ContentLength64 = 0;
            res.OutputStream.Close();
        }

        private static string MimeFor(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".json": return "application/json";
                case ".hash": return "text/plain";
                case ".txt": return "text/plain";
                default: return "application/octet-stream"; // .bundle and everything else
            }
        }
    }
}
