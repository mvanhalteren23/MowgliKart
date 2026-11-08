#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using LegacyVR.KartClient.SystemService;
using LegacyVR.KartRacing.CameraSystem;
using LegacyVR.KartRacing.Networking;

namespace LegacyVR.KartRacing.EditorTools
{
    /// <summary>
    /// Tools > MowgliKart > Build Scenes: generates HubScene (Android thin client), MasterScene (Windows operator)
    /// and an Addressable Track01 scene, so no scene has to be hand-authored. Safe to re-run (overwrites the three scenes).
    /// </summary>
    public static class MowgliKartSceneBuilder
    {
        private const string HubPath = "Assets/Scenes/HubScene.unity";
        private const string MasterPath = "Assets/Scenes/MasterScene.unity";
        private const string TrackPath = "Assets/Scenes/Tracks/Track01.unity";

        private const string PvrSdkPrefab = "Assets/PicoMobileSDK/Pvr_UnitySDK/Prefabs/Pvr_UnitySDK.prefab";
        private const string ControllerManagerPrefab = "Assets/PicoMobileSDK/Pvr_Controller/Prefabs/ControllerManager.prefab";
        private const string NetworkManagerPrefab = "Assets/Prefabs/Network/MasterKartNetworkManager.prefab";

        private const int TrackGroundLayer = 8;

        [MenuItem("Tools/MowgliKart/Build Scenes")]
        public static void BuildAll()
        {
            Directory.CreateDirectory("Assets/Scenes/Tracks");
            BuildTrack();
            BuildMaster();
            BuildHub();

            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(HubPath, true),     // index 0: the APK boots into the hub
                new EditorBuildSettingsScene(MasterPath, true),  // index 1: Windows master server
            };

            AssetDatabase.SaveAssets();
            Debug.Log("[MowgliKart] Scenes built. Track01 is Addressable; HubScene=0, MasterScene=1 in Build Settings.");
        }

