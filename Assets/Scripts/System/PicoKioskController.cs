using System;
using System.Net.NetworkInformation;
using UnityEngine;
using Pvr_UnitySDKAPI;

namespace LegacyVR.KartClient.SystemService
{
    /// <summary>
    /// Enforces Kiosk Mode on Pico G1/G2 using PicoVR Unity SDK v2.8.12 ToBService
    /// and proximity sensor power management.
    /// Attach this component to a persistent root GameObject named "PicoKioskController".
    /// </summary>
    public class PicoKioskController : MonoBehaviour
    {
        public static PicoKioskController Instance { get; private set; }

        [Header("Kiosk Configuration")]
        [SerializeField] private bool lockAsHomeLauncher = true;
        [SerializeField] private bool disableSystemHomeKey = true;
        [SerializeField] private bool disableBackAndVolumeKeys = true;
        [SerializeField] private bool keepScreenAlwaysOn = true;

        [Header("Optional Auto-WiFi Provisioning (5GHz Local Router)")]
        [SerializeField] private bool enforceRouterAutoConnect = false;
        [SerializeField] private string routerSsid = "VR_KART_5GHZ_LAN";
        [SerializeField] private string routerPassword = "KartServer5GHzPassword";

        public bool IsToBServiceBound { get; private set; }

        /// <summary>True after the operator released the headset for servicing; the lock-down is not re-applied until EnterKiosk().</summary>
        public bool KioskReleased { get; private set; }
        public string CachedMacAddress { get; private set; }
        public string CachedSerialNumber { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            Application.runInBackground = true;

            // Initialize Head Proximity Sensor (Psensor) per PicoVR SDK Section 7.5
            Pvr_UnitySDKAPI.Sensor.UPvr_InitPsensor();

            // Initialize and bind ToBService per PicoVR SDK v2.8.12 Section 7.12
            try
            {
                Pvr_UnitySDKAPI.ToBService.UPvr_InitToBService();
                Pvr_UnitySDKAPI.ToBService.UPvr_SetUnityObjectName(gameObject.name);
                Pvr_UnitySDKAPI.ToBService.UPvr_BindToBService();
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[PicoKioskController] ToBService init fallback (Pico G1 legacy PUI): {ex.Message}");
                PopulateFallbackDeviceIdentifiers();
            }
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                try
                {
                    Pvr_UnitySDKAPI.ToBService.UPvr_ReleaseWakeLock();
                    Pvr_UnitySDKAPI.ToBService.UPvr_UnBindToBService();
                    Pvr_UnitySDKAPI.Sensor.UPvr_UnregisterPsensor();
                }
                catch (Exception)
                {
                    // Ignore on teardown in Editor
                }
            }
        }

        /// <summary>
        /// Mandatory callback invoked via UnitySendMessage by Pico ToBService AAR once bound.
        /// Method signature must match PicoVR SDK v2.8.12 Section 7.12 exactly: toBServiceBind(string).
        /// </summary>
        public void toBServiceBind(string status)
        {
            IsToBServiceBound = true;
            Debug.Log($"[PicoKioskController] ToBService bound with status: {status}");

            if (!KioskReleased)
            {
                ApplyKioskLockdown();
            }

            QueryHardwareIdentifiersViaToB();
        }

