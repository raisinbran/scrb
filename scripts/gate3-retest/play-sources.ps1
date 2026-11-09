# Plays the two assembled r3 source WAVs for the Gate 3 diagnostic retest (Windows PowerShell 5.1).
# Microphone WAV -> CABLE Input only. System WAV -> the app's loopback endpoint (default eConsole render device).
# Default mode is a dry run: it resolves and verifies everything and plays nothing. Real playback needs -Play,
# -OwnerApprovedLongTest, and (when the system route is the built-in speakers) -HeadphonesWorn.
# -SelfTest runs the hardware-free logic checks and prints JSON.
[CmdletBinding()]
param(
    [string]$MicrophoneWav,
    [string]$MeetingWav,
    [string]$ExpectedMicrophoneSha256,   # SHA-256 of the raw file bytes (manifest hashing-method table)
    [string]$ExpectedMeetingSha256,
    [string]$OutFolder,                  # new folder; refused if it exists
    [string]$RecordingReadyFile,         # written by the step that confirms the native Start ack
    [double]$MaxStartDelaySeconds = 6.0, # lead-in marker interval is 0-10 s; the WAV's beeps end 2.2 s in
    [double]$ReadyTimeoutSeconds = 120,
    [switch]$Play,
    [switch]$OwnerApprovedLongTest,
    [switch]$HeadphonesWorn,
    [switch]$SelfTest
)
$ErrorActionPreference = 'Stop'

# ---------- pure logic (no hardware; covered by -SelfTest and test_play_sources.py) ----------
function Get-WavInfo([byte[]]$Bytes) {
    if ($Bytes.Length -lt 44) { throw 'WAV too short' }
    if ([Text.Encoding]::ASCII.GetString($Bytes, 0, 4) -ne 'RIFF' -or [Text.Encoding]::ASCII.GetString($Bytes, 8, 4) -ne 'WAVE') { throw 'Not a RIFF/WAVE file' }
    $pos = 12; $fmt = $null; $dataLen = -1
    while ($pos + 8 -le $Bytes.Length) {
        $id = [Text.Encoding]::ASCII.GetString($Bytes, $pos, 4)
        $len = [BitConverter]::ToUInt32($Bytes, $pos + 4)
        if ($id -eq 'fmt ') {
            $fmt = @{ Tag = [BitConverter]::ToUInt16($Bytes, $pos + 8); Channels = [BitConverter]::ToUInt16($Bytes, $pos + 10)
                      Rate = [BitConverter]::ToUInt32($Bytes, $pos + 12); Bits = [BitConverter]::ToUInt16($Bytes, $pos + 22) }
        } elseif ($id -eq 'data') { $dataLen = [int]$len; $dataPos = $pos + 8; break }
        $pos += 8 + $len + ($len % 2)
    }
    if ($null -eq $fmt -or $dataLen -lt 0) { throw 'Missing fmt or data chunk' }
    if ($fmt.Tag -ne 1 -or $fmt.Channels -ne 1 -or $fmt.Rate -ne 24000 -or $fmt.Bits -ne 16) {
        throw ('Unexpected format tag={0} channels={1} rate={2} bits={3}; expected PCM mono 24000 Hz 16-bit' -f $fmt.Tag, $fmt.Channels, $fmt.Rate, $fmt.Bits)
    }
    if ($dataPos + $dataLen -gt $Bytes.Length) { throw 'data chunk longer than file' }
    return @{ DataOffset = $dataPos; DataLength = $dataLen; Samples = $dataLen / 2; Seconds = $dataLen / 2 / 24000.0 }
}

function Select-MicrophoneDevice($Devices) {
    $hits = @($Devices | Where-Object { $_.Name -like 'CABLE Input*' -and $_.Name -notlike '*16ch*' })
    if ($hits.Count -ne 1) { throw ('Expected exactly one playback device named CABLE Input (not 16ch); found {0}' -f $hits.Count) }
    return $hits[0]
}

function Resolve-SystemDevice($Devices, [string]$DefaultRenderEndpointId) {
    if ([string]::IsNullOrEmpty($DefaultRenderEndpointId)) { throw 'No default render endpoint ID' }
    $hits = @($Devices | Where-Object { $_.EndpointId -eq $DefaultRenderEndpointId })
    if ($hits.Count -ne 1) { throw 'The default eConsole render endpoint is not exactly one wave-out device; refusing (loopback and playback would differ)' }
    if ($hits[0].Name -like 'CABLE*') { throw ('A CABLE device is the default playback device ({0}); loopback would capture the microphone WAV. Refusing.' -f $hits[0].Name) }
    return $hits[0]
}

