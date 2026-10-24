param (
    [Parameter(Mandatory=$true)]
    [string]$ExePath,
    [Parameter(Mandatory=$true)]
    [string]$IcoPath
)

$code = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class ExeIconChanger {
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);

    private static readonly IntPtr RT_ICON = (IntPtr)3;
    private static readonly IntPtr RT_GROUP_ICON = (IntPtr)14;

    public static bool InjectIcon(string exePath, string icoPath) {
        if (!File.Exists(exePath) || !File.Exists(icoPath)) return false;
        byte[] icoBytes = File.ReadAllBytes(icoPath);
        if (icoBytes.Length < 6) return false;

        ushort count = BitConverter.ToUInt16(icoBytes, 4);
        IntPtr hUpdate = BeginUpdateResource(exePath, false);
        if (hUpdate == IntPtr.Zero) return false;

        int groupHeaderSize = 6 + count * 14;
        byte[] groupIcon = new byte[groupHeaderSize];
        Array.Copy(icoBytes, 0, groupIcon, 0, 6);

        int srcOffset = 6;
        int dstOffset = 6;

        for (ushort i = 0; i < count; i++) {
            byte width = icoBytes[srcOffset];
            byte height = icoBytes[srcOffset + 1];
            byte colorCount = icoBytes[srcOffset + 2];
            byte reserved = icoBytes[srcOffset + 3];
            ushort planes = BitConverter.ToUInt16(icoBytes, srcOffset + 4);
            ushort bitCount = BitConverter.ToUInt16(icoBytes, srcOffset + 6);
            uint bytesInRes = BitConverter.ToUInt32(icoBytes, srcOffset + 8);
            uint imageOffset = BitConverter.ToUInt32(icoBytes, srcOffset + 12);

            ushort iconId = (ushort)(i + 1);

            groupIcon[dstOffset] = width;
            groupIcon[dstOffset + 1] = height;
            groupIcon[dstOffset + 2] = colorCount;
            groupIcon[dstOffset + 3] = reserved;
            Array.Copy(BitConverter.GetBytes(planes), 0, groupIcon, dstOffset + 4, 2);
            Array.Copy(BitConverter.GetBytes(bitCount), 0, groupIcon, dstOffset + 6, 2);
            Array.Copy(BitConverter.GetBytes(bytesInRes), 0, groupIcon, dstOffset + 8, 4);
            Array.Copy(BitConverter.GetBytes(iconId), 0, groupIcon, dstOffset + 12, 2);

            byte[] iconData = new byte[bytesInRes];
            Array.Copy(icoBytes, imageOffset, iconData, 0, bytesInRes);

            UpdateResource(hUpdate, RT_ICON, (IntPtr)iconId, 0, iconData, (uint)iconData.Length);

            srcOffset += 16;
            dstOffset += 14;
        }

        UpdateResource(hUpdate, RT_GROUP_ICON, (IntPtr)1, 0, groupIcon, (uint)groupIcon.Length);
        return EndUpdateResource(hUpdate, false);
    }
}
'@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
$res = [ExeIconChanger]::InjectIcon($ExePath, $IcoPath)
if ($res) {
    Write-Host "[inject-icon] Successfully injected $IcoPath into $ExePath"
    exit 0
} else {
    Write-Error "[inject-icon] Failed to inject $IcoPath into $ExePath"
    exit 1
}
