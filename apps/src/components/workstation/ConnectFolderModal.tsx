import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { tauriPickFolder } from "../../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input } from "../ui";

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
    try {
      const selected = await tauriPickFolder();
      if (selected) {
        onOpenFolder(selected);
        onClose();
        setFolderInputPath("");
        toast.success(`Folder aktif: ${selected}`);
        return;
      }
    } catch (err: any) {
      toast.error(`Gagal membuka dialog folder: ${err?.message || err}`);
    }
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[var(--text-muted)]" />
            Buka Folder Kerja
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleConnectFolderSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-medium">
              Local Folder Path
            </label>
            <Input
              type="text"
              value={folderInputPath}
              onChange={(e) => setFolderInputPath(e.target.value)}
              placeholder="Example: E:\DocumentWorkspaces\Garment"
            />
          </div>

          <DialogFooter className="justify-between">
            <Button type="button" variant="secondary" onClick={openElectronDialog}>
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Pilih Folder…</span>
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" variant="default">
                Buka
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