function Assert-Hash([string]$Label, [string]$Actual, [string]$Expected) {
    if ([string]::IsNullOrEmpty($Expected)) { throw ('{0}: expected SHA-256 is required' -f $Label) }
    if ($Actual.ToLowerInvariant() -ne $Expected.ToLowerInvariant()) { throw ('{0}: SHA-256 mismatch' -f $Label) }
}

function Test-StartDelay([double]$ReadyToStartSeconds, [double]$MaxSeconds) {
    if ($ReadyToStartSeconds -lt 0 -or $ReadyToStartSeconds -gt $MaxSeconds) {
        throw ('Playback would start {0:N2} s after readiness; limit {1:N2} s (lead-in marker would be missed). Aborting before playback.' -f $ReadyToStartSeconds, $MaxSeconds)
    }
}

function Test-PlayGuards([bool]$Approved, [bool]$Headphones, $SystemDevice) {
    if (-not $Approved) { throw 'Real playback needs -OwnerApprovedLongTest (explicit owner approval of the run length)' }
    if ($SystemDevice.Name -like 'Speakers*' -and -not $Headphones) { throw 'System route is the built-in speakers; supply -HeadphonesWorn only if headphones are on that output' }
}

if ($SelfTest) {
    $dev = @(
        [pscustomobject]@{ Index = 0; Name = 'CABLE Input (VB-Audio Virtual C'; EndpointId = '{0.0.0.00000000}.{A}' },
        [pscustomobject]@{ Index = 1; Name = 'CABLE In 16ch (VB-Audio Virtual'; EndpointId = '{0.0.0.00000000}.{B}' },
        [pscustomobject]@{ Index = 2; Name = 'Speakers (2- Realtek(R) Audio)'; EndpointId = '{0.0.0.00000000}.{C}' })
    $r = [ordered]@{}
    $r.mic_selected = (Select-MicrophoneDevice $dev).Name
    function Expect-Throw([scriptblock]$Block) { try { & $Block; return $false } catch { return $true } }
    $r.mic_refuses_only16ch = Expect-Throw { Select-MicrophoneDevice @($dev[1], $dev[2]) }
    $r.mic_refuses_duplicate = Expect-Throw { Select-MicrophoneDevice @($dev[0], $dev[0]) }
    $r.system_selected = (Resolve-SystemDevice $dev '{0.0.0.00000000}.{C}').Name
    $r.system_refuses_cable_default = Expect-Throw { Resolve-SystemDevice $dev '{0.0.0.00000000}.{A}' }
    $r.system_refuses_16ch_default = Expect-Throw { Resolve-SystemDevice $dev '{0.0.0.00000000}.{B}' }
    $r.system_refuses_unmapped = Expect-Throw { Resolve-SystemDevice $dev '{0.0.0.00000000}.{Z}' }
    $r.system_refuses_empty = Expect-Throw { Resolve-SystemDevice $dev '' }
    $r.hash_mismatch_refused = Expect-Throw { Assert-Hash 'x' 'aa' 'bb' }
    $r.hash_missing_refused = Expect-Throw { Assert-Hash 'x' 'aa' '' }
    $r.hash_match_ok = -not (Expect-Throw { Assert-Hash 'x' 'AA' 'aa' })
    $r.late_start_refused = Expect-Throw { Test-StartDelay 7.5 6.0 }
    $r.timely_start_ok = -not (Expect-Throw { Test-StartDelay 3.0 6.0 })
    $r.play_needs_approval = Expect-Throw { Test-PlayGuards $false $true $dev[2] }
    $r.speakers_need_headphones = Expect-Throw { Test-PlayGuards $true $false $dev[2] }
    $r.play_guards_ok = -not (Expect-Throw { Test-PlayGuards $true $true $dev[2] })
    $good = New-Object byte[] 48; [Text.Encoding]::ASCII.GetBytes('RIFF').CopyTo($good, 0); [BitConverter]::GetBytes([uint32]40).CopyTo($good, 4)
    [Text.Encoding]::ASCII.GetBytes('WAVEfmt ').CopyTo($good, 8); [BitConverter]::GetBytes([uint32]16).CopyTo($good, 16)
    [BitConverter]::GetBytes([uint16]1).CopyTo($good, 20); [BitConverter]::GetBytes([uint16]1).CopyTo($good, 22)
    [BitConverter]::GetBytes([uint32]24000).CopyTo($good, 24); [BitConverter]::GetBytes([uint32]48000).CopyTo($good, 28)
    [BitConverter]::GetBytes([uint16]2).CopyTo($good, 32); [BitConverter]::GetBytes([uint16]16).CopyTo($good, 34)
    [Text.Encoding]::ASCII.GetBytes('data').CopyTo($good, 36); [BitConverter]::GetBytes([uint32]4).CopyTo($good, 40)
    $r.wav_samples = (Get-WavInfo $good).Samples
    $bad = $good.Clone(); [BitConverter]::GetBytes([uint32]48000).CopyTo($bad, 24)
    $r.wav_wrong_rate_refused = Expect-Throw { Get-WavInfo $bad }
    $r | ConvertTo-Json -Compress
    return
}

