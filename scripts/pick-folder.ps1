param(
    [string]$Title = "Select Active Project Folder",
    [string]$InitialPath = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$csharp = @'
using System;
using System.Runtime.InteropServices;

public class ModernFolderPicker {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHCreateItemFromParsingName(
        string pszPath,
        IntPtr pbc,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

    [ComImport]
    [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialogRCW {}

    [ComImport]
    [Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint fos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
    }

    [ComImport]
    [Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    public static string ShowDialog(string title, string initialFolder) {
        var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
        uint fos;
        dialog.GetOptions(out fos);
        // FOS_PICKFOLDERS (0x00000020) | FOS_FORCEFILESYSTEM (0x00000040)
        dialog.SetOptions(fos | 0x00000020 | 0x00000040);

        if (!string.IsNullOrEmpty(title)) {
            dialog.SetTitle(title);
        }

        if (!string.IsNullOrEmpty(initialFolder) && System.IO.Directory.Exists(initialFolder)) {
            try {
                Guid iid = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
                IShellItem folderItem;
                if (SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, ref iid, out folderItem) == 0 && folderItem != null) {
                    dialog.SetFolder(folderItem);
                }
            } catch {}
        }

        int hr = dialog.Show(IntPtr.Zero);
        if (hr == 0) {
            try {
                IShellItem item;
                dialog.GetResult(out item);
                if (item != null) {
                    string path;
                    item.GetDisplayName(0x80058000 /* SIGDN_FILESYSPATH */, out path);
                    if (!string.IsNullOrEmpty(path)) {
                        return path;
                    }
                }
            } catch {}
        }
        return null;
    }
}
'@

try {
    Add-Type -TypeDefinition $csharp
} catch {
    # If type is already loaded in the runspace, ignore error
}

$selected = $null
try {
    $selected = [ModernFolderPicker]::ShowDialog($Title, $InitialPath)
} catch {
    # COM failure, proceed to fallback
}

# Fallback to standard WinForms FolderBrowserDialog if COM picker was empty or failed
if ([string]::IsNullOrWhiteSpace($selected)) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $fbd = New-Object System.Windows.Forms.FolderBrowserDialog
        $fbd.Description = $Title
        $fbd.ShowNewFolderButton = $true
        if (![string]::IsNullOrEmpty($InitialPath) -and (Test-Path $InitialPath)) {
            $fbd.SelectedPath = $InitialPath
        }
        if ($fbd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $selected = $fbd.SelectedPath
        }
    } catch {}
}

if ($selected) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $selected.Trim()
}
