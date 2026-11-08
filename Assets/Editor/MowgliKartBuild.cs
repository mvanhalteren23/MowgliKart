#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.Callbacks;
using UnityEngine;

namespace LegacyVR.KartRacing.EditorTools
{
    /// <summary>
    /// One-click and batch-mode builds.
    ///   Menu:  Tools > MowgliKart > Build > ...
    ///   CLI:   Unity -batchmode -quit -projectPath . -executeMethod LegacyVR.KartRacing.EditorTools.MowgliKartBuild.BuildMacMasterCli
    /// (see scripts/mac/build_master.sh and scripts/mac/build_apk.sh)
    /// </summary>
    public static class MowgliKartBuild
    {
        public const string MacOutput = "Builds/macOS/MowgliKartMaster.app";
        public const string WindowsOutput = "Builds/Windows/MowgliKartMaster.exe";
        public const string ApkOutput = "Builds/Android/MowgliKartClient.apk";

        // ------------------------------------------------------------------ menu
        [MenuItem("Tools/MowgliKart/Build/macOS Master (.app)")]
        public static void BuildMacMaster() => Run(BuildMac());

        [MenuItem("Tools/MowgliKart/Build/Windows Master (.exe)")]
        public static void BuildWindowsMaster() => Run(BuildWindows());

        [MenuItem("Tools/MowgliKart/Build/Pico Client (.apk)")]
        public static void BuildPicoClient() => Run(BuildAndroid());

        // ------------------------------------------------------------------ batch mode entry points
        public static void BuildMacMasterCli() => Exit(BuildMac());
        public static void BuildWindowsMasterCli() => Exit(BuildWindows());
        public static void BuildPicoClientCli() => Exit(BuildAndroid());

        // ------------------------------------------------------------------ targets
        private static BuildReport BuildMac()
        {
            EnsureScenes();

            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone, ScriptingImplementation.Mono2x);
            PlayerSettings.SetApiCompatibilityLevel(BuildTargetGroup.Standalone, ApiCompatibilityLevel.NET_4_6);
            PlayerSettings.runInBackground = true;
            PlayerSettings.macOS.buildNumber = "1";

            return Build(BuildTarget.StandaloneOSX, ResolveOutput(MacOutput, "MowgliKartMaster.app"), MowgliKartSceneBuilder.MasterPath);
        }

        private static BuildReport BuildWindows()
        {
            EnsureScenes();

            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone, ScriptingImplementation.Mono2x);
            PlayerSettings.runInBackground = true;

            return Build(BuildTarget.StandaloneWindows64, WindowsOutput, MowgliKartSceneBuilder.MasterPath);
        }

        private static BuildReport BuildAndroid()
        {
            EnsureScenes();
            ApplyPicoAndroidSettings();

            // Fail fast, with a readable list, instead of producing an APK that silently misbehaves on the headset.
            if (!MowgliKartPicoValidator.ValidateForBuild())
            {
                throw new BuildFailedException("Pico setup validation failed; see the [MowgliKart] errors above.");
            }

            BuildAddressablesContent();

            return Build(BuildTarget.Android, ResolveOutput(ApkOutput, "MowgliKartClient.apk"), MowgliKartSceneBuilder.BootPath, MowgliKartSceneBuilder.HubPath);
        }

        /// <summary>CI runners (game-ci) pass -customBuildPath; honour it, otherwise use the default under Builds/.</summary>
        private static string ResolveOutput(string defaultPath, string fileName)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] != "-customBuildPath")
                    continue;

                string custom = args[i + 1];
                return custom.EndsWith(Path.GetExtension(fileName), StringComparison.OrdinalIgnoreCase)
                    ? custom
                    : Path.Combine(custom, fileName);
            }

            return defaultPath;
        }

        /// <summary>The Pico G1/G2 settings from the architecture blueprint, applied through the public API so the
        /// build never depends on hand-written ProjectSettings values.</summary>
        private static void ApplyPicoAndroidSettings()
        {
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARMv7;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevel27;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;

            // OpenGLES3 only (no Vulkan).
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { UnityEngine.Rendering.GraphicsDeviceType.OpenGLES3 });

            // Pvr_UnitySDK renders its own stereo pipeline; Unity's XR must stay off.
            PlayerSettings.virtualRealitySupported = false;
#pragma warning disable CS0618 // stereoRenderingPath is obsolete in newer editors but is the spec'd setting here
            PlayerSettings.stereoRenderingPath = StereoRenderingPath.MultiPass;
#pragma warning restore CS0618

            // Blit Type = Never. Set through the enum NAME (not a hand-written number) via reflection, so a different
            // Unity version cannot silently map the wrong value and this still compiles if the property moves.
            var blitProperty = typeof(PlayerSettings.Android).GetProperty("blitType");
            if (blitProperty != null)
            {
                blitProperty.SetValue(null, Enum.Parse(blitProperty.PropertyType, "Never"), null);
            }
            else
            {
                Debug.LogWarning("[MowgliKart] PlayerSettings.Android.blitType not found; set Blit Type = Never in Player Settings.");
            }
        }

        // ------------------------------------------------------------------ plumbing
        private static void EnsureScenes()
        {
            if (!File.Exists(MowgliKartSceneBuilder.BootPath) ||
                !File.Exists(MowgliKartSceneBuilder.HubPath) ||
                !File.Exists(MowgliKartSceneBuilder.MasterPath))
            {
                MowgliKartSceneBuilder.BuildAll();
            }
        }

        private static void BuildAddressablesContent()
        {
            AddressableAssetSettingsDefaultObject.GetSettings(true);
            AddressableAssetSettings.BuildPlayerContent();
        }

        private static BuildReport Build(BuildTarget target, string output, params string[] scenes)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(output));

            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = output,
                target = target,
                options = BuildOptions.None
            };

            return BuildPipeline.BuildPlayer(options);
        }

        private static void Run(BuildReport report)
        {
            BuildSummary s = report.summary;
            if (s.result == BuildResult.Succeeded)
            {
                Debug.Log($"[MowgliKart] Build OK: {s.outputPath} ({s.totalSize / (1024 * 1024)} MB, {s.totalTime.TotalSeconds:F0}s)");
                EditorUtility.RevealInFinder(s.outputPath);
            }
            else
            {
                Debug.LogError($"[MowgliKart] Build {s.result}: {s.totalErrors} error(s). See the Console.");
            }
        }

        private static void Exit(BuildReport report)
        {
            Run(report);
            EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }

        // ------------------------------------------------------------------ macOS Info.plist
        /// <summary>
        /// macOS 15+ shows a Local Network permission prompt for apps that talk to LAN devices. Without a usage
        /// string the OS can silently block the UDP discovery broadcast to the headsets.
        /// </summary>
        [PostProcessBuild(1000)]
        public static void AddLocalNetworkUsageDescription(BuildTarget target, string pathToBuiltProject)
        {
            if (target != BuildTarget.StandaloneOSX)
                return;

            string plist = Path.Combine(pathToBuiltProject, "Contents", "Info.plist");
            if (!File.Exists(plist))
                return;

            string text = File.ReadAllText(plist);
            if (text.Contains("NSLocalNetworkUsageDescription"))
                return;

            const string entry =
                "\t<key>NSLocalNetworkUsageDescription</key>\n" +
                "\t<string>MowgliKart finds and controls the Pico headsets on your local network.</string>\n";

            int close = text.LastIndexOf("</dict>", StringComparison.Ordinal);
            if (close < 0)
                return;

            File.WriteAllText(plist, text.Insert(close, entry));
        }
    }
}
#endif