# ---------- hardware layer ----------
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class Mm {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct WAVEOUTCAPS { public ushort wMid; public ushort wPid; public uint vDriverVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szPname; public uint dwFormats; public ushort wChannels; public ushort wReserved1; public uint dwSupport; }
    [StructLayout(LayoutKind.Sequential)]
    public struct WAVEFORMATEX { public ushort wFormatTag; public ushort nChannels; public uint nSamplesPerSec; public uint nAvgBytesPerSec; public ushort nBlockAlign; public ushort wBitsPerSample; public ushort cbSize; }
    [StructLayout(LayoutKind.Sequential)]
    public struct WAVEHDR { public IntPtr lpData; public uint dwBufferLength; public uint dwBytesRecorded; public IntPtr dwUser; public uint dwFlags; public uint dwLoops; public IntPtr lpNext; public IntPtr reserved; }
    [DllImport("winmm.dll")] public static extern uint waveOutGetNumDevs();
    [DllImport("winmm.dll", CharSet = CharSet.Auto)] public static extern uint waveOutGetDevCaps(IntPtr id, ref WAVEOUTCAPS caps, uint size);
    [DllImport("winmm.dll")] public static extern uint waveOutOpen(out IntPtr h, IntPtr id, ref WAVEFORMATEX fmt, IntPtr cb, IntPtr inst, uint flags);
    [DllImport("winmm.dll")] public static extern uint waveOutOpen(IntPtr h, IntPtr id, ref WAVEFORMATEX fmt, IntPtr cb, IntPtr inst, uint flags);
    [DllImport("winmm.dll")] public static extern uint waveOutPrepareHeader(IntPtr h, IntPtr hdr, uint size);
    [DllImport("winmm.dll")] public static extern uint waveOutUnprepareHeader(IntPtr h, IntPtr hdr, uint size);
    [DllImport("winmm.dll")] public static extern uint waveOutWrite(IntPtr h, IntPtr hdr, uint size);
    [DllImport("winmm.dll")] public static extern uint waveOutPause(IntPtr h);
    [DllImport("winmm.dll")] public static extern uint waveOutRestart(IntPtr h);
    [DllImport("winmm.dll")] public static extern uint waveOutReset(IntPtr h);
    [DllImport("winmm.dll")] public static extern uint waveOutClose(IntPtr h);
    [DllImport("winmm.dll")] public static extern uint waveOutMessage(IntPtr h, uint msg, IntPtr dw1, IntPtr dw2);

    public static string EndpointId(int index) {
        IntPtr dev = new IntPtr(index);
        IntPtr sizePtr = Marshal.AllocHGlobal(4);
        try {
            if (waveOutMessage(dev, 0x0812, sizePtr, IntPtr.Zero) != 0) return null;
            int bytes = Marshal.ReadInt32(sizePtr);
            IntPtr buf = Marshal.AllocHGlobal(bytes);
            try {
                if (waveOutMessage(dev, 0x0811, buf, new IntPtr(bytes)) != 0) return null;
                return Marshal.PtrToStringUni(buf);
            } finally { Marshal.FreeHGlobal(buf); }
        } finally { Marshal.FreeHGlobal(sizePtr); }
    }
    public static string[][] Devices() {
        List<string[]> list = new List<string[]>();
        uint n = waveOutGetNumDevs();
        for (int i = 0; i < n; i++) {
            WAVEOUTCAPS caps = new WAVEOUTCAPS();
            waveOutGetDevCaps(new IntPtr(i), ref caps, (uint)Marshal.SizeOf(caps));
            list.Add(new string[] { i.ToString(), caps.szPname, EndpointId(i) });
        }
        return list.ToArray();
    }
    public static uint QueryFormat(int index, int rate) {
        WAVEFORMATEX f = new WAVEFORMATEX();
        f.wFormatTag = 1; f.nChannels = 1; f.nSamplesPerSec = (uint)rate; f.wBitsPerSample = 16; f.nBlockAlign = 2; f.nAvgBytesPerSec = (uint)(rate * 2);
        return waveOutOpen(IntPtr.Zero, new IntPtr(index), ref f, IntPtr.Zero, IntPtr.Zero, 1);  // WAVE_FORMAT_QUERY: plays nothing
    }

    public class Channel {
        public IntPtr Handle; public List<IntPtr> Headers = new List<IntPtr>(); public List<IntPtr> Blocks = new List<IntPtr>();
        public int Count;
    }
    public static Channel Open(int index, byte[] pcm, int offset, int length, int rate) {
        WAVEFORMATEX f = new WAVEFORMATEX();
        f.wFormatTag = 1; f.nChannels = 1; f.nSamplesPerSec = (uint)rate; f.wBitsPerSample = 16; f.nBlockAlign = 2; f.nAvgBytesPerSec = (uint)(rate * 2);
        Channel c = new Channel();
        uint rc = waveOutOpen(out c.Handle, new IntPtr(index), ref f, IntPtr.Zero, IntPtr.Zero, 0);
        if (rc != 0) throw new InvalidOperationException("waveOutOpen failed rc=" + rc);
        waveOutPause(c.Handle);
        int chunk = rate * 2;  // one second per header
        for (int pos = 0; pos < length; pos += chunk) {
            int n = Math.Min(chunk, length - pos);
            IntPtr block = Marshal.AllocHGlobal(n);
            Marshal.Copy(pcm, offset + pos, block, n);
            WAVEHDR h = new WAVEHDR(); h.lpData = block; h.dwBufferLength = (uint)n;
            IntPtr hp = Marshal.AllocHGlobal(Marshal.SizeOf(h));
            Marshal.StructureToPtr(h, hp, false);
            if (waveOutPrepareHeader(c.Handle, hp, (uint)Marshal.SizeOf(h)) != 0) throw new InvalidOperationException("prepare failed");
            if (waveOutWrite(c.Handle, hp, (uint)Marshal.SizeOf(h)) != 0) throw new InvalidOperationException("write failed");
            c.Headers.Add(hp); c.Blocks.Add(block); c.Count++;
        }
        return c;
    }
    public static bool Done(Channel c) {
        IntPtr last = c.Headers[c.Headers.Count - 1];
        WAVEHDR h = (WAVEHDR)Marshal.PtrToStructure(last, typeof(WAVEHDR));
        return (h.dwFlags & 1) != 0;  // WHDR_DONE
    }
    public static void Close(Channel c) {
        if (c == null) return;
        waveOutReset(c.Handle);
        foreach (IntPtr hp in c.Headers) { waveOutUnprepareHeader(c.Handle, hp, (uint)Marshal.SizeOf(typeof(WAVEHDR))); Marshal.FreeHGlobal(hp); }
        foreach (IntPtr b in c.Blocks) Marshal.FreeHGlobal(b);
        waveOutClose(c.Handle);
    }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate(ref Guid iid, int ctx, IntPtr p, out IntPtr iface);
        int OpenPropertyStore(int access, out IntPtr store);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    }
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
    public static string DefaultRenderConsoleId() {   // eRender = 0, eConsole = 0
        IMMDeviceEnumerator e = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
        IMMDevice d; string id;
        if (e.GetDefaultAudioEndpoint(0, 0, out d) != 0) return null;
        d.GetId(out id);
        return id;
    }
}
'@