        // ------------------------------------------------------------------ Hub (Pico thin client)
        private static void BuildHub()
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            GameObject pvr = InstantiatePrefab(PvrSdkPrefab);
            pvr.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);

            // Controller prefab (contains PvrController0/1) - same hierarchy level handling as the Pico docs.
            GameObject controllers = InstantiatePrefab(ControllerManagerPrefab);

            // The decoupled rig: lives on the Pvr_UnitySDK root, never parented to a kart.
            Pico3DoFKartCameraRig rig = pvr.GetComponent<Pico3DoFKartCameraRig>();
            if (rig == null) rig = pvr.AddComponent<Pico3DoFKartCameraRig>();

            Transform head = FindDeep(pvr.transform, "Head");
            var so = new SerializedObject(rig);
            so.FindProperty("pvrSdkRootTransform").objectReferenceValue = pvr.transform;
            so.FindProperty("pvrHeadTransform").objectReferenceValue = head;
            so.ApplyModifiedPropertiesWithoutUndo();
            if (head == null) Debug.LogWarning("[MowgliKart] Could not find a 'Head' child in Pvr_UnitySDK; assign pvrHeadTransform manually.");

            // Name matters: passed to ToBService.UPvr_SetUnityObjectName(gameObject.name).
            var kiosk = new GameObject("PicoKioskController");
            kiosk.AddComponent<PicoKioskController>();

            InstantiatePrefab(NetworkManagerPrefab);

            // Keep the editor happy about unused locals while still documenting intent.
            Debug.Assert(controllers != null);

            EditorSceneManager.SaveScene(scene, HubPath);
        }

        // ------------------------------------------------------------------ Master (Windows operator)
        private static void BuildMaster()
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var cam = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            cam.tag = "MainCamera";
            cam.GetComponent<Camera>().clearFlags = CameraClearFlags.SolidColor;
            cam.GetComponent<Camera>().backgroundColor = new Color(0.08f, 0.09f, 0.11f);

            InstantiatePrefab(NetworkManagerPrefab);

            var panel = new GameObject("MasterOperatorPanel");
            panel.AddComponent<MasterOperatorPanel>();

            EditorSceneManager.SaveScene(scene, MasterPath);
        }

        // ------------------------------------------------------------------ Track01 (Addressable)
        private static void BuildTrack()
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var light = new GameObject("Directional Light", typeof(Light));
            light.GetComponent<Light>().type = LightType.Directional;
            light.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            // Flat ground the kinematic karts follow with a single downward ray.
            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = "TrackGround";
            ground.layer = TrackGroundLayer;
            ground.transform.position = new Vector3(0f, -0.5f, 100f);
            ground.transform.localScale = new Vector3(120f, 1f, 260f);

            // Boost pads: trigger-only colliders tagged BoostPad.
            for (int i = 0; i < 3; i++)
            {
                var pad = GameObject.CreatePrimitive(PrimitiveType.Cube);
                pad.name = $"BoostPad_{i}";
                pad.tag = "BoostPad";
                pad.transform.position = new Vector3((i - 1) * 6f, 0.05f, 40f + i * 30f);
                pad.transform.localScale = new Vector3(3f, 0.1f, 6f);
                pad.GetComponent<Collider>().isTrigger = true;
            }

            // 13 grid slots, 2 columns, facing +Z. Spawn positions come from MasterKartNetworkManager.DefaultSlotSpacing
            // unless sceneSpawnPoints is wired, so these are reference markers for the track designer.
            var grid = new GameObject("StartGrid");
            for (int i = 0; i < MasterKartNetworkManager.MaxHeadsets; i++)
            {
                var slot = new GameObject($"GridSlot_{i}");
                slot.transform.SetParent(grid.transform);
                slot.transform.position = new Vector3((i % 2 == 0 ? -2f : 2f), 0f, -(i / 2) * 5f);
            }

            BuildLeaderCanvas();

            EditorSceneManager.SaveScene(scene, TrackPath);
            MarkAddressable(TrackPath, TrackPath);
        }

        private static void BuildLeaderCanvas()
        {
            // World-space canvas in front of the player. Tagged LeaderControlUI and shipped disabled:
            // KartClientDispatcher enables it for the Player 1 headset only.
            var canvasGo = new GameObject("LeaderControlUI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.tag = "LeaderControlUI";
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var rect = canvasGo.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(800f, 300f);
            rect.position = new Vector3(0f, 2f, 3f);
            rect.localScale = Vector3.one * 0.003f;

            var buttons = canvasGo.AddComponent<LeaderCommandButtons>();
            CreateButton(canvasGo.transform, "Start Countdown", new Vector2(-260f, 0f), buttons.SendStartCountdown);
            CreateButton(canvasGo.transform, "Pause", new Vector2(0f, 0f), buttons.SendPause);
            CreateButton(canvasGo.transform, "Return To Hub", new Vector2(260f, 0f), buttons.SendReturnToHub);

            canvasGo.SetActive(false);

            // Gaze/controller input module for the Pico SDK is supplied by the hub's Pvr_UnitySDK; an EventSystem
            // is still required in the scene for uGUI.
            if (Object.FindObjectOfType<EventSystem>() == null)
            {
                new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            }
        }

        private static void CreateButton(Transform parent, string label, Vector2 anchoredPos, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject(label, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(240f, 100f);
            rt.anchoredPosition = anchoredPos;

            var text = new GameObject("Label", typeof(RectTransform), typeof(Text));
            text.transform.SetParent(go.transform, false);
            var trt = text.GetComponent<RectTransform>();
            trt.anchorMin = Vector2.zero;
            trt.anchorMax = Vector2.one;
            trt.offsetMin = trt.offsetMax = Vector2.zero;
            var t = text.GetComponent<Text>();
            t.text = label;
            t.alignment = TextAnchor.MiddleCenter;
            t.color = Color.black;
            t.fontSize = 30;
            t.font = Resources.GetBuiltinResource<Font>("Arial.ttf");

            UnityEventTools.AddPersistentListener(go.GetComponent<Button>().onClick, onClick);
        }

        private static void MarkAddressable(string assetPath, string address)
        {
            var settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
            string guid = AssetDatabase.AssetPathToGUID(assetPath);
            var entry = settings.CreateOrMoveEntry(guid, settings.DefaultGroup);
            entry.address = address;
            EditorUtility.SetDirty(settings);
        }

        // ------------------------------------------------------------------ helpers
        private static GameObject InstantiatePrefab(string path)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab == null)
            {
                throw new FileNotFoundException($"Prefab not found: {path}");
            }

            return (GameObject)PrefabUtility.InstantiatePrefab(prefab);
        }

        private static Transform FindDeep(Transform root, string name)
        {
            if (root.name == name) return root;
            for (int i = 0; i < root.childCount; i++)
            {
                Transform found = FindDeep(root.GetChild(i), name);
                if (found != null) return found;
            }
            return null;
        }
    }
}
#endif
