using UnityEngine;
using Pvr_UnitySDKAPI;
using LegacyVR.KartRacing.Networking;

namespace LegacyVR.KartClient.SystemService
{
    /// <summary>
    /// Player 1's lobby menu, drawn into a TextMesh in HubScene. Controller: swipe/press the touchpad up/down to move,
    /// TRIGGER to start the highlighted game for the whole group. Editor/keyboard: Up/Down + Return.
    /// Everyone else in the group sees a waiting message. Nothing is shown to headsets that are not in a group.
    /// </summary>
    [RequireComponent(typeof(TextMesh))]
    public class HubLeaderMenu : MonoBehaviour
    {
        [SerializeField] private float moveThreshold = 0.6f;

        private TextMesh _text;
        private int _index;
        private bool _axisLatched;

        private void Awake()
        {
            _text = GetComponent<TextMesh>();
        }

        private void Update()
        {
            KartClientDispatcher d = KartClientDispatcher.LocalInstance;

            if (d == null || !d.IsInLobbyGroup)
            {
                _text.text = string.Empty;
                return;
            }

            if (!d.IsPlayerOneLeader)
            {
                _text.text = "Waiting for Player 1\nto choose the game...";
                return;
            }

            string[] modules = d.AvailableModuleIds;
            if (modules == null || modules.Length == 0)
            {
                _text.text = "PLAYER 1\nNo games available";
                return;
            }

            _index = Mathf.Clamp(_index, 0, modules.Length - 1);

            int move = ReadMove();
            if (move != 0)
            {
                _index = (_index + move + modules.Length) % modules.Length;
            }

            var sb = new System.Text.StringBuilder(128);
            sb.AppendLine("PLAYER 1 - choose a game");
            for (int i = 0; i < modules.Length; i++)
            {
                sb.Append(i == _index ? "> " : "  ").AppendLine(modules[i]);
            }
            sb.Append("Trigger = start");
            _text.text = sb.ToString();

            if (ReadConfirm())
            {
                d.RequestLaunch(modules[_index]);
            }
        }

        private int ReadMove()
        {
            float y = 0f;
            if (Controller.UPvr_GetControllerState(0) == ControllerState.Connected)
            {
                y = Controller.UPvr_GetAxis2D(0).y;
            }

            if (Input.GetKeyDown(KeyCode.DownArrow)) return 1;
            if (Input.GetKeyDown(KeyCode.UpArrow)) return -1;

            // Edge-detect so one swipe moves exactly one entry.
            if (Mathf.Abs(y) < moveThreshold)
            {
                _axisLatched = false;
                return 0;
            }

            if (_axisLatched)
                return 0;

            _axisLatched = true;
            return y > 0f ? -1 : 1; // touchpad up = previous entry
        }

        private static bool ReadConfirm()
        {
            return Input.GetKeyDown(KeyCode.Return) ||
                   (Controller.UPvr_GetControllerState(0) == ControllerState.Connected &&
                    Controller.UPvr_GetKeyDown(0, Pvr_KeyCode.TRIGGER));
        }
    }
}
