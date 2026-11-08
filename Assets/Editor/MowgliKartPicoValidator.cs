#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditorInternal;
using UnityEngine;
using LegacyVR.KartRacing.EditorTools.Checks;

namespace LegacyVR.KartRacing.EditorTools
{
    /// <summary>
    /// Runs the file-based PicoProjectChecks plus checks that need the live editor (Player Settings, tag registry,
    /// Addressables entry). Called automatically before every Pico APK build; errors abort the build.
    /// </summary>
    public static class MowgliKartPicoValidator
    {
        [MenuItem("Tools/MowgliKart/Validate Pico Setup")]
        public static void ValidateMenu()
        {
            List<Issue> issues = Validate();
            Debug.Log(issues.Count == 0
                ? "[MowgliKart] Pico setup OK."
                : $"[MowgliKart] Pico setup: {issues.Count} issue(s), see above.");
        }

        /// <returns>true when the build may proceed (no errors).</returns>
        public static bool ValidateForBuild() => !PicoProjectChecks.HasErrors(Validate());

        public static List<Issue> Validate()
        {
            string root = Directory.GetParent(Application.dataPath).FullName;
            List<Issue> issues = PicoProjectChecks.Run(root);

            // Live-editor checks (the file checks above only see what is saved on disk).
            string id = PlayerSettings.GetApplicationIdentifier(BuildTargetGroup.Android);
            if (id != PicoProjectChecks.PackageName)
            {
                issues.Add(new Issue { Severity = Severity.Error, Message = $"Player Settings Android identifier is '{id}', expected '{PicoProjectChecks.PackageName}'." });
            }

            if (PlayerSettings.virtualRealitySupported)
            {
                issues.Add(new Issue { Severity = Severity.Error, Message = "Unity's built-in VR support is enabled; turn it off (Pvr_UnitySDK renders stereo itself)." });
            }

            var registeredTags = new HashSet<string>(InternalEditorUtility.tags);
            foreach (string tag in new[] { "PlayerKart", "BoostPad", "LeaderControlUI" })
            {
                if (!registeredTags.Contains(tag))
                {
                    issues.Add(new Issue { Severity = Severity.Error, Message = $"Tag '{tag}' is not registered in this editor session." });
                }
            }

            foreach (Issue issue in issues)
            {
                if (issue.Severity == Severity.Error) Debug.LogError("[MowgliKart] " + issue.Message);
                else Debug.LogWarning("[MowgliKart] " + issue.Message);
            }

            return issues;
        }
    }
}
#endif
