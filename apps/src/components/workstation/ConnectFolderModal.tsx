import { useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { toast } from "sonner";

interface ConnectFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFolder: (folderPath: string) => void;
}

export function ConnectFolderModal({
  isOpen,
  onClose,
  onOpenFolder,
}: ConnectFolderModalProps) {
  const [folderInputPath, setFolderInputPath] = useState("");

  if (!isOpen) return null;

  const openElectronDialog = async () => {
    const desktop = typeof window !== "undefined" ? (window as any).arunakiDesktop : null;
    // The bridge exposes this as pickFolder and it answers { path }. Asking for openFolderDialog
    // and reading folderPath - neither of which exist - meant the guard fell through to the toast
    // below every single time, so "Pilih Folder..." never opened a dialog. AppLayout already used
    // the correct names for the same IPC.
    if (desktop?.pickFolder) {
      try {
        const res = await desktop.pickFolder();
        if (res?.path) {
          onOpenFolder(res.path);
          onClose();
          setFolderInputPath("");
          toast.success(`Folder aktif: ${res.path}`);
        }
        return;
      } catch (err: any) {
        toast.error(`Gagal membuka dialog folder: ${err?.message || err}`);
        return;
      }
    }
    toast.info("Use the path input below (or open via desktop app)");
  };

  const handleConnectFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderInputPath.trim()) return;
    onOpenFolder(folderInputPath.trim());
    onClose();
    setFolderInputPath("");
    toast.success(`Folder aktif: ${folderInputPath.trim()}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl max-w-md w-full p-5 border border-[var(--border-strong)]">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)] mb-4">
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[var(--text-muted)]" />
            Buka Folder Kerja
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConnectFolderSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
              Local Folder Path
            </label>
            <input
              type="text"
              value={folderInputPath}
              onChange={(e) => setFolderInputPath(e.target.value)}
              placeholder="Example: E:\DocumentWorkspaces\Garment"
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-md px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={openElectronDialog}
              className="px-4 py-2 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md text-xs font-semibold cursor-pointer transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5 mr-1.5 inline" />
              Pilih Folder…
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md text-xs font-semibold cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 rounded-md text-xs font-semibold cursor-pointer transition-opacity"
              >
                Buka
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
