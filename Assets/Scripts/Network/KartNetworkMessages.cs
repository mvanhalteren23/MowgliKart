using Mirror;

namespace LegacyVR.KartRacing.Networking
{
    public enum CameraRigTrackingMode : byte
    {
        StationarySeated = 0,
        VehicleHorizonLocked = 1,
        Free3DoFFollow = 2
    }

    /// <summary>
    /// Sent by each Pico G1/G2 Thin Client immediately upon connecting to the Windows Master Server.
    /// </summary>
    public struct DeviceRegistrationMessage : NetworkMessage
    {
        public string MacAddress;
        public string SerialNumber;
        public string DeviceModel;
        public int BatteryPercent;
        public string CurrentLoadedSceneKey;
    }

    /// <summary>
    /// Operator-initiated headset commands pushed from the Mac master to a headset via [TargetRpc].
    /// </summary>
    public enum DeviceCommandType : byte
    {
        RecenterView = 1,
        Reboot = 2,
        Shutdown = 3,
        ExitKiosk = 4,
        EnterKiosk = 5
    }

    /// <summary>
    /// Heartbeat sent by every headset every few seconds so the operator sees live battery / scene state.
    /// </summary>
    public struct DeviceStatusMessage : NetworkMessage
    {
        public string MacAddress;
        public int BatteryPercent;
        public string CurrentLoadedSceneKey;
    }

    /// <summary>
    /// Sent by a Pico client to the Master Server when Addressables.LoadSceneAsync completes.
    /// </summary>
    public struct ClientSceneReadyMessage : NetworkMessage
    {
        public string MacAddress;
        public int SessionId;
        public string GameModuleId;
        public string LoadedSceneKey;
        public bool IsPlayerOneLeader;
        public int AssignedGridSlot;
    }

    /// <summary>
    /// Sent by the Player 1 headset from the lobby menu to choose which game / map the whole group plays next.
    /// The server re-validates that the sender is the leader of that session before launching anything.
    /// </summary>
    public struct LeaderLaunchRequestMessage : NetworkMessage
    {
        public int SessionId;
        public string GameModuleId;
    }

    /// <summary>
    /// Sent by the designated "Player 1" headset to control in-game session UI (e.g., countdown trigger).
    /// </summary>
    public struct LeaderSessionCommandMessage : NetworkMessage
    {
        public int SessionId;
        public byte CommandType; // 1 = StartGameCountdown, 2 = PauseSession, 3 = ReturnGroupToHub
    }
}