        /// <summary>
        /// Servicing escape hatch (operator button "Release kiosk"): stops being the Home launcher and gives the
        /// Home / Back / Volume / Power keys back so staff can reach the Pico launcher and Settings.
        /// </summary>
        public void ReleaseKiosk()
        {
            if (!IsToBServiceBound)
            {
                Debug.LogWarning("[PicoKioskController] ReleaseKiosk ignored: ToBService is not bound. Use `scripts/mac/pico.sh uninstall` as a last resort.");
                return;
            }

            KioskReleased = true;

            Pvr_UnitySDKAPI.ToBService.UPvr_SetAPPAsHome(PBS_SwitchEnum.S_OFF, Application.identifier);

            Pvr_UnitySDKAPI.ToBService.UPvr_PropertySetHomeKey(
                PBS_HomeEventEnum.SINGLE_CLICK, PBS_HomeFunctionEnum.VALUE_HOME_GO_TO_HOME,
                success => Debug.Log($"[PicoKioskController] Home single-click restored: {success}"));
            Pvr_UnitySDKAPI.ToBService.UPvr_PropertySetHomeKey(
                PBS_HomeEventEnum.DOUBLE_CLICK, PBS_HomeFunctionEnum.VALUE_HOME_RECENTER,
                success => Debug.Log($"[PicoKioskController] Home double-click restored: {success}"));
            Pvr_UnitySDKAPI.ToBService.UPvr_PropertySetHomeKey(
                PBS_HomeEventEnum.LONG_PRESS, PBS_HomeFunctionEnum.VALUE_HOME_GO_TO_SETTING,
                success => Debug.Log($"[PicoKioskController] Home long-press restored: {success}"));

            Pvr_UnitySDKAPI.ToBService.UPvr_EnableBackKey();
            Pvr_UnitySDKAPI.ToBService.UPvr_EnableVolumeKey();
            Pvr_UnitySDKAPI.ToBService.UPvr_PropertyDisablePowerKey(
                true, true,
                code => Debug.Log($"[PicoKioskController] Power key restored: {code}"));
        }

        /// <summary>Re-applies the full kiosk lock-down after servicing (operator button "Re-lock kiosk").</summary>
        public void EnterKiosk()
        {
            KioskReleased = false;

            if (IsToBServiceBound)
            {
                ApplyKioskLockdown();
            }
        }

        private void ApplyKioskLockdown()
        {
            if (keepScreenAlwaysOn)
            {
                Pvr_UnitySDKAPI.ToBService.UPvr_AcquireWakeLock();
                Pvr_UnitySDKAPI.ToBService.UPvr_PropertySetScreenOffDelay(
                    PBS_ScreenOffDelayTimeEnum.NEVER,
                    code => Debug.Log($"[PicoKioskController] ScreenOffDelay NEVER result: {code}")
                );
                Pvr_UnitySDKAPI.ToBService.UPvr_PropertySetSleepDelay(PBS_SleepDelayTimeEnum.NEVER);
                Pvr_UnitySDKAPI.ToBService.UPvr_SwitchSystemFunction(
                    PBS_SystemFunctionSwitchEnum.SFS_AUTOSLEEP,
                    PBS_SwitchEnum.S_OFF
                );
                Pvr_UnitySDKAPI.ToBService.UPvr_SwitchSystemFunction(
                    PBS_SystemFunctionSwitchEnum.SFS_SCREENON_CHARGING,
                    PBS_SwitchEnum.S_ON
                );
            }

            if (lockAsHomeLauncher)
            {
                Pvr_UnitySDKAPI.ToBService.UPvr_SetAPPAsHome(
                    PBS_SwitchEnum.S_ON,
                    Application.identifier
                );
            }

            if (disableSystemHomeKey)
            {
                Pvr_UnitySDKAPI.ToBService.UPvr_PropertySetHomeKey(
                    PBS_HomeEventEnum.SINGLE_CLICK,
                    PBS_HomeFunctionEnum.VALUE_HOME_DISABLE,
                    success => Debug.Log($"[PicoKioskController] Disable Home Single-Click: {success}")
                );

                Pvr_UnitySDKAPI.ToBService.UPvr_PropertySetHomeKey(
                    PBS_HomeEventEnum.DOUBLE_CLICK,
                    PBS_HomeFunctionEnum.VALUE_HOME_DISABLE,
                    success => Debug.Log($"[PicoKioskController] Disable Home Double-Click: {success}")
                );

                Pvr_UnitySDKAPI.ToBService.UPvr_PropertySetHomeKey(
                    PBS_HomeEventEnum.LONG_PRESS,
                    PBS_HomeFunctionEnum.VALUE_HOME_RECENTER,
                    success => Debug.Log($"[PicoKioskController] Map Home Long-Press to Recenter: {success}")
                );
            }

            if (disableBackAndVolumeKeys)
            {
                Pvr_UnitySDKAPI.ToBService.UPvr_DisableBackKey();
                Pvr_UnitySDKAPI.ToBService.UPvr_DisableVolumeKey();
                Pvr_UnitySDKAPI.ToBService.UPvr_PropertyDisablePowerKey(
                    true,
                    false,
                    code => Debug.Log($"[PicoKioskController] Disable Single-Tap Power Key code: {code}")
                );
            }

            if (enforceRouterAutoConnect && !string.IsNullOrEmpty(routerSsid))
            {
                Pvr_UnitySDKAPI.ToBService.UPvr_ControlSetAutoConnectWIFI(
                    routerSsid,
                    routerPassword,
                    connected => Debug.Log($"[PicoKioskController] Auto-connect 5GHz Wi-Fi ({routerSsid}): {connected}")
                );
            }
        }

