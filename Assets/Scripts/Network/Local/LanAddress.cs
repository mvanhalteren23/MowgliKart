using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace LegacyVR.KartRacing.Networking.Local
{
    /// <summary>
    /// Finds the Mac/laptop's LAN IPv4 address that the Pico headsets can reach.
    /// Pure .NET (no Unity dependency) so it is unit-testable outside the editor.
    /// </summary>
    public static class LanAddress
    {
        // Interfaces that are never the headset-facing Wi-Fi/Ethernet link.
        private static readonly string[] VirtualPrefixes =
        {
            "utun", "awdl", "llw", "bridge", "gif", "stf", "ap", "anpi", "vmnet", "vboxnet", "docker", "veth", "br-", "lo", "tun", "tap"
        };

        /// <summary>Returns the best private IPv4 address, or null when the machine is offline.</summary>
        public static string GetPrimaryIPv4()
        {
            List<Candidate> candidates = GetCandidates();
            return candidates.Count == 0 ? null : candidates[0].Address;
        }

        /// <summary>All usable addresses, best first (Wi-Fi/Ethernet on private ranges before everything else).</summary>
        public static List<Candidate> GetCandidates()
        {
            var result = new List<Candidate>();

            NetworkInterface[] nics;
            try
            {
                nics = NetworkInterface.GetAllNetworkInterfaces();
            }
            catch (Exception)
            {
                return result;
            }

            foreach (NetworkInterface nic in nics)
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                if (IsVirtual(nic.Name)) continue;

                IPInterfaceProperties props;
                try { props = nic.GetIPProperties(); }
                catch (Exception) { continue; }

                foreach (UnicastIPAddressInformation ua in props.UnicastAddresses)
                {
                    if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    if (IPAddress.IsLoopback(ua.Address)) continue;

                    string text = ua.Address.ToString();
                    if (text.StartsWith("169.254.", StringComparison.Ordinal)) continue; // link-local = no DHCP lease

                    result.Add(new Candidate
                    {
                        InterfaceName = nic.Name,
                        Address = text,
                        Score = Score(nic, ua.Address, props)
                    });
                }
            }

            result.Sort((a, b) => b.Score.CompareTo(a.Score));
            return result;
        }

        public struct Candidate
        {
            public string InterfaceName;
            public string Address;
            public int Score;
        }

        public static bool IsPrivate(IPAddress ip)
        {
            byte[] b = ip.GetAddressBytes();
            if (b.Length != 4) return false;
            return b[0] == 10 ||
                   (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||
                   (b[0] == 192 && b[1] == 168);
        }

        private static bool IsVirtual(string name)
        {
            if (string.IsNullOrEmpty(name)) return false;
            foreach (string prefix in VirtualPrefixes)
            {
                if (name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        private static int Score(NetworkInterface nic, IPAddress ip, IPInterfaceProperties props)
        {
            int score = 0;
            if (IsPrivate(ip)) score += 100;
            if (nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211) score += 30;
            else if (nic.NetworkInterfaceType == NetworkInterfaceType.Ethernet) score += 20;
            if (props.GatewayAddresses.Count > 0) score += 10; // default route => the "real" LAN
            // macOS: en0 is normally Wi-Fi on laptops, en1.. are Thunderbolt/Ethernet adapters.
            if (nic.Name.Equals("en0", StringComparison.OrdinalIgnoreCase)) score += 5;
            return score;
        }
    }
}
