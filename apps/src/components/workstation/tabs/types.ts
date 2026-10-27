export interface CenterTab {
  id: string;
  type: "file" | "canvas" | "stage" | "app" | "diff";
  title: string;
  path?: string;
  fileType?: string;
  content?: string;
  beforeContent?: string;
  afterContent?: string;
  createdAt?: string;
  timeStr?: string;
}
