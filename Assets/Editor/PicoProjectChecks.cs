using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using System.Xml;

namespace LegacyVR.KartRacing.EditorTools.Checks
{
    public enum Severity { Warning, Error }

    public struct Issue
    {
        public Severity Severity;
        public string Message;
        public override string ToString() => $"[{Severity}] {Message}";
    }

    /// <summary>
    /// File-based pre-flight checks for the Pico G1/G2 client build. Pure .NET (no Unity API) so the same checks run
    /// in the editor, in batch mode before an APK build, and in plain mono/dotnet for testing.
    /// Encodes the architecture blueprint's hard rules (no OpenXR / picoxr / Netcode, SDK 2.8.12, manifest contents...).
    /// </summary>
    public static class PicoProjectChecks
    {
        public const string PackageName = "com.legacyvr.kartclient";

        public static List<Issue> Run(string projectRoot)
        {
            var issues = new List<Issue>();
            Func<string, string> P = rel => Path.Combine(projectRoot, rel.Replace('/', Path.DirectorySeparatorChar));

            CheckSdk(P, issues);
            CheckNativeLibs(P, issues);
            CheckManifest(P("Assets/Plugins/Android/AndroidManifest.xml"), issues);
            CheckPlayerSettings(P("ProjectSettings/ProjectSettings.asset"), issues);
            CheckPhysics(P, issues);
            CheckTags(P("ProjectSettings/TagManager.asset"), issues);
            CheckForbiddenStack(projectRoot, P, issues);
            CheckKartPrefab(P("Assets/Prefabs/Kart/KinematicKart.prefab"), issues);
            CheckNetworkManagerPrefab(P("Assets/Prefabs/Network/MasterKartNetworkManager.prefab"), issues);

            foreach (string scene in new[] { "Assets/Scenes/BootScene.unity", "Assets/Scenes/HubScene.unity" })
            {
                if (!File.Exists(P(scene)))
                    Warn(issues, $"{scene} missing - run Tools > MowgliKart > Build Scenes (the build does this automatically).");
            }

            return issues;
        }

        public static bool HasErrors(IEnumerable<Issue> issues)
        {
            foreach (Issue i in issues) if (i.Severity == Severity.Error) return true;
            return false;
        }

        // ------------------------------------------------------------------ individual checks
        private static void CheckSdk(Func<string, string> P, List<Issue> issues)
        {
            string api = P("Assets/PicoMobileSDK/Pvr_UnitySDK/API/Pvr_UnitySDKAPI.cs");
            if (!File.Exists(api))
            {
                Err(issues, "Pico SDK missing: Assets/PicoMobileSDK/Pvr_UnitySDK (Pvr_UnitySDK 2.8.12 required).");
                return;
            }

            Match m = Regex.Match(File.ReadAllText(api), "SDKVersion\\s*=\\s*\"(\\d+\\.\\d+\\.\\d+)");
            if (!m.Success) Warn(issues, "Could not read Pvr_UnitySDK version.");
            else if (!m.Groups[1].Value.StartsWith("2.8.12", StringComparison.Ordinal))
                Err(issues, $"Pvr_UnitySDK is {m.Groups[1].Value}; the blueprint requires 2.8.12.");

            if (!File.Exists(P("Assets/PicoMobileSDK/Pvr_ToBService/API/Pvr_ToBServiceAPI.cs")))
                Err(issues, "Pvr_ToBService missing from the Pico SDK (kiosk mode needs it).");
        }

        private static void CheckNativeLibs(Func<string, string> P, List<Issue> issues)
        {
            foreach (string lib in new[] { "Assets/Plugins/Android/libs/pvrSDK-release.aar", "Assets/Plugins/Android/tobserviceclient.jar" })
            {
                if (!File.Exists(P(lib))) Err(issues, $"Native Pico library missing: {lib}");
            }
        }

