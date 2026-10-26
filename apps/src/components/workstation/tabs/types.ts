export interface CenterTab {
  id: string;
  type: "file" | "canvas" | "stage" | "app";
  title: string;
  path?: string;
  fileType?: string;
  content?: string;
  createdAt?: string;
  timeStr?: string;
}
