# Testing: what is proven, what still needs hardware

## Run it
```
bash tests/run_logic_tests.sh   # needs mono (brew install mono | apt install mono-mcs mono-runtime) - 260 checks, ~10 s
bash tests/run_net_tests.sh     # needs .NET SDK 8 (brew install --cask dotnet-sdk) - real UDP sockets, 15 checks
```
Both also run in CI (`.github/workflows/build.yml`, job `tests`) on every push, without a Unity licence.

## 1. Logic tests (`tests/LogicTests`, 260 checks)
They compile the project's **real runtime scripts** (`Assets/Scripts/**`: manager, dispatcher, auto-connect, kiosk, camera
rig, kart, operator panel, lobby menu, bootstrap) against in-memory stand-ins for Unity, Mirror, Pico and Addressables, then
simulate a Mac and up to 8 headsets in one process.

| Area | What is verified |
| --- | --- |
| Mac hosting | server config (8 connections, 20 Hz, fixed 110 ms snapshot buffer), handlers registered, bootstrap starts server + discovery advertising + a **real** HTTP content server and stops them again |
| Headsets connect | 8 headsets register in both message orders (AddPlayer before/after registration), dispatcher wiring, unique identity keys (Android's fake `02:00:00:00:00:00` MAC no longer merges two headsets) |
| Locate + connect | `KartClientAutoConnect`: discovery -> `StartClient(kcp://ip:7777)`, follows a Mac that changed IP, retries forever when nobody answers, manual-address fallback, idle on the Mac, visible status when misconfigured |
| Reconnect / Wi-Fi blip | old socket timing out no longer deletes the live record **(bug found + fixed)**; a reconnected Player 1 gets its group and menu back; a mid-game reconnect returns to the lobby with the group intact |
| Player 1 control | Player 1 picks game/map from the lobby menu (touchpad + trigger); server re-validates sender, session and module (non-leaders, outsiders, wrong session, unknown/empty module all rejected); leader commands relayed; "Return to hub" keeps the group so Player 1 can pick the next map |
| Operator (Mac) | panel buttons: LAUNCH, Form group, Recenter, Return/Group to lobby, Disband, Release/Re-lock kiosk, Reboot/Shutdown (needs *Arm power*), disabled states |
| Pico side | kiosk lock-down calls, release/re-lock, Pico G1 fallback identity path when ToBService is missing, heartbeat (battery, -1 -> 100 %), remote catalog `{SERVER_IP}` resolved + loaded once per headset, failing catalog/scene handled |
| 3DoF camera | real quaternion math: recenter puts the gaze exactly on the kart's heading, head turn adds on top, kart pitch/roll never reaches the player, stationary mode keeps yaw |
| Kart | forced kinematic + trigger, boost pad, bump, remote karts don't simulate |

Honesty about the fakes: Unity's compiler, Mirror's weaver/serialisation/NetworkTransform and Pico's native services are
**not** exercised. `Application` statics are shared by all simulated headsets in one process (per-device in reality).
To make sure the suite is not vacuous, 12 deliberate bugs were injected into the real scripts; all 12 were caught.

## 2. Real-socket test (`tests/NetTests`, 15 checks)
Mirror's own KCP transport library with exactly the project's settings (NoDelay, 10 ms, FastResend 2, 4096 windows):
1 server + 8 clients over real UDP. All 8 connect (34 ms here), targeted vs. broadcast delivery, 20 Hz unreliable stream
(0 % loss), 200 KB reliable message, a dropped client doesn't disturb the other 7, reconnect works.
The sandbox that ran this has no IPv6, so the dual-stack socket variant ran IPv4-only.

## 3. Also covered elsewhere
`Pico preflight` (13/13 injected manifest/settings mistakes detected), `LocalContentServer` + `pico.sh` (real HTTP and a fake adb).

## NOT covered: do this on the first real run
1. Open in Unity 2020.3 -> fix compile errors -> **Tools > MowgliKart > Build Scenes**.
2. Mac: build + run the master app, allow incoming connections and **Local Network** access. The panel should show the Mac's LAN IP.
3. Install the APK on ONE headset (`scripts/mac/pico.sh install`), launch. Lobby text should go *Searching for master on LAN* -> *Connected - waiting for the operator*, and the headset must appear in the Mac list with battery within ~5 s.
   - Stuck on *Searching*: router blocks UDP broadcast / client isolation -> set `Manual Server Address` on `KartClientAutoConnect` (Boot scene) to the Mac IP and rebuild. Also check the macOS firewall.
4. Tick it + **P1** -> **Form group (P1 picks)**. The headset should show *PLAYER 1 - choose a game*; touchpad up/down moves, trigger starts. 
5. Add the other headsets one by one up to 8; watch frame time on the Pico G1 (target 70 FPS) and Wi-Fi stability with all 8 moving.
6. Check on a headset: `Kiosk: locked` in the lobby (else ToBService isn't granted), Release kiosk / Re-lock kiosk, Reboot.
7. Pull a headset's Wi-Fi for ~5 s and restore it: it must re-appear and (if Player 1) get its menu back.
If anything differs, send the Unity Console / `pico.sh logs` output and the step number.
