// Stand-ins for Pvr_UnitySDKAPI with observable state. Struct names/shape mirror the real SDK
// (Sensor, System, ToBService, Controller are STRUCTS with static members - the same name-clash behaviour as the real one).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Pvr_UnitySDKAPI
{
    public enum Pvr_KeyCode { APP, TOUCHPAD, HOME, TRIGGER }
    public enum ControllerState { Error, DisConnected, Connected }
    public enum PBS_DeviceControlEnum { DEVICE_CONTROL_REBOOT, DEVICE_CONTROL_SHUTDOWN }
    public enum PBS_SwitchEnum { S_ON, S_OFF }
    public enum PBS_HomeEventEnum { SINGLE_CLICK, DOUBLE_CLICK, LONG_PRESS }
    public enum PBS_HomeFunctionEnum { VALUE_HOME_DISABLE, VALUE_HOME_RECENTER, VALUE_HOME_GO_TO_HOME, VALUE_HOME_GO_TO_SETTING }
    public enum PBS_ScreenOffDelayTimeEnum { NEVER = -1 }
    public enum PBS_SleepDelayTimeEnum { NEVER = -1 }
    public enum PBS_SystemFunctionSwitchEnum { SFS_AUTOSLEEP, SFS_SCREENON_CHARGING }
    public enum PBS_SystemInfoEnum { EQUIPMENT_SN, WLAN_MAC_ADDRESS }

    public static class FakePico
    {
        public static List<string> Calls = new List<string>();
        public static bool ToBThrows;           // simulates an old PUI ROM without ToBService
        public static string ToBMac = "AA:BB:CC:00:00:01", ToBSerial = "SN-TOB-1", SdkSerial = "SN-SDK-1";
        public static bool SdkSerialThrows;
        public static ControllerState PadState = ControllerState.Connected;
        public static Vector2 Axis;
        public static HashSet<Pvr_KeyCode> KeysDown = new HashSet<Pvr_KeyCode>(), KeysHeld = new HashSet<Pvr_KeyCode>();
        public static int ControllerResets;
        public static void Reset()
        {
            Calls.Clear(); ToBThrows = false; SdkSerialThrows = false; ToBMac = "AA:BB:CC:00:00:01"; ToBSerial = "SN-TOB-1"; SdkSerial = "SN-SDK-1";
            PadState = ControllerState.Connected; Axis = default(Vector2); KeysDown.Clear(); KeysHeld.Clear(); ControllerResets = 0;
            ToBService.BoolCallback = null; ToBService.IntCallback = null;
        }
        public static bool Called(string s) { return Calls.Contains(s); }
    }

    public struct Sensor
    {
        public static void UPvr_InitPsensor() { FakePico.Calls.Add("InitPsensor"); }
        public static void UPvr_UnregisterPsensor() { FakePico.Calls.Add("UnregisterPsensor"); }
        public static int UPvr_OptionalResetSensor(int a, int b, int c) { FakePico.Calls.Add("ResetSensor"); return 0; }
    }
    public struct System
    {
        public static string UPvr_GetDeviceSN()
        {
            if (FakePico.SdkSerialThrows) throw new InvalidOperationException("no SDK serial");
            return FakePico.SdkSerial;
        }
    }
    public struct Controller
    {
        public static Vector2 UPvr_GetAxis2D(int hand) { return FakePico.Axis; }
        public static ControllerState UPvr_GetControllerState(int hand) { return FakePico.PadState; }
        public static Quaternion UPvr_GetControllerQUA(int hand) { return Quaternion.identity; }
        public static bool UPvr_GetKey(int hand, Pvr_KeyCode k) { return FakePico.KeysHeld.Contains(k); }
        public static bool UPvr_GetKeyDown(int hand, Pvr_KeyCode k) { return FakePico.KeysDown.Contains(k); }
        public static bool UPvr_GetKeyLongPressed(int hand, Pvr_KeyCode k) { return false; }
    }
    public struct ToBService
    {
        public static Action<bool> BoolCallback; public static Action<int> IntCallback; public static Action<long> LongCallback; public static Action<string> StringCallback;
        private static void Rec(string s) { if (FakePico.ToBThrows) throw new InvalidOperationException("ToBService unavailable"); FakePico.Calls.Add(s); }
        public static void UPvr_InitToBService() { Rec("InitToB"); }
        public static void UPvr_SetUnityObjectName(string o) { Rec("SetUnityObjectName:" + o); }
        public static void UPvr_BindToBService() { Rec("BindToB"); }
        public static void UPvr_UnBindToBService() { FakePico.Calls.Add("UnbindToB"); }
        public static string UPvr_StateGetDeviceInfo(PBS_SystemInfoEnum t) { return t == PBS_SystemInfoEnum.WLAN_MAC_ADDRESS ? FakePico.ToBMac : FakePico.ToBSerial; }
        public static void UPvr_ControlSetAutoConnectWIFI(string s, string p, Action<bool> c) { Rec("AutoWifi:" + s); }
        public static void UPvr_PropertySetHomeKey(PBS_HomeEventEnum e, PBS_HomeFunctionEnum f, Action<bool> c) { Rec("HomeKey:" + e + "=" + f); }
        public static void UPvr_PropertyDisablePowerKey(bool single, bool enable, Action<int> c) { Rec("PowerKey:single=" + single + ",enable=" + enable); }
        public static void UPvr_PropertySetScreenOffDelay(PBS_ScreenOffDelayTimeEnum t, Action<int> c) { Rec("ScreenOff:" + t); }
        public static void UPvr_PropertySetSleepDelay(PBS_SleepDelayTimeEnum t) { Rec("SleepDelay:" + t); }
        public static void UPvr_SwitchSystemFunction(PBS_SystemFunctionSwitchEnum f, PBS_SwitchEnum s) { Rec("SysFn:" + f + "=" + s); }
        public static void UPvr_ControlSetDeviceAction(PBS_DeviceControlEnum d, Action<int> c) { Rec("DeviceAction:" + d); }
        public static void UPvr_AcquireWakeLock() { Rec("WakeLock"); }
        public static void UPvr_ReleaseWakeLock() { FakePico.Calls.Add("ReleaseWakeLock"); }
        public static void UPvr_EnableBackKey() { Rec("EnableBack"); }
        public static void UPvr_DisableBackKey() { Rec("DisableBack"); }
        public static void UPvr_EnableVolumeKey() { Rec("EnableVolume"); }
        public static void UPvr_DisableVolumeKey() { Rec("DisableVolume"); }
        public static void UPvr_SetAPPAsHome(PBS_SwitchEnum s, string pkg) { Rec("AppAsHome:" + s + ":" + pkg); }
    }
}

public class Pvr_ControllerManager : UnityEngine.MonoBehaviour
{
    private static Pvr_ControllerManager _i;
    public static Pvr_ControllerManager Instance { get { if (_i == null) _i = new UnityEngine.GameObject("ControllerManager").AddComponent<Pvr_ControllerManager>(); return _i; } }
    public static void ResetStatic() { _i = null; }
    public void ResetController(int num) { Pvr_UnitySDKAPI.FakePico.ControllerResets++; }
}
