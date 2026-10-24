import { useState } from 'react';
import { Panel } from '@xyflow/react';
import { 
  Plus, 
  Search,
  Globe,
  ShieldCheck,
  Table2
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface KnowledgeToolbarProps {
  onAddNode: (type: string, x: number, y: number) => void;
  onUpload?: () => void;
}

export function KnowledgeToolbar({ onAddNode }: KnowledgeToolbarProps) {
  const [isAdding, setIsAdding] = useState(false);

  // Helper to place new nodes in the center of the viewport
  const handleAdd = (type: string) => {
    onAddNode(type, 0, 0);
    setIsAdding(false);
  };

  return (
    <Panel position="top-center" className="mt-4 pointer-events-auto">
      <div className="flex items-center gap-2 p-1.5 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-2xl shadow-xl">
        
        {/* Search */}
        <div className="relative w-48 hidden sm:block">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Search knowledge..."
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
          />
        </div>

        <div className="w-px h-6 bg-[var(--border-color)] mx-1 hidden sm:block" />

        {/* Add Actions */}
        <div className="relative">
          <button
            onClick={() => setIsAdding(!isAdding)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
              isAdding 
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)]"
                : "bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]"
            )}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Add Node</span>
          </button>

          {isAdding && (
            <div className="absolute top-full mt-2 right-0 w-52 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl p-1.5 flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-150 shadow-2xl">
              <button
                onClick={() => handleAdd('catalog')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-xl transition-colors cursor-pointer group"
              >
                <Globe className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" strokeWidth={1.5} />
                <span>Website / Catalog URL</span>
              </button>
              
              <button
                onClick={() => handleAdd('sheet')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-xl transition-colors cursor-pointer group"
              >
                <Table2 className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" strokeWidth={1.5} />
                <span>Price List / Stock URL</span>
              </button>

              <button
                onClick={() => handleAdd('rules')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-xl transition-colors cursor-pointer group"
              >
                <ShieldCheck className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" strokeWidth={1.5} />
                <span>SOP & Business Rules</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