        private static void CheckManifest(string path, List<Issue> issues)
        {
            if (!File.Exists(path)) { Err(issues, "Assets/Plugins/Android/AndroidManifest.xml missing."); return; }

            var doc = new XmlDocument();
            try { doc.Load(path); }
            catch (XmlException ex) { Err(issues, $"AndroidManifest.xml is not valid XML: {ex.Message}"); return; }

            var ns = new XmlNamespaceManager(doc.NameTable);
            ns.AddNamespace("android", "http://schemas.android.com/apk/res/android");
            const string A = "android:";

            XmlElement root = doc.DocumentElement;
            if (root.GetAttribute("package") != PackageName)
                Err(issues, $"Manifest package is '{root.GetAttribute("package")}', expected '{PackageName}'.");

            XmlNode sdk = doc.SelectSingleNode("/manifest/uses-sdk", ns);
            if (sdk == null) Err(issues, "Manifest has no <uses-sdk>.");
            else
            {
                if (Attr(sdk, "minSdkVersion") != "24") Err(issues, "minSdkVersion must be 24.");
                if (Attr(sdk, "targetSdkVersion") != "27") Err(issues, "targetSdkVersion must be 27 (Android 8.1).");
            }

            XmlNode app = doc.SelectSingleNode("/manifest/application", ns);
            if (app == null) { Err(issues, "Manifest has no <application>."); return; }
            if (Attr(app, "usesCleartextTraffic") != "true")
                Err(issues, "android:usesCleartextTraffic=\"true\" is required for local HTTP Addressables.");

            RequireMeta(doc, ns, issues, "pvr.app.type", "vr");
            RequireMeta(doc, ns, issues, "pvr.display.orientation", "180");
            RequireMeta(doc, ns, issues, "pico_advance_interface", "0");

            XmlNode activity = doc.SelectSingleNode("//activity[@android:name='com.unity3d.player.UnityPlayerNativeActivityPico']", ns);
            if (activity == null) Err(issues, "UnityPlayerNativeActivityPico activity missing.");
            else
            {
                foreach (string cat in new[] { "android.intent.category.LAUNCHER", "android.intent.category.HOME", "android.intent.category.DEFAULT" })
                {
                    if (activity.SelectSingleNode($".//category[@android:name='{cat}']", ns) == null)
                        Err(issues, $"Launcher activity lacks category {cat}.");
                }

                if (activity.SelectSingleNode(".//action[@android:name='android.intent.action.BOOT_COMPLETED']", ns) == null)
                    Warn(issues, "No BOOT_COMPLETED intent filter on the launcher activity.");
            }

            foreach (string perm in new[]
            {
                "android.permission.INTERNET", "android.permission.RECEIVE_BOOT_COMPLETED",
                "android.permission.CHANGE_WIFI_MULTICAST_STATE", "android.permission.ACCESS_WIFI_STATE", "android.permission.WAKE_LOCK"
            })
            {
                if (doc.SelectSingleNode($"/manifest/uses-permission[@android:name='{perm}']", ns) == null)
                    Err(issues, $"Missing permission {perm}.");
            }

            if (doc.SelectSingleNode("//service[@android:name='com.picovr.picovrlib.hummingbird.HummingBirdControllerService']", ns) == null)
                Err(issues, "Hummingbird controller service missing - the 3DoF controller would not connect.");
        }

        private static void CheckPlayerSettings(string path, List<Issue> issues)
        {
            if (!File.Exists(path)) { Err(issues, "ProjectSettings/ProjectSettings.asset missing."); return; }
            string t = File.ReadAllText(path);

            if (!Regex.IsMatch(t, "applicationIdentifier:\\s*\\n\\s*Android:\\s*" + Regex.Escape(PackageName)))
                Err(issues, $"Player Settings Android identifier must be {PackageName} (must match the manifest package).");
            if (!Regex.IsMatch(t, "AndroidMinSdkVersion:\\s*24\\b")) Err(issues, "Player Settings: Android min API must be 24.");
            if (!Regex.IsMatch(t, "AndroidTargetSdkVersion:\\s*27\\b")) Err(issues, "Player Settings: Android target API must be 27.");
            if (!Regex.IsMatch(t, "defaultScreenOrientation:\\s*3\\b")) Err(issues, "Player Settings: Default Orientation must be Landscape Left.");
            if (Regex.IsMatch(t, "virtualRealitySupported:\\s*1\\b")) Err(issues, "Unity's built-in VR support must stay OFF (Pvr_UnitySDK has its own stereo rendering).");
            if (!Regex.IsMatch(t, "m_BuildTarget:\\s*AndroidPlayer\\s*\\n\\s*m_APIs:\\s*0b000000"))
                Warn(issues, "Graphics API for Android is not OpenGLES3-only (the build applies it, but ProjectSettings.asset disagrees).");
        }

        private static void CheckPhysics(Func<string, string> P, List<Issue> issues)
        {
            string time = P("ProjectSettings/TimeManager.asset");
            if (!File.Exists(time) || !Regex.IsMatch(File.ReadAllText(time), "Fixed Timestep:\\s*0\\.05\\b"))
                Err(issues, "TimeManager Fixed Timestep must be 0.05 (20 Hz).");

            string dyn = P("ProjectSettings/DynamicsManager.asset");
            if (!File.Exists(dyn) || !Regex.IsMatch(File.ReadAllText(dyn), "m_AutoSimulation:\\s*0\\b"))
                Err(issues, "DynamicsManager Auto Simulation must be disabled.");
        }

        private static void CheckTags(string path, List<Issue> issues)
        {
            string t = File.Exists(path) ? File.ReadAllText(path) : string.Empty;
            foreach (string tag in new[] { "PlayerKart", "BoostPad", "LeaderControlUI" })
            {
                if (!Regex.IsMatch(t, "^\\s*-\\s*" + tag + "\\s*$", RegexOptions.Multiline))
                    Err(issues, $"Tag '{tag}' missing from TagManager (scripts call CompareTag with it).");
            }
        }

