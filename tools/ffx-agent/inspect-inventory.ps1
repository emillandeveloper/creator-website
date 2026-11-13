# Twitch Chaos / FFX HD Steam - READ-ONLY memory compatibility probe.
# Never writes game memory, files or save data. Run in Windows PowerShell 5.1+.
# The two historical offsets below come from the open-source Farplane project.
# They must be validated against the currently running Steam build before any write feature is added.
$ErrorActionPreference = 'Stop'

$nativeCode = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class FfxMemoryReader
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
        if (length <= 0 || length > 4096) throw new ArgumentOutOfRangeException("length");
        IntPtr handle = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to open FFX.exe for read-only inspection");

        try
        {
            byte[] buffer = new byte[length];
            UIntPtr bytesRead;
            bool success = ReadProcessMemory(handle, new IntPtr(address), buffer,
                new UIntPtr((uint)length), out bytesRead);
            if (!success || bytesRead.ToUInt64() != (ulong)length)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not read the expected FFX memory region");
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

    Add-Type -TypeDefinition $nativeCode -ErrorAction Stop

    # Farplane FFX/Offsets.cs (old build, module-relative addresses).
    # FFX/Data/Item.cs declares 112 16-bit IDs plus 112 8-bit counts.
    $itemTypeOffset = 0xD3095C
    $itemCountOffset = 0xD30B5C
    $itemTypes = [FfxMemoryReader]::Read($gameProcess.Id, $baseAddress + $itemTypeOffset, 112 * 2)
    $itemCounts = [FfxMemoryReader]::Read($gameProcess.Id, $baseAddress + $itemCountOffset, 112)

    $knownSlots = 0
    $emptySlots = 0
    $potionCount = 0
    $potionSlot = -1
    for ($slot = 0; $slot -lt 112; $slot++) {
        $itemId = [BitConverter]::ToUInt16($itemTypes, $slot * 2)
        $count = [int]$itemCounts[$slot]

        if ($itemId -eq 0x00FF) {
            $emptySlots++
            continue
        }
        if ($itemId -lt 0x2000 -or $itemId -gt 0x206F -or $count -lt 1 -or $count -gt 99) {
            throw "Unrecognized inventory data at slot $slot (item ID or count outside expected range). No changes made."
        }
        $knownSlots++
        if ($itemId -eq 0x2000) {
            if ($potionSlot -ge 0) {
                throw 'Potion occurs in multiple inventory slots. This build needs additional validation.'
            }
            $potionCount = $count
            $potionSlot = $slot
        }
    }

    if ($knownSlots -eq 0) {
        throw 'All inventory slots look empty. Progress until you have at least one item, then rerun the test.'
    }

    Write-Host 'Twitch Chaos - FFX HD / read-only inventory inspection' -ForegroundColor Cyan
    Write-Host ('FFX.exe PID: ' + $gameProcess.Id)
    Write-Host ('Executable SHA256: ' + $gameHash)
    Write-Host ('Recognized item slots: ' + $knownSlots + ' / 112')
    Write-Host ('Empty slots: ' + $emptySlots + ' / 112')
    if ($potionSlot -ge 0) {
        Write-Host ('Potion: ' + $potionCount + ' in slot ' + $potionSlot) -ForegroundColor Green
    } else {
        Write-Host 'Potion: not present (continue until you have at least one Potion).' -ForegroundColor Yellow
    }
    Write-Host 'READ ONLY: no game memory or save data was changed.' -ForegroundColor Green
    Write-Host 'Compare the Potion count with the in-game inventory before any live edit.'
} catch {
    Write-Host ('Inspection stopped: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'No game memory or save data was changed.'
    exit 1
}
