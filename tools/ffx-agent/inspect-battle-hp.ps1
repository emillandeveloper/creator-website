# Twitch Chaos / FFX HD Steam: READ-ONLY in-battle HP/MP layout probe.
# This does not write memory, send Twitch events or modify save data.
# Historical layout: Farplane FFX/Data/Battle.cs and FFX/Values/BattleEntity.cs.
# Battle offsets have NOT yet been validated on Leo's Steam executable.
$ErrorActionPreference = 'Stop'

$nativeCode = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class FfxBattleHpReader
{
    private const uint VM_READ = 0x0010;
    private const uint QUERY_INFORMATION = 0x0400;

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
        IntPtr handle = OpenProcess(VM_READ | QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open FFX for read-only inspection");
        try
        {
            byte[] buffer = new byte[length];
            UIntPtr bytesRead;
            bool ok = ReadProcessMemory(handle, new IntPtr(address), buffer,
                new UIntPtr((uint)length), out bytesRead);
            if (!ok || bytesRead.ToUInt64() != (ulong)length)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not read battle memory");
            return buffer;
        }
        finally { CloseHandle(handle); }
    }
}
'@

try {
    $gameProcesses = @(Get-Process -Name 'FFX' -ErrorAction SilentlyContinue)
    if ($gameProcesses.Count -ne 1) {
        throw "Open exactly one FFX.exe process. Found: $($gameProcesses.Count)."
    }
    $gameProcess = $gameProcesses[0]
    $baseAddress = $gameProcess.MainModule.BaseAddress.ToInt64()
    $gameHash = (Get-FileHash -LiteralPath $gameProcess.MainModule.FileName -Algorithm SHA256).Hash
    if (-not $gameHash.StartsWith('0537B2A1047F3266', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Different FFX.exe version. This historical battle layout may not apply.'
    }

    Add-Type -TypeDefinition $nativeCode -ErrorAction Stop

    # Farplane: module-relative battle party pointer +D334CC (32-bit).
    # Each party battle entity occupies 0xF90 bytes.
    $pointerBytes = [FfxBattleHpReader]::Read($gameProcess.Id, $baseAddress + 0xD334CC, 4)
    $battlePointer = [BitConverter]::ToUInt32($pointerBytes, 0)
    if ($battlePointer -lt 0x10000) {
        throw 'No active battle pointer found. Start an encounter and pause at the battle command menu.'
    }

    # From Farplane's BattleEntityData structure, original 32-bit offsets:
    #   hp_max 0x594, mp_max 0x598, hp_current 0x5D0, mp_current 0x5D4.
    # Out of battle we observed the Steam layout shifted by -4 bytes.
    # Do not presume the same shift in battle: show BOTH read-only candidates.
    $layouts = @(
        [PSCustomObject]@{ Name = 'Historico'; Delta = 0 },
        [PSCustomObject]@{ Name = 'Menos4'; Delta = -4 }
    )
    $rows = @()
    $plausibleCount = 0

    for ($slot = 0; $slot -lt 3; $slot++) {
        $entityAddress = [long]$battlePointer + ($slot * 0xF90)
        try {
            $entity = [FfxBattleHpReader]::Read($gameProcess.Id, $entityAddress, 0x600)
        } catch {
            if ($slot -eq 0) { throw }
            Write-Host ('Battle slot ' + $slot + ' unavailable: ' + $_.Exception.Message) -ForegroundColor Yellow
            continue
        }

        foreach ($layout in $layouts) {
            $delta = [int]$layout.Delta
            $hpMax = [BitConverter]::ToInt32($entity, 0x594 + $delta)
            $mpMax = [BitConverter]::ToInt32($entity, 0x598 + $delta)
            $hp = [BitConverter]::ToInt32($entity, 0x5D0 + $delta)
            $mp = [BitConverter]::ToInt32($entity, 0x5D4 + $delta)

            $plausible = ($hpMax -ge 1 -and $hpMax -le 99999 -and
                          $mpMax -ge 1 -and $mpMax -le 999 -and
                          $hp -ge 0 -and $hp -le $hpMax -and
                          $mp -ge 0 -and $mp -le $mpMax)
            if ($plausible) { $plausibleCount++ }

            $rows += [PSCustomObject]@{
                Slot = $slot
                Variante = $layout.Name
                HP_actual = $hp
                HP_maximo = $hpMax
                MP_actual = $mp
                MP_maximo = $mpMax
                Plausible = $(if ($plausible) { 'SI' } else { 'NO' })
            }
        }
    }

    Write-Host 'Twitch Chaos - FFX / read-only BATTLE HP and MP inspection' -ForegroundColor Cyan
    Write-Host ('FFX.exe PID: ' + $gameProcess.Id)
    Write-Host ('Executable SHA256: ' + $gameHash)
    Write-Host ('Battle party pointer: 0x{0:X8}' -f $battlePointer)
    $rows | Format-Table -AutoSize | Out-Host
    if ($plausibleCount -eq 0) {
        Write-Host 'No plausible party HP layout found. Do not use these offsets for writes.' -ForegroundColor Yellow
    }
    Write-Host 'READ ONLY: no game memory or save data was changed.' -ForegroundColor Green
    Write-Host 'Compare the possible HP/MP values with the combat screen; slot order is not yet verified.'
    Write-Host 'Do not attempt battle edits yet, even if one layout looks correct.' -ForegroundColor Yellow
} catch {
    Write-Host ('Inspection stopped: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'No game memory or save data was changed.'
    exit 1
}