        /// <summary>The blueprint forbids OpenXR, com.unity.xr.picoxr and Netcode for GameObjects.</summary>
        private static void CheckForbiddenStack(string root, Func<string, string> P, List<Issue> issues)
        {
            string manifest = P("Packages/manifest.json");
            if (!File.Exists(manifest)) { Err(issues, "Packages/manifest.json missing."); return; }

            string m = File.ReadAllText(manifest);
            if (!m.Contains("\"com.unity.addressables\"")) Err(issues, "com.unity.addressables missing from Packages/manifest.json.");
            // Built-in modules the bundled Mirror / Pico SDK code compiles against (e.g. Mirror uses Terrain + Physics2D,
            // the Pico SDK uses UnityEngine.XR + UI Elements). A missing one is a compile error on first import.
            foreach (string module in new[] { "terrain", "terrainphysics", "physics2d", "physics", "xr", "uielements", "ui", "animation", "unitywebrequest", "assetbundle", "androidjni" })
            {
                if (!m.Contains("\"com.unity.modules." + module + "\""))
                    Err(issues, $"Built-in module com.unity.modules.{module} missing from Packages/manifest.json (compile error on import).");
            }

            foreach (string bad in new[] { "com.unity.xr.openxr", "com.unity.xr.picoxr", "com.unity.netcode.gameobjects" })
            {
                if (m.Contains(bad)) Err(issues, $"Forbidden package in manifest: {bad}.");
            }

            string scripts = P("Assets/Scripts");
            if (!Directory.Exists(scripts)) return;

            foreach (string file in Directory.GetFiles(scripts, "*.cs", SearchOption.AllDirectories))
            {
                string text = File.ReadAllText(file);
                if (Regex.IsMatch(text, "using\\s+Unity\\.Netcode|using\\s+UnityEngine\\.XR\\.OpenXR|using\\s+Unity\\.XR\\.PXR"))
                    Err(issues, $"Forbidden API in {Path.GetFileName(file)} (Netcode/OpenXR/PicoXR).");
            }
        }

        private static void CheckKartPrefab(string path, List<Issue> issues)
        {
            if (!File.Exists(path)) { Err(issues, "KinematicKart.prefab missing."); return; }
            string t = File.ReadAllText(path);

            if (!Regex.IsMatch(t, "m_IsKinematic:\\s*1\\b")) Err(issues, "Kart Rigidbody must be kinematic.");
            if (!Regex.IsMatch(t, "m_UseGravity:\\s*0\\b")) Err(issues, "Kart Rigidbody must not use gravity.");
            if (!Regex.IsMatch(t, "m_IsTrigger:\\s*1\\b")) Err(issues, "Kart BoxCollider must be a trigger.");
            if (!Regex.IsMatch(t, "syncDirection:\\s*1\\b")) Err(issues, "Kart NetworkTransform must sync ClientToServer.");
            if (!Regex.IsMatch(t, "compressRotation:\\s*1\\b")) Err(issues, "Kart NetworkTransform must compress rotation.");
            if (!Regex.IsMatch(t, "syncScale:\\s*0\\b")) Err(issues, "Kart NetworkTransform must not sync scale.");
            if (!Regex.IsMatch(t, "rotationSensitivity:\\s*0\\.5\\b")) Err(issues, "Kart rotationSensitivity must be 0.5.");
        }

        private static void CheckNetworkManagerPrefab(string path, List<Issue> issues)
        {
            if (!File.Exists(path)) { Err(issues, "MasterKartNetworkManager.prefab missing."); return; }
            string t = File.ReadAllText(path);

            if (!Regex.IsMatch(t, "sendRate:\\s*20\\b")) Err(issues, "NetworkManager sendRate must be 20.");
            if (!Regex.IsMatch(t, "maxConnections:\\s*8\\b")) Err(issues, "NetworkManager maxConnections must be 8.");
            if (!Regex.IsMatch(t, "bufferTimeMultiplier:\\s*2\\.2\\b")) Err(issues, "bufferTimeMultiplier must be 2.2.");
            if (!Regex.IsMatch(t, "NoDelay:\\s*1\\b")) Err(issues, "KCP NoDelay must be on.");
            if (!Regex.IsMatch(t, "Interval:\\s*10\\b")) Err(issues, "KCP Interval must be 10 ms.");
            if (!Regex.IsMatch(t, "FastResend:\\s*2\\b")) Err(issues, "KCP FastResend must be 2.");
        }

        // ------------------------------------------------------------------ helpers
        private static string Attr(XmlNode node, string name) =>
            node.Attributes?["android:" + name]?.Value ?? node.Attributes?[name]?.Value;

        private static void RequireMeta(XmlDocument doc, XmlNamespaceManager ns, List<Issue> issues, string name, string value)
        {
            XmlNode meta = doc.SelectSingleNode($"//meta-data[@android:name='{name}']", ns);
            if (meta == null) Err(issues, $"Manifest meta-data '{name}' missing.");
            else if (Attr(meta, "value") != value) Err(issues, $"Manifest meta-data '{name}' must be '{value}'.");
        }

        private static void Err(List<Issue> l, string m) => l.Add(new Issue { Severity = Severity.Error, Message = m });
        private static void Warn(List<Issue> l, string m) => l.Add(new Issue { Severity = Severity.Warning, Message = m });
    }
}
