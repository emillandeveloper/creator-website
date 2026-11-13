# Twitch Chaos / FFX HD Steam - FIRST WRITE TEST (one Potion maximum).
# IMPORTANT: Back up the save in another slot before running. Do not use on a valuable save.
# This tool only writes ONE byte of FFX.exe memory after validating the game, inventory and user confirmation.
# It does not listen for Twitch. NonInteractive mode requires a separately armed local agent.
param([switch]$NonInteractive)
$ErrorActionPreference = 'Stop'

$nativeCode = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class FfxPotionMemory
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
        byte[] result = new byte[length];
        UIntPtr bytesRead;
        bool ok = ReadProcessMemory(handle, new IntPtr(address), result,
            new UIntPtr((uint)length), out bytesRead);
        if (!ok || bytesRead.ToUInt64() != (ulong)length)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot read FFX memory");
        return result;
    }

    public static byte[] Read(int pid, long address, int length)
    {
        IntPtr handle = OpenProcess(VM_READ | QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open FFX for reading");
        try { return ReadBytes(handle, address, length); }
        finally { CloseHandle(handle); }
    }

    public static byte AddExactlyOne(int pid, long address, byte expected)
    {
        if (expected < 1 || expected >= 99)
            throw new InvalidOperationException("Potion count must be between 1 and 98");

        IntPtr handle = OpenProcess(VM_READ | VM_WRITE | VM_OPERATION | QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open FFX for the one-byte edit");

        try
        {
            byte current = ReadBytes(handle, address, 1)[0];
            if (current != expected)
                throw new InvalidOperationException("Potion count changed while preparing the edit; nothing written");

            byte[] newValue = { (byte)(expected + 1) };
            UIntPtr bytesWritten;
            bool ok = WriteProcessMemory(handle, new IntPtr(address), newValue,
                new UIntPtr(1), out bytesWritten);
            if (!ok || bytesWritten.ToUInt64() != 1)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "The one-byte edit was not confirmed");

            byte verified = ReadBytes(handle, address, 1)[0];
            if (verified != newValue[0])
                throw new InvalidOperationException("Read-back differs from the requested count; inspect in-game inventory");
            return verified;
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

    # SHA256 prefix observed in Leo's successful read-only probe, Nov 13, 2026.
    # This is a compatibility guard, not a general Steam version detector.
    if (-not $gameHash.StartsWith('0537B2A1047F3266', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Unknown FFX.exe version. No changes made; run inspect-inventory.bat and verify compatibility first.'
    }

    Add-Type -TypeDefinition $nativeCode -ErrorAction Stop

    # Historical Farplane offsets, confirmed read-only in this exact executable.
    $itemTypes = [FfxPotionMemory]::Read($gameProcess.Id, $baseAddress + 0xD3095C, 112 * 2)
    $itemCounts = [FfxPotionMemory]::Read($gameProcess.Id, $baseAddress + 0xD30B5C, 112)
    $potionSlot = -1
    $potionCount = -1
    $recognizedSlots = 0

    for ($slot = 0; $slot -lt 112; $slot++) {
        $itemId = [BitConverter]::ToUInt16($itemTypes, $slot * 2)
        $count = [int]$itemCounts[$slot]
        if ($itemId -eq 0x00FF) { continue }
        if ($itemId -lt 0x2000 -or $itemId -gt 0x206F -or $count -lt 1 -or $count -gt 99) {
            throw "Unrecognized item data at slot $slot. No changes made."
        }
        $recognizedSlots++
        if ($itemId -eq 0x2000) {
            if ($potionSlot -ge 0) { throw 'Multiple Potion slots detected. No changes made.' }
            $potionSlot = $slot
            $potionCount = $count
        }
    }

    if ($recognizedSlots -lt 1 -or $potionSlot -lt 0) {
        throw 'No recognized Potion stack found. No changes made.'
    }
    if ($potionCount -ge 99) { throw 'Already at 99 Potions. No changes made.' }

    Write-Host 'Twitch Chaos - first real FFX inventory edit' -ForegroundColor Cyan
    Write-Host ('Pociones detectadas: ' + $potionCount + ' (slot ' + $potionSlot + ')')
    Write-Host ('Propuesta: ' + $potionCount + ' -> ' + ($potionCount + 1)) -ForegroundColor Yellow
    Write-Host 'IMPORTANTE: utiliza un guardado de prueba en otro slot.' -ForegroundColor Yellow
    if ($NonInteractive) {
        if ($env:CHAOS_LIVE_POTION -cne 'YES') {
            throw 'Local LIVE Potion opt-in is disabled. No changes made.'
        }
        Write-Host 'Autorizado por el conector local armado y una orden del propietario.'
    } else {
        Write-Host 'No se modificara nada si no confirmas.'
        $confirmation = Read-Host 'Escribe SUMAR para anadir exactamente una Pocion; otra cosa cancela'
        if ($confirmation -cne 'SUMAR') {
            Write-Host 'Cancelado. No se ha modificado el juego.' -ForegroundColor Yellow
            exit 0
        }
    }

    if ($gameProcess.HasExited) { throw 'FFX closed before the edit. No changes made.' }
    # A second check immediately before writing catches the inventory changing during confirmation.
    $typesAgain = [FfxPotionMemory]::Read($gameProcess.Id, $baseAddress + 0xD3095C, 112 * 2)
    if ([Convert]::ToBase64String($itemTypes) -cne [Convert]::ToBase64String($typesAgain)) {
        throw 'Inventory item positions changed; no changes made.'
    }
    $countsAgain = [FfxPotionMemory]::Read($gameProcess.Id, $baseAddress + 0xD30B5C, 112)
    if ([Convert]::ToBase64String($itemCounts) -cne [Convert]::ToBase64String($countsAgain)) {
        throw 'Inventory quantities changed; no changes made.'
    }

    $after = [FfxPotionMemory]::AddExactlyOne($gameProcess.Id, ($baseAddress + 0xD30B5C + $potionSlot), [byte]$potionCount)
    Write-Host ('OK - Pociones: ' + $potionCount + ' -> ' + $after) -ForegroundColor Green
    Write-Output ('CHAOS_POTION_APPLIED:' + $potionCount + ':' + $after)
    Write-Host 'Cierra y vuelve a abrir el inventario en el juego para verlo actualizado.'
    Write-Host 'Este programa no ha guardado la partida; comprueba el cambio antes de guardar.'
} catch {
    Write-Host ('Detenido: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Si aparece un error tras confirmar, revisa el inventario antes de reintentar.'
    exit 1
}