        private void QueryHardwareIdentifiersViaToB()
        {
            try
            {
                CachedMacAddress = Pvr_UnitySDKAPI.ToBService.UPvr_StateGetDeviceInfo(PBS_SystemInfoEnum.WLAN_MAC_ADDRESS);
                CachedSerialNumber = Pvr_UnitySDKAPI.ToBService.UPvr_StateGetDeviceInfo(PBS_SystemInfoEnum.EQUIPMENT_SN);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[PicoKioskController] ToB device info query failed, using fallback: {ex.Message}");
            }

            if (string.IsNullOrEmpty(CachedMacAddress) || string.IsNullOrEmpty(CachedSerialNumber))
            {
                PopulateFallbackDeviceIdentifiers();
            }
        }

        /// <summary>
        /// Pico G1 / older PUI ROM fallback: used whenever ToBService is unavailable or returns empty values.
        /// </summary>
        public void PopulateFallbackDeviceIdentifiers()
        {
            if (string.IsNullOrEmpty(CachedSerialNumber))
            {
                try
                {
                    CachedSerialNumber = Pvr_UnitySDKAPI.System.UPvr_GetDeviceSN();
                }
                catch (Exception)
                {
                    CachedSerialNumber = SystemInfo.deviceUniqueIdentifier;
                }

                if (string.IsNullOrEmpty(CachedSerialNumber))
                {
                    CachedSerialNumber = SystemInfo.deviceUniqueIdentifier;
                }
            }

            if (string.IsNullOrEmpty(CachedMacAddress))
            {
                CachedMacAddress = ReadWlan0MacAddress() ?? SystemInfo.deviceUniqueIdentifier;
            }
        }

        private static string ReadWlan0MacAddress()
        {
            try
            {
                foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.Name.Equals("wlan0", StringComparison.OrdinalIgnoreCase))
                    {
                        byte[] bytes = nic.GetPhysicalAddress().GetAddressBytes();
                        if (bytes != null && bytes.Length == 6)
                        {
                            return BitConverter.ToString(bytes).Replace("-", ":").ToUpperInvariant();
                        }
                    }
                }
            }
            catch (Exception)
            {
                // Ignore if restricted by Android OS level
            }
            return null;
        }

        // The callbacks below are invoked by the ToBService AAR via UnitySendMessage on this GameObject.
        private void BoolCallback(string value)
        {
            if (Pvr_UnitySDKAPI.ToBService.BoolCallback != null)
                Pvr_UnitySDKAPI.ToBService.BoolCallback(bool.Parse(value));
            Pvr_UnitySDKAPI.ToBService.BoolCallback = null;
        }

        private void IntCallback(string value)
        {
            if (Pvr_UnitySDKAPI.ToBService.IntCallback != null)
                Pvr_UnitySDKAPI.ToBService.IntCallback(int.Parse(value));
            Pvr_UnitySDKAPI.ToBService.IntCallback = null;
        }

        private void LongCallback(string value)
        {
            if (Pvr_UnitySDKAPI.ToBService.LongCallback != null)
                Pvr_UnitySDKAPI.ToBService.LongCallback(long.Parse(value));
            Pvr_UnitySDKAPI.ToBService.LongCallback = null;
        }

        private void StringCallback(string value)
        {
            if (Pvr_UnitySDKAPI.ToBService.StringCallback != null)
                Pvr_UnitySDKAPI.ToBService.StringCallback(value);
            Pvr_UnitySDKAPI.ToBService.StringCallback = null;
        }
    }
}
