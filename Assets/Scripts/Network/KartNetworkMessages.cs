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
    /// Sent by the designated "Player 1" headset to control in-game session UI (e.g., countdown trigger).
    /// </summary>
    public struct LeaderSessionCommandMessage : NetworkMessage
    {
        public int SessionId;
        public byte CommandType; // 1 = StartGameCountdown, 2 = PauseSession, 3 = ReturnGroupToHub
    }
}
