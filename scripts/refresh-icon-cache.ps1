param()

$code = @'
using System;
using System.Runtime.InteropServices;

public class ShellRefresh {
    [DllImport("shell32.dll", SetLastError = true)]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
'@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
# 0x08000000 = SHCNE_ASSOCCHANGED, 0x0000 = SHCNF_IDLIST
[ShellRefresh]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)

# Touch the files so Explorer sees new mtime if cached by timestamp
$now = Get-Date
Get-Item "E:\JS\Arunika\dist-portable\*.exe" | ForEach-Object {
    $_.LastWriteTime = $now
}

# Run ie4uinit if available on Windows 10/11
Start-Process -FilePath "ie4uinit.exe" -ArgumentList "-show" -Wait -ErrorAction SilentlyContinue

Write-Host "[refresh-icon] Windows Shell notification sent and timestamps updated!"
