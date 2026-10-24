export interface CanvasItem {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
  timeStr?: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
}

export interface Workspace {
  id: string;
  name: string;
  rootPath: string | null;
}

export type LoadState = "idle" | "loading" | "done" | "error";
