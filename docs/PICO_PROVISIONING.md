# Preparing the Pico headsets (PUI 3 / Android 8.1.0)

Do this once per headset, then everything else is driven from the Mac (`docs/MAC_QUICKSTART.md`).

## 1. Enable developer access
Settings > About > tap **PUI Version** 8-10 times > Developer options > enable **USB debugging**, set USB mode to **MTP**.
Plug into the Mac, accept the "Allow USB debugging" prompt on the headset, then `scripts/mac/pico.sh devices` should list it
as `device`.

## 2. Install and first launch
```
scripts/mac/pico.sh install      # all attached headsets, in parallel
scripts/mac/pico.sh launch
```
On first launch the client binds the Pico enterprise service (`ToBService`) and then locks itself in as the **Home launcher**,
disables the Home / Back / Volume / Power keys and turns auto-sleep off. The lobby text shows `Kiosk: locked` when this worked.
If it says `Kiosk: ToB not bound`, the firmware did not grant the enterprise APIs: the app still runs and streams games, it just is
not locked down. Check `scripts/mac/pico.sh logs` for `ToBService bound`.

## 3. Wi-Fi
Put every headset on the same 5 GHz network as the Mac with **client/AP isolation off**. Optional: tick `enforceRouterAutoConnect`
on `PicoKioskController` (SSID/password fields) so a headset re-joins the right network by itself after a reset.
`scripts/mac/pico.sh wifi` switches adb to Wi-Fi so you can unplug the cables.

## 4. Servicing a locked headset (important)
Kiosk mode removes the normal ways out, so use these in order:
1. **Operator panel > Release kiosk** (selected headsets): gives Home/Back/Volume/Power back and stops being the Home launcher.
   **Re-lock kiosk** applies the lock-down again.
2. `scripts/mac/pico.sh uninstall` removes the client over adb, which restores the stock Pico launcher.
3. Factory reset from the recovery menu as a last resort.

## 5. What the lobby shows
`Connected - waiting for the operator` once the Mac found it; otherwise `Searching for master on LAN`. If it keeps
searching: same Wi-Fi? firewall prompt on the Mac answered? router blocking broadcast (set `Manual Server Address`)?
