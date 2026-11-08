# Unity Editor wiring

## Fast path: let Unity build the scenes
After the project opens and compiles: **Tools > MowgliKart > Build Scenes**. This generates
`Assets/Scenes/HubScene.unity` (Pvr rig + controllers + camera rig with references assigned + PicoKioskController +
NetworkManager prefab), `Assets/Scenes/MasterScene.unity` (NetworkManager + `MasterOperatorPanel`), and
`Assets/Scenes/Tracks/Track01.unity` (ground, 3 BoostPads, 13 grid markers, disabled `LeaderControlUI` canvas with
Start/Pause/Return buttons) already marked Addressable under key `Assets/Scenes/Tracks/Track01.unity`. It also sets Build
Settings (Hub = 0, Master = 1). The manual list below is what that command automates, kept for reference/verification.

## Windows operator (MasterScene)
Press Play (or build a Windows Standalone with MasterScene): **Start Server**, wait for headsets to appear, tick the group,
tick **P1** on the leader, pick the game, **LAUNCH**. Session ID auto-increments.

---


Open the project in **Unity 2020.3 LTS** (ProjectVersion pinned to 2020.3.48f1; 2019.4 also fine for the scripts,
but Mirror v96 and Addressables 1.19.19 are happiest on 2020.3+).

## Scenes (none exist yet; EditorBuildSettings is empty)
**HubScene** (static, in the APK, build index 0) must contain, as unparented root objects:
1. `Pvr_UnitySDK` prefab (`Assets/PicoMobileSDK/Pvr_UnitySDK/Prefabs`): Head Pose + Hand Pose = **Three Dof**; Unity XR/VR Supported OFF.
2. `Pico3DoFKartCameraRig` on the `Pvr_UnitySDK` root: assign `pvrSdkRootTransform` (the root) and `pvrHeadTransform` (its `Head` child). Do NOT parent it to any kart.
3. `PvrController0` (child of Pvr_UnitySDK) + `ControllerManager` prefab from `Assets/PicoMobileSDK/Pvr_Controller`.
4. Empty GameObject named exactly **`PicoKioskController`** with `PicoKioskController` (name matters: it is passed to `UPvr_SetUnityObjectName`).
5. `Assets/Prefabs/Network/MasterKartNetworkManager.prefab` (already wired to the dispatcher + kart prefabs, KcpTransport, 20 Hz, 13 conns).
   Set `networkAddress` to the Windows laptop's LAN IP on the Android build.
**Windows master scene**: same NetworkManager prefab + your operator UI calling `DispatchGameModuleSession(...)`. No Pvr rig needed.

## Track scene(s) (Addressable)
- Mark each track scene Addressable with the key used in `registeredGameModules` (default `Assets/Scenes/Tracks/Track01.unity`).
- Tag the leader UI canvas **`LeaderControlUI`** (Canvas component, may start disabled).
- Tag boost pads **`BoostPad`** (trigger colliders). Put ground on layer `TrackGround` (layer 8) and set `trackGroundLayer` on the kart prefab if you want to restrict the ray.
- Optional: assign `sceneSpawnPoints` on the NetworkManager.

## Addressables
- Window > Asset Management > Addressables > Groups > Create settings. Enable *Build Remote Catalog* and point Remote Build/Load paths at the laptop's HTTP server (`http://<laptop-ip>:8080/[BuildTarget]`).
- Player Settings is already `usesCleartextTraffic` via the manifest.

## Verify in the Editor (hand-written YAML, not saved by Unity)
- Player Settings > Android > Other: Blit Type shows **Never** (the key was written as `androidBlitType: 2` per the spec; fix it in the UI if it shows Auto), Graphics APIs = OpenGLES3 only, Stereo Rendering = Multi Pass, Min/Target API 24/27, Scripting backend IL2CPP/ARMv7, Publishing Settings > *Custom Main Manifest* checked.
- Project Settings > Time: Fixed Timestep 0.05. Physics: Auto Simulation off (trigger events are driven by `KinematicTriggerTicker`).
- Select `KinematicKart.prefab`: NetworkTransformUnreliable shows ClientToServer, sensitivity 0.01 / 0.5, compressRotation on, syncScale off.