function Get-Sha256([string]$Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    $fs = [IO.File]::OpenRead($Path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($fs)) -replace '-', '').ToLowerInvariant() } finally { $fs.Dispose(); $sha.Dispose() }
}
function Get-NowStamp { [pscustomobject]@{ qpc_ticks = [Diagnostics.Stopwatch]::GetTimestamp(); utc = [DateTime]::UtcNow.ToString('o') } }
function Write-LogLine($Event, $Data) {
    $line = (@{ event = $Event; stamp = (Get-NowStamp); data = $Data } | ConvertTo-Json -Compress -Depth 6)
    [IO.File]::AppendAllText($script:LogPath, $line + "`n", (New-Object Text.UTF8Encoding($false)))
}

foreach ($n in 'MicrophoneWav', 'MeetingWav', 'OutFolder') { if (-not (Get-Variable $n -ValueOnly)) { throw ('-{0} is required' -f $n) } }
if (Test-Path -LiteralPath $OutFolder) { throw 'OutFolder already exists; refusing to reuse it' }

$devices = @([Mm]::Devices() | ForEach-Object { [pscustomobject]@{ Index = [int]$_[0]; Name = $_[1]; EndpointId = $_[2] } })
$mic = Select-MicrophoneDevice $devices
$defaultId = [Mm]::DefaultRenderConsoleId()
$system = Resolve-SystemDevice $devices $defaultId
if ($mic.Index -eq $system.Index) { throw 'Microphone and system routes resolve to the same device' }

