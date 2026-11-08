using UnityEngine;

namespace LegacyVR.KartRacing.Networking
{
    /// <summary>
    /// Hooked up to the buttons on the "LeaderControlUI" canvas. Only the Player 1 headset ever sees that canvas
    /// (KartClientDispatcher enables it for the leader only); the server re-validates the sender anyway.
    /// </summary>
    public class LeaderCommandButtons : MonoBehaviour
    {
        public const byte StartGameCountdown = 1;
        public const byte PauseSession = 2;
        public const byte ReturnGroupToHub = 3;

        public void SendStartCountdown() => Send(StartGameCountdown);
        public void SendPause() => Send(PauseSession);
        public void SendReturnToHub() => Send(ReturnGroupToHub);

        private static void Send(byte command)
        {
            if (KartClientDispatcher.LocalInstance != null)
            {
                KartClientDispatcher.LocalInstance.RequestLeaderSessionCommand(command);
            }
        }
    }
}
