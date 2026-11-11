# Read-only: lists Windows audio endpoints to a new text file (Windows PowerShell 5.1, not Administrator).
# Changes no setting, plays and records nothing. A field that cannot be read is written as "UNREADABLE (reason)".
param([Parameter(Mandatory = $true)][string]$OutFile)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $OutFile) { throw 'OutFile already exists; choose a new name' }

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class Ep {
    [StructLayout(LayoutKind.Sequential)] public struct PKEY { public Guid fmtid; public uint pid; }
    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection { int GetCount(out uint n); int Item(uint i, out IMMDevice d); }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore { int GetCount(out uint n); int GetAt(uint i, out PKEY k); int GetValue(ref PKEY k, IntPtr pv); }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate(ref Guid iid, int ctx, IntPtr p, out IntPtr iface);
        int OpenPropertyStore(int access, out IPropertyStore store);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection c);
        int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d);
    }
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator { }
    [DllImport("ole32.dll")] static extern int PropVariantClear(IntPtr pv);

    static string Prop(IPropertyStore s, string guid, uint pid) {
        PKEY k = new PKEY(); k.fmtid = new Guid(guid); k.pid = pid;
        IntPtr pv = Marshal.AllocCoTaskMem(32);
        for (int i = 0; i < 32; i++) Marshal.WriteByte(pv, i, 0);
        try {
            int hr = s.GetValue(ref k, pv);
            if (hr != 0) return "UNREADABLE (hr=0x" + hr.ToString("X8") + ")";
            int vt = Marshal.ReadInt16(pv, 0);
            if (vt == 0) return "UNREADABLE (property not present)";
            IntPtr data = new IntPtr(pv.ToInt64() + 8);
            if (vt == 31) return Marshal.PtrToStringUni(Marshal.ReadIntPtr(data));
            if (vt == 19) return Marshal.ReadInt32(data).ToString();
            if (vt == 11) return Marshal.ReadInt16(data) != 0 ? "true" : "false";
            if (vt == 65) {
                int cb = Marshal.ReadInt32(data);
                IntPtr p = Marshal.ReadIntPtr(new IntPtr(data.ToInt64() + IntPtr.Size));
                byte[] b = new byte[cb]; Marshal.Copy(p, b, 0, cb);
                return "BLOB:" + BitConverter.ToString(b);
            }
            return "UNREADABLE (unhandled type " + vt + ")";
        } finally { PropVariantClear(pv); Marshal.FreeCoTaskMem(pv); }
    }
    static string Format(string blob) {
        if (!blob.StartsWith("BLOB:")) return blob;
        string[] h = blob.Substring(5).Split('-'); byte[] b = new byte[h.Length];
        for (int i = 0; i < h.Length; i++) b[i] = Convert.ToByte(h[i], 16);
        if (b.Length < 16) return "UNREADABLE (blob too short)";
        int tag = BitConverter.ToUInt16(b, 0), ch = BitConverter.ToUInt16(b, 2), bits = BitConverter.ToUInt16(b, 14);
        uint rate = BitConverter.ToUInt32(b, 4);
        string kind = tag == 1 ? "PCM" : tag == 3 ? "IEEE float" : tag == 0xFFFE ? "extensible" : "tag " + tag;
        return rate + " Hz, " + bits + "-bit, " + ch + " ch, " + kind;
    }
    static string Role(IMMDeviceEnumerator e, int flow, int role) {
        IMMDevice d; string id;
        if (e.GetDefaultAudioEndpoint(flow, role, out d) != 0) return "NONE";
        d.GetId(out id); return id;
    }
    public static string[] Describe() {
        IMMDeviceEnumerator e = (IMMDeviceEnumerator)new Enumerator();
        List<string> o = new List<string>();
        string[] flowName = new string[] { "PLAYBACK", "RECORDING" };
        for (int flow = 0; flow < 2; flow++) {
            string dc = Role(e, flow, 0), dm = Role(e, flow, 2);
            IMMDeviceCollection all; e.EnumAudioEndpoints(flow, 0x4, out all);   // DEVICE_STATE_NOTPRESENT: stale entries, counted only
            uint stale; all.GetCount(out stale);
            IMMDeviceCollection c; e.EnumAudioEndpoints(flow, 0xB, out c);   // active (1), disabled (2), unplugged (8)
            uint n; c.GetCount(out n);
            o.Add("== " + flowName[flow] + " endpoints: " + n + " (" + stale + " stale not-present entries omitted) ==");
            for (uint i = 0; i < n; i++) {
                IMMDevice d; c.Item(i, out d); string id; d.GetId(out id); int state; d.GetState(out state);
                IPropertyStore s; string name, fmt, oem, fx;
                try {
                    d.OpenPropertyStore(0, out s);
                    name = Prop(s, "a45c254e-df1c-4efd-8020-67d146a850e0", 14);
                    fmt = Format(Prop(s, "f19f064d-082c-4e27-bc73-6882a1bb8e4c", 0));
                    oem = Format(Prop(s, "e4870e26-3cc5-4cd2-ba46-ca0a9a70ed04", 3));
                    string dis = Prop(s, "1da5d803-d492-4edd-8c23-e0c0ffee7f0e", 5);
                    fx = dis == "0" ? "enabled (Disable_SysFx = 0)" : dis == "1" ? "DISABLED (Disable_SysFx = 1)" : dis.StartsWith("UNREADABLE (property not present") ? "UNREADABLE (no Disable_SysFx value stored for this endpoint; check Properties > Advanced by hand)" : dis;
                } catch (Exception ex) { name = fmt = oem = fx = "UNREADABLE (" + ex.Message + ")"; }
                string stateName = state == 1 ? "active" : state == 2 ? "disabled" : state == 4 ? "not present" : state == 8 ? "unplugged" : "state " + state;
                o.Add("name: " + name);
                o.Add("  id: " + id);
                o.Add("  state: " + stateName);
                o.Add("  default console: " + (id == dc ? "YES" : "no") + "   default communications: " + (id == dm ? "YES" : "no"));
                o.Add("  shared-mode device format (engine mix): " + fmt);
                o.Add("  enhancements (system effects) state: " + fx + "   [driver-specific effects, if any, may not show here]");
                o.Add("  driver OEM format property: " + oem);
            }
        }
        return o.ToArray();
    }
}
'@

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('Audio endpoint listing (read-only). Generated UTC: ' + [DateTime]::UtcNow.ToString('o'))
$lines.Add('Computer: ' + $env:COMPUTERNAME + '   PowerShell: ' + $PSVersionTable.PSVersion + '   Elevated: ' + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
foreach ($l in [Ep]::Describe()) { $lines.Add($l) }
$lines.Add('Note: volume level, mute and exclusive-mode options are not listed here.')
[IO.File]::WriteAllLines($OutFile, $lines, (New-Object Text.UTF8Encoding($false)))
Write-Host ('Wrote ' + $lines.Count + ' lines to ' + $OutFile)
