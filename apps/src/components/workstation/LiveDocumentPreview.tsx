import { FileSpreadsheet, FileText } from "lucide-react";
import { LiveStatusData } from "./LiveExecutionBadge";

interface LiveDocumentPreviewProps {
  status: LiveStatusData | null;
}

export function LiveDocumentPreview({ status }: LiveDocumentPreviewProps) {
  if (!status || !status.toolName) return null;

  // We only show preview for read/write/edit/excel operations
  const isDocumentTool = 
    status.toolName.includes("read") || 
    status.toolName.includes("write") || 
    status.toolName.includes("edit") || 
    status.toolName.includes("excel");
    
  if (!isDocumentTool || !status.preview) return null;

  const isExcel = status.toolName.includes("excel") || status.preview.includes(",");
  
  // Render a minimal mini-spreadsheet or text block
  return (
    <div className="my-2 rounded-lg bg-[var(--bg-panel-sub)] border border-[var(--border-color)] overflow-hidden text-[11px] font-mono animate-fade-in shadow-inner max-w-sm">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
        {isExcel ? (
          <FileSpreadsheet size={13} className="text-emerald-500" />
        ) : (
          <FileText size={13} className="text-blue-500" />
        )}
        <span className="font-semibold text-[var(--text-primary)]">
          {status.toolName}
        </span>
      </div>
      <div className="p-3 overflow-x-auto">
        {isExcel ? (
          <table className="w-full text-left border-collapse">
            <tbody>
              {status.preview.split('\n').slice(0, 5).map((row, i) => (
                <tr key={i} className="border-b border-[var(--border-color)] last:border-0">
                  {row.split(',').slice(0, 4).map((cell, j) => (
                    <td key={j} className="p-1 px-2 border-r border-[var(--border-color)] last:border-0 truncate max-w-[80px]">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="text-[var(--text-secondary)] whitespace-pre-wrap break-all line-clamp-5">
            {status.preview}
          </pre>
        )}
      </div>
    </div>
  );
}
