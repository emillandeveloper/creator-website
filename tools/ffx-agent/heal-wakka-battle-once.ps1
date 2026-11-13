# Twitch Chaos - MANUAL battle test, Wakka +100 HP ONLY.
# This writes 4 bytes to the verified Wakka battle entity after explicit consent.
# Not connected to Twitch; does not save the game. Keep the battle paused at a menu.
# Intentionally locked to Leo's one observed battle state (Nov 13, 2026).
$ErrorActionPreference = 'Stop'

$nativeCode = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class FfxBattleWakkaMemory
{
    private const uint VM_READ = 0x0010;
    private const uint VM_WRITE = 0x0020;
    private const uint VM_OPERATION = 0x0008;
    private const uint QUERY_INFORMATION = 0x0400;
    private const int PAGE_SIZE = 0x1000;

    // Original Farplane FFX_BattlePointerParty signature (four wildcard bytes).
    private static readonly byte[] BattleSignature = {
        0x83, 0xF8, 0x1F, 0x7D, 0x0E, 0x69, 0xC0, 0x90, 0x0F, 0x00,
        0x00, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00, 0x5D, 0xC3
    };

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
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot read FFX battle memory");
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

    public static long FindBattlePointerStorage(int pid, long moduleBase, int moduleSize)
    {
        if (moduleBase < 0x10000 || moduleSize < PAGE_SIZE || moduleSize > 128 * 1024 * 1024)
            throw new ArgumentOutOfRangeException("moduleSize", "Unexpected FFX module layout");

        IntPtr handle = OpenProcess(VM_READ | QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open FFX for pointer inspection");
        try
        {
            byte[] buffer = new byte[PAGE_SIZE + BattleSignature.Length - 1];
            for (int offset = 0; offset < moduleSize; offset += PAGE_SIZE)
            {
                int length = Math.Min(buffer.Length, moduleSize - offset);
                UIntPtr bytesRead;
                bool ok = ReadProcessMemory(handle, new IntPtr(moduleBase + offset), buffer,
                    new UIntPtr((uint)length), out bytesRead);
                if (!ok || bytesRead.ToUInt64() != (ulong)length)
                {
                    length = Math.Min(PAGE_SIZE, moduleSize - offset);
                    ok = ReadProcessMemory(handle, new IntPtr(moduleBase + offset), buffer,
                        new UIntPtr((uint)length), out bytesRead);
                    if (!ok || bytesRead.ToUInt64() != (ulong)length) continue;
                }

                for (int i = 0; i <= length - BattleSignature.Length; i++)
                {
                    bool matched = true;
                    for (int k = 0; k < BattleSignature.Length; k++)
                    {
                        if (k >= 13 && k <= 16) continue;
                        if (buffer[i + k] != BattleSignature[k]) { matched = false; break; }
                    }
                    if (!matched) continue;
                    uint address = BitConverter.ToUInt32(buffer, i + 13);
                    if (address >= 0x10000) return (long)address;
                }
            }
            return 0;
        }
        finally { CloseHandle(handle); }
    }

    public static int HealWakkaOnce(int pid, long pointerStorage, uint battlePointer,
        int expectedHp, int expectedMp, int expectedHpMax, int expectedMpMax)
    {
        // This test cannot target an arbitrary character, amount, or battle state.
        if (expectedHp != 10076 || expectedMp != 969 ||
            expectedHpMax != 99999 || expectedMpMax != 999)
            throw new InvalidOperationException("Wakka stats do not match the confirmed one-shot test");

        IntPtr handle = OpenProcess(VM_READ | VM_WRITE | VM_OPERATION | QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open FFX for four-byte edit");
        try
        {
            if (BitConverter.ToUInt32(ReadBytes(handle, pointerStorage, 4), 0) != battlePointer)
                throw new InvalidOperationException("Battle pointer changed; nothing written");

            long wakkaEntity = (long)battlePointer + (4 * 0xF90);
            byte[] maximums = ReadBytes(handle, wakkaEntity + 0x594, 8);
            byte[] current = ReadBytes(handle, wakkaEntity + 0x5D0, 8);
            if (BitConverter.ToInt32(maximums, 0) != expectedHpMax ||
                BitConverter.ToInt32(maximums, 4) != expectedMpMax ||
                BitConverter.ToInt32(current, 0) != expectedHp ||
                BitConverter.ToInt32(current, 4) != expectedMp)
                throw new InvalidOperationException("Wakka stats changed during confirmation; nothing written");

            int healedHp = checked(expectedHp + 100);
            if (healedHp > expectedHpMax)
                throw new InvalidOperationException("The heal would exceed max HP; nothing written");

            byte[] newValue = BitConverter.GetBytes(healedHp);
            UIntPtr bytesWritten;
            bool ok = WriteProcessMemory(handle, new IntPtr(wakkaEntity + 0x5D0),
                newValue, new UIntPtr(4), out bytesWritten);
            if (!ok || bytesWritten.ToUInt64() != 4)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Four-byte write was not confirmed");

            byte[] after = ReadBytes(handle, wakkaEntity + 0x5D0, 8);
            byte[] maxAfter = ReadBytes(handle, wakkaEntity + 0x594, 8);
            if (BitConverter.ToInt32(after, 0) != healedHp ||
                BitConverter.ToInt32(after, 4) != expectedMp ||
                BitConverter.ToInt32(maxAfter, 0) != expectedHpMax ||
                BitConverter.ToInt32(maxAfter, 4) != expectedMpMax)
                throw new InvalidOperationException("Read-back differs: check the game before retrying");
            return healedHp;
        }
        finally { CloseHandle(handle); }
    }
}
'@

try {
    $processes = @(Get-Process -Name 'FFX' -ErrorAction SilentlyContinue)
    if ($processes.Count -ne 1) { throw "Open exactly one FFX.exe process. Found: $($processes.Count)." }
    $game = $processes[0]
    $base = $game.MainModule.BaseAddress.ToInt64()
    $hash = (Get-FileHash -LiteralPath $game.MainModule.FileName -Algorithm SHA256).Hash
    if (-not $hash.StartsWith('0537B2A1047F3266', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Unknown FFX.exe version. No changes made.'
    }
    Add-Type -TypeDefinition $nativeCode -ErrorAction Stop

    $storage = [FfxBattleWakkaMemory]::FindBattlePointerStorage($game.Id, $base, $game.MainModule.ModuleMemorySize)
    if ($storage -eq 0) { throw 'Cannot locate battle pointer. No changes made.' }
    $battlePointer = [BitConverter]::ToUInt32([FfxBattleWakkaMemory]::Read($game.Id, $storage, 4), 0)
    if ($battlePointer -lt 0x10000) { throw 'Not currently in a battle. No changes made.' }

    # Lock to the exact trio seen in the battle screenshot. Character indices
    # are fixed; they are not the order of the active party.
    $confirmed = @(
        [PSCustomObject]@{ Name = 'Tidus'; Slot = 0; HP = 99967; MaxHP = 99999; MP = 801; MaxMP = 999 },
        [PSCustomObject]@{ Name = 'Wakka'; Slot = 4; HP = 10076; MaxHP = 99999; MP = 969; MaxMP = 999 },
        [PSCustomObject]@{ Name = 'Rikku'; Slot = 6; HP = 9999; MaxHP = 99999; MP = 999; MaxMP = 999 }
    )
    foreach ($character in $confirmed) {
        $entity = [long]$battlePointer + ($character.Slot * 0xF90)
        $maxBytes = [FfxBattleWakkaMemory]::Read($game.Id, $entity + 0x594, 8)
        $currentBytes = [FfxBattleWakkaMemory]::Read($game.Id, $entity + 0x5D0, 8)
        $hp = [BitConverter]::ToInt32($currentBytes, 0)
        $mp = [BitConverter]::ToInt32($currentBytes, 4)
        $maxHp = [BitConverter]::ToInt32($maxBytes, 0)
        $maxMp = [BitConverter]::ToInt32($maxBytes, 4)
        if ($hp -ne $character.HP -or $mp -ne $character.MP -or
            $maxHp -ne $character.MaxHP -or $maxMp -ne $character.MaxMP) {
            throw ($character.Name + ' changed since the reference screenshot: ' +
                $hp + '/' + $maxHp + ' HP, ' + $mp + '/' + $maxMp + ' MP. No changes made.')
        }
    }

    Write-Host 'Twitch Chaos - MANUAL in-battle Wakka +100 HP test' -ForegroundColor Cyan
    Write-Host ('FFX.exe PID: ' + $game.Id)
    Write-Host 'Battle trio matches the reference screenshot:' -ForegroundColor Green
    Write-Host '  Tidus 99967/99999 HP, 801/999 MP'
    Write-Host '  Wakka 10076/99999 HP, 969/999 MP'
    Write-Host '  Rikku 9999/99999 HP, 999/999 MP'
    Write-Host 'Proposal: Wakka HP 10076 -> 10176. MP and other characters untouched.' -ForegroundColor Yellow
    Write-Host 'IMPORTANT: use a test save in another slot. Stay in this battle at a command menu.' -ForegroundColor Yellow
    $confirmation = Read-Host 'Type CURAR to write 4 bytes to Wakka HP; anything else cancels'
    if ($confirmation -cne 'CURAR') {
        Write-Host 'Cancelled. No game data was changed.' -ForegroundColor Yellow
        exit 0
    }

    if ($game.HasExited) { throw 'FFX closed before the edit. No changes made.' }
    $after = [FfxBattleWakkaMemory]::HealWakkaOnce($game.Id, $storage, [uint32]$battlePointer,
        10076, 969, 99999, 999)
    Write-Host ('OK - Wakka battle HP: 10076 -> ' + $after + ', MP remains 969') -ForegroundColor Green
    Write-Host 'Check the HP in the ongoing battle before ending it or saving.'
} catch {
    Write-Host ('Stopped: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'If an error occurred AFTER confirming, inspect Wakka HP before retrying.'
    exit 1
}
