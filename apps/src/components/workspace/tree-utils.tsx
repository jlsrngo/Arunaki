import { FileText, FileImage, FileSpreadsheet, File, FileCode, FileArchive } from "lucide-react";

export interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface NativeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  ext?: string;
  children?: NativeNode[];
}

export interface TreeNode {
  name: string;
  isDir: boolean;
  children: TreeNode[];
  file?: FileItem;
  nativePath?: string;
  size?: number;
}

export function buildTree(files: FileItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const filteredFiles = files.filter(
    (f) => !["arunaki.json", "arunaki.jsonc"].includes(f.name.toLowerCase()),
  );

  for (const file of filteredFiles) {
    const parts = file.name.replace(/\\/g, "/").split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.push({ name: part, isDir: false, children: [], file });
      } else {
        let existing = current.find((n) => n.name === part && n.isDir);
        if (!existing) {
          existing = { name: part, isDir: true, children: [] };
          current.push(existing);
        }
        current = existing.children;
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => {
      if (n.isDir) sortNodes(n.children);
    });
  };
  sortNodes(root);

  return root;
}

export function nativeToTreeNodes(nodes: NativeNode[]): TreeNode[] {
  return nodes
    .filter((n) => !["arunaki.json", "arunaki.jsonc"].includes(n.name.toLowerCase()))
    .map((n) => ({
      name: n.name,
      isDir: n.type === "directory",
      nativePath: n.path,
      size: n.size,
      children: n.children ? nativeToTreeNodes(n.children) : [],
    }));
}

export function getFileIcon(name: string) {
  const lowerName = name.toLowerCase();
  const ext = lowerName.split(".").pop() || "";

  // Excel / Spreadsheets (Soft Sage / Emerald Green)
  if (["xlsx", "xls", "xlsm", "xlsb", "csv", "tsv"].includes(ext)) {
    return (
      <FileSpreadsheet
        className="w-3.5 h-3.5 text-emerald-600/85 dark:text-emerald-400/80 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  // Word Documents (Soft Steel / Slate Blue)
  if (["docx", "doc", "rtf", "odt"].includes(ext)) {
    return (
      <FileText
        className="w-3.5 h-3.5 text-sky-600/85 dark:text-sky-400/80 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  // PDF Documents (Soft Coral / Muted Rose)
  if (["pdf"].includes(ext)) {
    return (
      <FileText
        className="w-3.5 h-3.5 text-rose-500/85 dark:text-rose-400/80 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  // Presentations / Slides (Soft Ochre / Muted Amber)
  if (["pptx", "ppt", "key"].includes(ext)) {
    return (
      <FileText
        className="w-3.5 h-3.5 text-amber-500/85 dark:text-amber-400/80 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  // Images / Media (Soft Teal / Cyan)
  if (["jpg", "jpeg", "png", "gif", "svg", "webp", "ico", "bmp", "tiff"].includes(ext)) {
    return (
      <FileImage
        className="w-3.5 h-3.5 text-teal-600/85 dark:text-teal-400/80 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  // Archives / Compressed (Soft Sand / Muted Orange)
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) {
    return (
      <FileArchive
        className="w-3.5 h-3.5 text-amber-600/75 dark:text-amber-300/75 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  // JSON / Config Data (Soft Warm Gold / Amber)
  if (["json", "yaml", "yml", "xml", "toml"].includes(ext)) {
    return (
      <FileCode
        className="w-3.5 h-3.5 text-amber-600/80 dark:text-amber-300/80 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  // Code / Scripts (Soft Lilac / Muted Violet)
  if (
    ["js", "jsx", "ts", "tsx", "html", "css", "py", "sh", "cmd", "ps1", "sql", "rs", "go", "java", "c", "cpp"].includes(ext) ||
    lowerName.startsWith(".env") ||
    lowerName === ".gitignore"
  ) {
    return (
      <FileCode
        className="w-3.5 h-3.5 text-violet-500/85 dark:text-violet-400/80 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  // Markdown / Plain Text / Logs (Soft Slate / Neutral)
  if (["md", "txt", "log", "rtf"].includes(ext)) {
    return (
      <FileText
        className="w-3.5 h-3.5 text-slate-500/85 dark:text-zinc-400/80 shrink-0"
        strokeWidth={1.5}
      />
    );
  }

  return <File className="w-3.5 h-3.5 text-[var(--text-dim)] shrink-0" strokeWidth={1.5} />;
}

export function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
