# MowgliKart on a Mac: control up to 8 Pico headsets

The Mac runs the **master app** (Unity macOS build): it hosts the Mirror server, announces itself on the LAN,
serves game content over HTTP and shows the operator console. The headsets run the **Pico client APK** and need no
typing or UI: they find the Mac by themselves and reconnect after Wi-Fi drops.

```
Mac (MowgliKartMaster.app)                     Pico headsets (PUI 3 / Android 8.1, up to 8)
  Mirror server  UDP 7777  <------------------  KartClientAutoConnect
  Discovery      UDP 47777 <---- broadcast ----  NetworkDiscovery.StartDiscovery
  Content server TCP 8080  -- catalogs/bundles->  Addressables.LoadContentCatalogAsync
  Operator panel (launch / hub / recenter / reboot)
```

## 1. One-time setup on the Mac
1. Install **Unity Hub** + **Unity 2020.3 LTS** with modules: *Mac Build Support (Mono)* and *Android Build Support*
   (+ OpenJDK, SDK & NDK Tools). Optional: `brew install --cask android-platform-tools` for `adb`.
2. Put the Mac and all headsets on the **same 5 GHz Wi-Fi / router** (client isolation OFF).
3. Open the project once in Unity (so packages resolve), then run **Tools > MowgliKart > Build Scenes**.

## 2. Build
| What | Menu | Terminal |
| --- | --- | --- |
| Mac operator app | Tools > MowgliKart > Build > macOS Master (.app) | `scripts/mac/build_master.sh` |
| Pico client APK | Tools > MowgliKart > Build > Pico Client (.apk) | `scripts/mac/build_apk.sh` |

Outputs: `Builds/macOS/MowgliKartMaster.app`, `Builds/Android/MowgliKartClient.apk`.
(Apple-silicon Macs run the 2020.3 player through Rosetta; use Unity 2021.2+ if you want a native arm64 player.)

## 2b. Cloud builds (no Unity on your Mac)
The repo has a GitHub Actions workflow (`.github/workflows/build.yml`). The *preflight* job always runs (no licence needed) and
validates the Pico manifest, SDK version, banned packages (OpenXR / picoxr / Netcode) and the physics/network settings.
The *build* job produces `MowgliKartClient.apk` and `MowgliKartMaster-macOS.tar.gz` as downloadable artifacts once you add
three repository secrets: `UNITY_LICENSE` (contents of your Unity personal `.ulf` licence), `UNITY_EMAIL`, `UNITY_PASSWORD`
(see game.ci docs, "Activation"). Untar the Mac app and run `xattr -dr com.apple.quarantine MowgliKartMaster.app`.

## 3. Put the client on the headsets (up to 8)
First-time headset preparation: `docs/PICO_PROVISIONING.md`.
Enable USB debugging on each headset (Settings > About > tap PUI version ~8x > Developer options), plug them in, then:
```
scripts/mac/pico.sh devices     # see them
scripts/mac/pico.sh install     # installs/updates all of them in parallel
scripts/mac/pico.sh wifi        # optional: adb over Wi-Fi, then unplug the cables
scripts/mac/pico.sh launch      # start the client (it also becomes the Home launcher after first run)
```
`pico.sh status | stop | reboot | logs [serial]` are also available (`status` shows installed / running / battery per headset).

## 4. Run an event
1. `scripts/mac/run_master.sh` (or open the .app). Click **Allow** for incoming connections and **Local Network** access.
   It starts the server, LAN discovery and the content server automatically.
2. Headsets appear in the list within a few seconds with battery and state.
3. Tick the headsets for a game, tick **P1** for the leader, pick the game, **LAUNCH**.
4. During play: **Recenter view**, **Return to hub** (selection or a whole session), **Reboot / Shut down** (tick *Arm power* first), **Release kiosk / Re-lock kiosk** for servicing.

## 5. Adding new games without rebuilding the APK
1. In a second Unity project build Addressables for **Android**; copy the output into `~/MowgliKart/ServerData/Android/`
   (button *Open content folder*).
2. On the `MasterKartNetworkManager` prefab add a game module: `AddressableSceneKey` = your scene address,
   `RemoteCatalogUrl` = `http://{SERVER_IP}:8080/Android/catalog_<name>.json` (`{SERVER_IP}` is filled with the Mac's
   LAN address at launch), `PlayerAvatarPrefab` = the networked avatar (must also be in the Mac's NetworkManager spawn list).

## Troubleshooting
| Symptom | Fix |
| --- | --- |
| Headsets never appear | Router blocks broadcast/client isolation. On the Boot scene set `KartClientAutoConnect > Manual Server Address` to the Mac's IP shown in the panel and rebuild. Check macOS firewall / Local Network permission. |
| Wrong IP shown (VPN, 2 NICs) | Click *Refresh IP*; disconnect the VPN. |
| "Discovery advertising failed" | A second master is already running (UDP 47777 in use). |
| Catalog download 404 | File not under `~/MowgliKart/ServerData/Android/`; open `http://<mac-ip>:8080/Android/<file>` in a browser to test. |
| Reboot/Shutdown ignored | ToBService not bound on that headset (needs PUI enterprise APIs); see log for `ToBService bound`. |
