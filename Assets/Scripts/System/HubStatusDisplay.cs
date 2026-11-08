using System.Text;
using UnityEngine;
using Mirror;
using LegacyVR.KartRacing.Networking;

namespace LegacyVR.KartClient.SystemService
{
    /// <summary>
    /// Headsets have no keyboard/mouse UI, so staff need to see at a glance whether a headset found the Mac.
    /// Renders connection, kiosk and battery state into the TextMesh of the lobby (HubScene).
    /// </summary>
    [RequireComponent(typeof(TextMesh))]
    public class HubStatusDisplay : MonoBehaviour
    {
        [SerializeField] private float refreshSeconds = 0.5f;

        private TextMesh _text;
        private float _nextRefresh;
        private readonly StringBuilder _sb = new StringBuilder(256);

        private void Awake()
        {
            _text = GetComponent<TextMesh>();
        }

        private void Update()
        {
            if (Time.unscaledTime < _nextRefresh)
                return;

            _nextRefresh = Time.unscaledTime + refreshSeconds;
            _text.text = Build();
        }

        private string Build()
        {
            _sb.Length = 0;
            _sb.AppendLine("MowgliKart");

            bool connected = NetworkClient.isConnected;
            KartClientAutoConnect auto = KartClientAutoConnect.Instance;
            _sb.AppendLine(connected ? "Connected - waiting for the operator" : (auto != null ? auto.Status : "Starting..."));

            PicoKioskController kiosk = PicoKioskController.Instance;
            if (kiosk != null)
            {
                _sb.Append("Kiosk: ");
                _sb.AppendLine(!kiosk.IsToBServiceBound ? "ToB not bound" : (kiosk.KioskReleased ? "released (service mode)" : "locked"));

                if (!string.IsNullOrEmpty(kiosk.CachedMacAddress))
                {
                    _sb.Append("ID: ");
                    _sb.AppendLine(kiosk.CachedMacAddress);
                }
            }

            float battery = SystemInfo.batteryLevel;
            if (battery >= 0f)
            {
                _sb.Append("Battery: ");
                _sb.Append(Mathf.RoundToInt(battery * 100f));
                _sb.Append('%');
            }

            return _sb.ToString();
        }
    }
}
