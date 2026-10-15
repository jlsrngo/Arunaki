import { describe, it, expect } from "vitest";
import { buildTree, nativeToTreeNodes, formatSize, NativeNode, FileItem } from "./tree-utils";

describe("tree-utils", () => {
  describe("formatSize", () => {
    it("returns empty string when size is undefined or 0", () => {
      expect(formatSize(undefined)).toBe("");
      expect(formatSize(0)).toBe("");
    });

    it("formats bytes accurately", () => {
      expect(formatSize(512)).toBe("512 B");
    });

    it("formats kilobytes accurately", () => {
      expect(formatSize(2048)).toBe("2.0 KB");
      expect(formatSize(1536)).toBe("1.5 KB");
    });

    it("formats megabytes accurately", () => {
      expect(formatSize(1048576 * 2.5)).toBe("2.5 MB");
    });
  });

  describe("buildTree", () => {
    it("builds a hierarchical tree from flat file list and filters arunaki.json", () => {
      const files: FileItem[] = [
        { id: "1", name: "src/index.ts", type: "code", size: 100 },
        { id: "2", name: "src/utils/math.ts", type: "code", size: 200 },
        { id: "3", name: "README.md", type: "text", size: 50 },
        { id: "4", name: "arunaki.json", type: "config", size: 30 },
      ];

      const tree = buildTree(files);

      // arunaki.json must be excluded
      expect(tree.find((n) => n.name === "arunaki.json")).toBeUndefined();

      // Directories sorted before files
      expect(tree[0].name).toBe("src");
      expect(tree[0].isDir).toBe(true);

      expect(tree[1].name).toBe("README.md");
      expect(tree[1].isDir).toBe(false);

      // Subtree checks
      const srcNode = tree[0];
      expect(srcNode.children.length).toBe(2);
      expect(srcNode.children[0].name).toBe("utils");
      expect(srcNode.children[0].isDir).toBe(true);
      expect(srcNode.children[1].name).toBe("index.ts");
    });
  });

  describe("nativeToTreeNodes", () => {
    it("converts native nodes and filters out arunaki.json", () => {
      const nativeNodes: NativeNode[] = [
        {
          name: "docs",
          path: "/workspace/docs",
          type: "directory",
          children: [
            {
              name: "plan.pdf",
              path: "/workspace/docs/plan.pdf",
              type: "file",
              size: 4096,
            },
          ],
        },
        {
          name: "arunaki.json",
          path: "/workspace/arunaki.json",
          type: "file",
        },
      ];

      const tree = nativeToTreeNodes(nativeNodes);
      expect(tree.length).toBe(1);
      expect(tree[0].name).toBe("docs");
      expect(tree[0].isDir).toBe(true);
      expect(tree[0].children[0].name).toBe("plan.pdf");
      expect(tree[0].children[0].isDir).toBe(false);
      expect(tree[0].children[0].size).toBe(4096);
    });
  });
});