$micBytes = [IO.File]::ReadAllBytes($MicrophoneWav); $meetBytes = [IO.File]::ReadAllBytes($MeetingWav)
Assert-Hash 'microphone WAV' (Get-Sha256 $MicrophoneWav) $ExpectedMicrophoneSha256
Assert-Hash 'meeting WAV' (Get-Sha256 $MeetingWav) $ExpectedMeetingSha256
$micInfo = Get-WavInfo $micBytes; $meetInfo = Get-WavInfo $meetBytes
$micQuery = [Mm]::QueryFormat($mic.Index, 24000); $sysQuery = [Mm]::QueryFormat($system.Index, 24000)
if ($micQuery -ne 0 -or $sysQuery -ne 0) { throw ('wave-out rejected 24 kHz mono PCM16 (mic rc={0}, system rc={1}); do NOT alter or convert the source files without owner approval' -f $micQuery, $sysQuery) }

Write-Host ('Microphone WAV  -> wave-out device [{0}] {1}  endpoint {2}' -f $mic.Index, $mic.Name, $mic.EndpointId)
Write-Host ('System WAV      -> wave-out device [{0}] {1}  endpoint {2}  (= default eConsole render = loopback endpoint)' -f $system.Index, $system.Name, $system.EndpointId)
Write-Host 'OWNER-CONFIRM: the app microphone must be CABLE Output; this script cannot read the app setting.'
Write-Host ('Format query 24000 Hz mono PCM16: microphone rc={0}, system rc={1} (0 = accepted; nothing was played)' -f $micQuery, $sysQuery)
if (-not $Play) { Write-Host 'Dry run complete. Nothing was played and no folder was created.'; return }

Test-PlayGuards $OwnerApprovedLongTest.IsPresent $HeadphonesWorn.IsPresent $system
if (-not $RecordingReadyFile) { throw '-RecordingReadyFile is required for real playback' }
$null = New-Item -ItemType Directory -Path $OutFolder
$script:LogPath = Join-Path $OutFolder 'play-sources-log.jsonl'
$scriptStart = [DateTime]::UtcNow
Write-LogLine 'devices' @{ microphone = $mic; system = $system; default_render_endpoint = $defaultId; stopwatch_frequency = [Diagnostics.Stopwatch]::Frequency }
Write-LogLine 'files' @{ microphone_sha256 = $ExpectedMicrophoneSha256; meeting_sha256 = $ExpectedMeetingSha256; microphone_seconds = $micInfo.Seconds; meeting_seconds = $meetInfo.Seconds }

$deadline = $scriptStart.AddSeconds($ReadyTimeoutSeconds)
while (-not (Test-Path -LiteralPath $RecordingReadyFile) -or (Get-Item -LiteralPath $RecordingReadyFile).LastWriteTimeUtc -lt $scriptStart) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Recording readiness file did not appear in time; nothing was played' }
    Start-Sleep -Milliseconds 100
}
$readyUtc = (Get-Item -LiteralPath $RecordingReadyFile).LastWriteTimeUtc
Write-LogLine 'recording_ready' @{ ready_file_utc = $readyUtc.ToString('o') }

$micCh = $null; $sysCh = $null
try {
    $micCh = [Mm]::Open($mic.Index, $micBytes, $micInfo.DataOffset, $micInfo.DataLength, 24000)
    $sysCh = [Mm]::Open($system.Index, $meetBytes, $meetInfo.DataOffset, $meetInfo.DataLength, 24000)
    Test-StartDelay (([DateTime]::UtcNow - $readyUtc).TotalSeconds) $MaxStartDelaySeconds
    $a = Get-NowStamp; [void][Mm]::waveOutRestart($micCh.Handle); $b = Get-NowStamp
    Write-LogLine 'microphone_start' @{ before = $a; after = $b; device = $mic.Name }
    $a = Get-NowStamp; [void][Mm]::waveOutRestart($sysCh.Handle); $b = Get-NowStamp
    Write-LogLine 'system_start' @{ before = $a; after = $b; device = $system.Name }
    while (-not ([Mm]::Done($micCh) -and [Mm]::Done($sysCh))) { Start-Sleep -Milliseconds 250 }
    Write-LogLine 'playback_done' @{}
} finally {
    [Mm]::Close($micCh); [Mm]::Close($sysCh)
}
Write-Host 'Playback finished. Log:' $script:LogPath
