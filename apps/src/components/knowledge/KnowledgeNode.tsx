import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Bot,
  FileText,
  ShieldCheck,
  Database,
  Globe,
  Calculator,
  Send,
  Brain,
  Mail,
  Calendar,
  SlidersHorizontal,
  Table2,
  Link2,
  FileCode,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ArunakiLogo } from '../common/ArunakiLogo';

interface KnowledgeNodeProps {
  data: {
    id: string;
    title: string;
    content: string;
    type: string;
    active: boolean;
    nodeColor?: string;
    icon?: string;
    isMain?: boolean;
    isCircular?: boolean;
    portLabel?: string;
    onSelect?: (id: string) => void;
  };
  selected?: boolean;
}

const getIconElement = (type: string, iconName?: string) => {
  const t = (type || "").toLowerCase();
  const icon = (iconName || "").toLowerCase();

  if (icon === "bot" || t.includes("agent") || t.includes("assistant")) {
    return <Bot className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (icon === "brain" || t.includes("model") || t.includes("openai") || t.includes("ai")) {
    return <Brain className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (icon === "database" || t.includes("memory") || t.includes("buffer") || t.includes("db")) {
    return <Database className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (icon === "mail" || t.includes("email") || t.includes("gmail")) {
    return <Mail className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (icon === "calendar" || t.includes("event") || t.includes("schedule")) {
    return <Calendar className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (icon === "globe" || t.includes("web") || t.includes("tavily") || t.includes("search")) {
    return <Globe className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (icon === "calc" || icon === "calculator" || t.includes("calc") || t.includes("math")) {
    return <Calculator className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (icon === "send" || icon === "telegram" || t.includes("telegram") || t.includes("message")) {
    return <Send className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (icon === "shield-check" || t.includes("rules") || t.includes("sop")) {
    return <ShieldCheck className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (t.includes("sheet") || t.includes("excel") || t.includes("csv") || t.includes("table")) {
    return <Table2 className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (t.includes("url") || t.includes("link")) {
    return <Link2 className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (t.includes("code") || t.includes("script")) {
    return <FileCode className="w-5 h-5" strokeWidth={1.5} />;
  }
  if (t.includes("switch") || t.includes("router")) {
    return <SlidersHorizontal className="w-5 h-5" strokeWidth={1.5} />;
  }
  return <FileText className="w-5 h-5" strokeWidth={1.5} />;
};

const getNodeColorTheme = (_type: string, _iconName?: string) => {
  return "bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-strong)] shadow-xs";
};

export const KnowledgeNode = memo(function KnowledgeNode({ data, selected }: KnowledgeNodeProps) {
  const isMain = data.isMain || data.id === 'main-ai-node';
  const isActive = data.active !== false;
  const isCircular = data.isCircular || ['tool', 'memory', 'model'].includes((data.type || '').toLowerCase());

  // ─────────────────────────────────────────────────────────────────────────
  // 1. MAIN ASSISTANT / AGENT CORE NODE (Hub with All-Around 4-Way Connections)
  // ─────────────────────────────────────────────────────────────────────────
  if (isMain) {
    return (
      <div
        onClick={() => data.onSelect?.(data.id)}
        className="relative group w-24 h-24 flex items-center justify-center cursor-pointer select-none"
      >
        {/* Logo only, guaranteed 64x64 dimensions */}
        <ArunakiLogo
          size={64}
          className="text-[var(--text-primary)] transition-transform duration-300 group-hover:scale-110 drop-shadow-xs"
        />

        {/* 4 Invisible Connection Ports on the edges */}
        {/* Top */}
        <div style={{ position: 'absolute', left: '50%', top: '-2px', transform: 'translateX(-50%)' }}>
          <Handle type="target" position={Position.Top} id="target-top" className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 cursor-crosshair z-10" />
          <Handle type="source" position={Position.Top} id="source-top" className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 cursor-crosshair z-10" />
        </div>
        
        {/* Bottom */}
        <div style={{ position: 'absolute', left: '50%', bottom: '-2px', transform: 'translateX(-50%)' }}>
          <Handle type="target" position={Position.Bottom} id="target-bottom" className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 cursor-crosshair z-10" />
          <Handle type="source" position={Position.Bottom} id="source-bottom" className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 cursor-crosshair z-10" />
        </div>

        {/* Left */}
        <div style={{ position: 'absolute', left: '-2px', top: '50%', transform: 'translateY(-50%)' }}>
          <Handle type="target" position={Position.Left} id="in-left" className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 cursor-crosshair z-10" />
          <Handle type="source" position={Position.Left} id="source-left" className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 cursor-crosshair z-10" />
        </div>

        {/* Right */}
        <div style={{ position: 'absolute', right: '-2px', top: '50%', transform: 'translateY(-50%)' }}>
          <Handle type="target" position={Position.Right} id="target-right" className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 cursor-crosshair z-10" />
          <Handle type="source" position={Position.Right} id="out-right" className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 cursor-crosshair z-10" />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. CIRCULAR SUB-NODE (Tool / Memory / Model Nodes)
  // ─────────────────────────────────────────────────────────────────────────
  if (isCircular) {
    const colorTheme = getNodeColorTheme(data.type, data.icon);
    return (
      <div
        onClick={() => data.onSelect?.(data.id)}
        className="flex flex-col items-center group select-none cursor-pointer"
      >
        {data.portLabel && (
          <span className="text-[9px] text-[var(--text-dim)] font-mono mb-1 tracking-wider uppercase">
            {data.portLabel}
          </span>
        )}

        <div className="relative">
          {/* Top Target Handle */}
          <Handle
            type="target"
            position={Position.Top}
            id="top"
            className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-top-3 cursor-crosshair z-10"
          />

          <div
            className={cn(
              "w-13 h-13 rounded-full flex items-center justify-center transition-all border",
              colorTheme,
              selected
                ? "ring-2 ring-[var(--text-primary)] border-[var(--text-primary)] scale-105"
                : "hover:scale-105 hover:border-[var(--text-primary)]",
              !isActive && "opacity-60 grayscale"
            )}
          >
            {getIconElement(data.type, data.icon)}
          </div>
        </div>

        <p className="text-[10px] font-medium text-[var(--text-primary)] text-center mt-1.5 max-w-[100px] leading-tight truncate">
          {data.title}
        </p>
        <p className="text-[9px] text-[var(--text-dim)] font-mono truncate max-w-[100px]">
          {data.type}
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. STANDARD ACTION / DOCUMENT / KNOWLEDGE CARD NODE (Seamless Omnidirectional Ports)
  // ─────────────────────────────────────────────────────────────────────────
  const colorTheme = getNodeColorTheme(data.type, data.icon);

  return (
    <div
      onClick={() => data.onSelect?.(data.id)}
      className={cn(
        "relative group p-2 pr-4 pl-2 rounded-2xl bg-[var(--bg-card)] border transition-all select-none cursor-pointer flex flex-row items-center gap-3 min-w-[130px] max-w-[200px]",
        selected
          ? "border-[var(--text-primary)] ring-2 ring-[var(--text-primary)]/20"
          : "border-[var(--border-strong)] hover:border-[var(--text-primary)]",
        !isActive && "opacity-60 grayscale"
      )}
    >
      {/* 4-Directional Clean Connection Ports (Seamless & Invisible by default) */}
      <Handle
        type="target"
        position={Position.Left}
        id="in-left"
        className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-left-3 cursor-crosshair z-10"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="out-left"
        className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-left-3 cursor-crosshair z-10"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="in-right"
        className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-right-3 cursor-crosshair z-10"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out-right"
        className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-right-3 cursor-crosshair z-10"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="in-top"
        className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-top-3 cursor-crosshair z-10"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="out-top"
        className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-top-3 cursor-crosshair z-10"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="in-bottom"
        className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-bottom-3 cursor-crosshair z-10"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-bottom"
        className="!w-6 !h-6 !bg-transparent !border-0 opacity-0 hover:!opacity-100 hover:!bg-[var(--text-primary)]/15 hover:!border hover:!border-[var(--text-primary)] !rounded-full !transition-all !-bottom-3 cursor-crosshair z-10"
      />

      {/* Left Icon Box */}
      <div
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 border shrink-0",
          colorTheme
        )}
      >
        {getIconElement(data.type, data.icon)}
      </div>

      {/* Node Title & Subtitle side-by-side */}
      <div className="flex flex-col text-left overflow-hidden">
        <h3 className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
          {data.title}
        </h3>
        <p className="text-[9px] text-[var(--text-muted)] font-mono truncate mt-0.5">
          {data.type || "Document"}
        </p>
      </div>
    </div>
  );
});

