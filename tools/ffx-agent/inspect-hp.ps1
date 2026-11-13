# Twitch Chaos / FFX HD Steam: READ-ONLY character HP diagnostic.
# No writes, no Twitch requests, no save modifications.
# Layout: Farplane FFX/Offsets.cs and FFX/Data/Party.cs (historical Steam build).
$ErrorActionPreference = 'Stop'

$nativeCode = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class FfxHpReader
{
    private const uint PROCESS_VM_READ = 0x0010;
    private const uint PROCESS_QUERY_INFORMATION = 0x0400;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadProcessMemory(IntPtr handle, IntPtr address,
        [Out] byte[] buffer, UIntPtr length, out UIntPtr bytesRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    public static byte[] Read(int pid, long address, int length)
    {
        if (length < 1 || length > 4096) throw new ArgumentOutOfRangeException("length");
        IntPtr handle = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open FFX for reading");
        try
        {
            byte[] buffer = new byte[length];
            UIntPtr bytesRead;
            bool success = ReadProcessMemory(handle, new IntPtr(address), buffer,
                new UIntPtr((uint)length), out bytesRead);
            if (!success || bytesRead.ToUInt64() != (ulong)length)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not read HP memory");
            return buffer;
        }
        finally { CloseHandle(handle); }
    }
}
'@

try {
    $gameProcesses = @(Get-Process -Name 'FFX' -ErrorAction SilentlyContinue)
    if ($gameProcesses.Count -ne 1) {
        throw "Open exactly one copy of FFX.exe. Found: $($gameProcesses.Count)."
    }
    $gameProcess = $gameProcesses[0]
    $exePath = $gameProcess.MainModule.FileName
    $baseAddress = $gameProcess.MainModule.BaseAddress.ToInt64()
    $gameHash = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash

    # This prefix matched Leo's FFX.exe in the previously verified inventory test.
    if (-not $gameHash.StartsWith('0537B2A1047F3266', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Different FFX.exe version. No HP assumptions should be made yet.'
    }

    Add-Type -TypeDefinition $nativeCode -ErrorAction Stop

    # Farplane: PartyList = FFX.exe + D307E8; PartyStatsBase = FFX.exe + D32060.
    # PartyMember is 0x94 bytes; CurrentHp at +0x1C, CurrentHpMax at +0x24.
    $partyIds = [FfxHpReader]::Read($gameProcess.Id, $baseAddress + 0xD307E8, 8)
    $memberSize = 0x94
    $members = [FfxHpReader]::Read($gameProcess.Id, $baseAddress + 0xD32060, 7 * $memberSize)
    $names = @('Tidus', 'Yuna', 'Auron', 'Kimahri', 'Wakka', 'Lulu', 'Rikku')

    foreach ($partyId in $partyIds) {
        if ($partyId -ne 0xFF -and $partyId -gt 17) {
            throw ('Invalid party character ID: ' + $partyId + '. No changes made.')
        }
    }

    $activeCount = 0
    $rows = @()
    for ($i = 0; $i -lt $names.Length; $i++) {
        $start = $i * $memberSize
        $hp = [BitConverter]::ToInt32($members, $start + 0x1C)
        $hpMax = [BitConverter]::ToInt32($members, $start + 0x24)
        $active = $partyIds -contains [byte]$i

        if ($hpMax -eq 0 -and $hp -eq 0 -and -not $active) { continue }
        if ($hpMax -lt 1 -or $hpMax -gt 99999 -or $hp -lt 0 -or $hp -gt $hpMax) {
            throw ('HP fuera del rango esperado para ' + $names[$i] + ': ' + $hp + '/' + $hpMax + '. No changes made.')
        }
        if ($active) { $activeCount++ }
        $rows += [PSCustomObject]@{
            Personaje = $names[$i]
            HP_actual = $hp
            HP_maximo = $hpMax
            En_grupo = $(if ($active) { 'SI' } else { 'NO' })
        }
    }
    if ($activeCount -lt 1) {
        throw 'No recognized playable character appears in the current party. No conclusions can be drawn.'
    }

    Write-Host 'Twitch Chaos - FFX HD / read-only HP inspection' -ForegroundColor Cyan
    Write-Host ('FFX.exe PID: ' + $gameProcess.Id)
    Write-Host ('Executable SHA256: ' + $gameHash)
    $rows | Format-Table -AutoSize | Out-Host
    Write-Host 'READ ONLY: no game memory or save data was changed.' -ForegroundColor Green
    Write-Host 'Compare the HP of the characters currently in your party with the in-game menu.'
    Write-Host 'Outside combat is best for this test; combat uses a separate HP structure.' -ForegroundColor Yellow
} catch {
    Write-Host ('Inspection stopped: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'No game memory or save data was changed.'
    exit 1
}
