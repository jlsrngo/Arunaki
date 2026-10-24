import { useState } from "react";
import { Monitor, ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";

interface LiveMirrorCardProps {
  screenshotUrl: string;
  title?: string;
  subtitle?: string;
  timestamp?: string;
}

export function LiveMirrorCard({
  screenshotUrl,
  title = "Desktop Live Mirror",
  subtitle = "Real-time view of the desktop app operated by Arunaki",
  timestamp,
}: LiveMirrorCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  if (!screenshotUrl) return null;

  return (
    <div className="my-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden transition-all duration-200">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-panel-sub)] border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <Monitor size={16} className="text-[var(--text-muted)]" />
          <div>
            <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>
            {timestamp && (
              <span className="text-[10px] text-[var(--text-dim)] ml-2">
                {new Date(timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFullScreen(!fullScreen)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title={fullScreen ? "Minimize" : "Maximize Fullscreen"}
          >
            {fullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title={collapsed ? "Open Mirror" : "Hide Mirror"}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      {!collapsed && (
        <div className={`p-2 bg-[var(--bg-app)] flex flex-col items-center justify-center transition-all ${fullScreen ? "max-h-[80vh]" : "max-h-96"}`}>
          <img
            src={screenshotUrl}
            alt="Desktop Live Mirror"
            className="max-h-full max-w-full object-contain rounded border border-[var(--border-color)]"
          />
          <div className="w-full mt-1.5 px-2 flex justify-between text-[11px] text-gray-400">
            <span className="truncate">{subtitle}</span>
            <span className="text-emerald-400 font-mono text-[10px]">🟢 Live Connected</span>
          </div>
        </div>
      )}
    </div>
  );
}
