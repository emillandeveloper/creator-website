# Twitch Chaos / FFX HD Steam - ONE manual HP edit: Wakka +100 HP.
# For the exact Steam executable and read-only stats verified on Nov 13, 2026.
# Does not connect to Twitch, trigger automatically or save the game.
# Use only outside combat, on a disposable save in a different slot.
$ErrorActionPreference = 'Stop'

$nativeCode = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class FfxWakkaHeal
{
    private const uint VM_READ = 0x0010;
    private const uint VM_WRITE = 0x0020;
    private const uint VM_OPERATION = 0x0008;
    private const uint QUERY_INFORMATION = 0x0400;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadProcessMemory(IntPtr handle, IntPtr address,
        [Out] byte[] buffer, UIntPtr length, out UIntPtr bytesRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WriteProcessMemory(IntPtr handle, IntPtr address,
        byte[] buffer, UIntPtr length, out UIntPtr bytesWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    private static byte[] ReadBytes(IntPtr handle, long address, int length)
    {
        if (length < 1 || length > 4096) throw new ArgumentOutOfRangeException("length");
        byte[] buffer = new byte[length];
        UIntPtr bytesRead;
        bool ok = ReadProcessMemory(handle, new IntPtr(address), buffer,
            new UIntPtr((uint)length), out bytesRead);
        if (!ok || bytesRead.ToUInt64() != (ulong)length)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not read Wakka stats");
        return buffer;
    }

    public static byte[] Read(int pid, long address, int length)
    {
        IntPtr handle = OpenProcess(VM_READ | QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open FFX for reading");
        try { return ReadBytes(handle, address, length); }
        finally { CloseHandle(handle); }
    }

    // statsAddress points to Wakka's CurrentHp (not to the start of the member).
    // CurrentMp, CurrentHpMax and CurrentMpMax follow at +4, +8 and +12.
    public static int HealOnce(int pid, long statsAddress,
        int expectedHp, int expectedMp, int expectedHpMax, int expectedMpMax)
    {
        // Lock this first manual test to the exact known screenshot state.
        if (expectedHp != 9999 || expectedHpMax != 99999)
            throw new InvalidOperationException("Wakka HP does not match the verified test state");

        IntPtr handle = OpenProcess(VM_READ | VM_WRITE | VM_OPERATION | QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open FFX for the four-byte edit");

        try
        {
            byte[] before = ReadBytes(handle, statsAddress, 16);
            if (BitConverter.ToInt32(before, 0) != expectedHp ||
                BitConverter.ToInt32(before, 4) != expectedMp ||
                BitConverter.ToInt32(before, 8) != expectedHpMax ||
                BitConverter.ToInt32(before, 12) != expectedMpMax)
                throw new InvalidOperationException("Wakka stats changed during confirmation; nothing written");

            int healedHp = checked(expectedHp + 100);
            if (healedHp > expectedHpMax)
                throw new InvalidOperationException("Heal would exceed maximum HP; nothing written");

            byte[] updated = BitConverter.GetBytes(healedHp);
            UIntPtr bytesWritten;
            bool ok = WriteProcessMemory(handle, new IntPtr(statsAddress), updated,
                new UIntPtr(4), out bytesWritten);
            if (!ok || bytesWritten.ToUInt64() != 4)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Four-byte edit could not be confirmed");

            byte[] after = ReadBytes(handle, statsAddress, 16);
            if (BitConverter.ToInt32(after, 0) != healedHp ||
                BitConverter.ToInt32(after, 4) != expectedMp ||
                BitConverter.ToInt32(after, 8) != expectedHpMax ||
                BitConverter.ToInt32(after, 12) != expectedMpMax)
                throw new InvalidOperationException("Unexpected read-back: inspect the game before doing anything else");
            return healedHp;
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
        throw 'Unknown FFX.exe version. No changes made.'
    }

    Add-Type -TypeDefinition $nativeCode -ErrorAction Stop

    # PartyList: +D307E8. PartyStatsBase: +D32060. Member size: 0x94.
    # Wakka is character index 4; HP fields were verified against the FFX menu.
    $partyListAddress = $baseAddress + 0xD307E8
    $party = [FfxWakkaHeal]::Read($gameProcess.Id, $partyListAddress, 8)
    foreach ($id in $party) {
        if ($id -ne 0xFF -and $id -gt 17) { throw 'Unrecognized party data. No changes made.' }
    }
    if (-not ($party -contains [byte]4)) { throw 'Wakka is not in the current party. No changes made.' }

    $statsAddress = $baseAddress + 0xD32060 + (4 * 0x94) + 0x18
    $before = [FfxWakkaHeal]::Read($gameProcess.Id, $statsAddress, 16)
    $hp = [BitConverter]::ToInt32($before, 0)
    $mp = [BitConverter]::ToInt32($before, 4)
    $hpMax = [BitConverter]::ToInt32($before, 8)
    $mpMax = [BitConverter]::ToInt32($before, 12)

    if ($hp -ne 9999 -or $hpMax -ne 99999) {
        throw ('This test requires Wakka at exactly 9999/99999 HP. Detected: ' + $hp + '/' + $hpMax)
    }
    if ($mpMax -lt 1 -or $mpMax -gt 999 -or $mp -lt 0 -or $mp -gt $mpMax) {
        throw ('Unrecognized Wakka MP: ' + $mp + '/' + $mpMax + '. No changes made.')
    }

    Write-Host 'Twitch Chaos - MANUAL Wakka +100 HP test' -ForegroundColor Cyan
    Write-Host ('FFX.exe PID: ' + $gameProcess.Id)
    Write-Host ('Wakka HP detected: ' + $hp + ' / ' + $hpMax)
    Write-Host ('Wakka MP detected: ' + $mp + ' / ' + $mpMax)
    Write-Host 'Proposal: Wakka HP 9999 -> 10099 (MP unchanged).' -ForegroundColor Yellow
    Write-Host 'IMPORTANT: back up your game in ANOTHER save slot. Stay OUTSIDE combat.' -ForegroundColor Yellow
    Write-Host 'The game is not saved by this script. Nothing changes until you confirm.'
    $confirmation = Read-Host 'Type CURAR to change exactly four HP bytes; anything else cancels'
    if ($confirmation -cne 'CURAR') {
        Write-Host 'Cancelled. No changes made.' -ForegroundColor Yellow
        exit 0
    }

    if ($gameProcess.HasExited) { throw 'FFX was closed before the edit. No changes made.' }
    $partyAgain = [FfxWakkaHeal]::Read($gameProcess.Id, $partyListAddress, 8)
    if ([Convert]::ToBase64String($party) -cne [Convert]::ToBase64String($partyAgain)) {
        throw 'Party composition changed during confirmation. No changes made.'
    }

    $after = [FfxWakkaHeal]::HealOnce($gameProcess.Id, $statsAddress, $hp, $mp, $hpMax, $mpMax)
    Write-Host ('OK - Wakka HP: ' + $hp + ' -> ' + $after + ' (MP remains ' + $mp + ')') -ForegroundColor Green
    Write-Host 'Close and reopen the FFX menu to check the new value.'
    Write-Host 'Do not save this test until you have checked the result.' -ForegroundColor Yellow
} catch {
    Write-Host ('Stopped: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'If an error appeared AFTER confirmation, inspect the game before retrying.'
    exit 1
}
