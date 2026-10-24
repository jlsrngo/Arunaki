import { Component, ErrorInfo, ReactNode } from "react";
import { RotateCcw, AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  fullScreen?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught an unhandled error]:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const isFullScreen = this.props.fullScreen !== false;

      return (
        <div
          className={`flex flex-col items-center justify-center p-6 text-center select-none bg-[var(--bg-app)] text-[var(--text-primary)] ${
            isFullScreen ? "h-screen w-screen" : "h-full w-full min-h-[160px]"
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-center mb-3 text-amber-500 shadow-sm">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-semibold mb-1 text-[var(--text-primary)]">
            {this.props.fallbackTitle || "Something went wrong"}
          </h2>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mb-4 leading-relaxed">
            {this.state.error?.message || "An unexpected interface error occurred."}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-xs font-medium text-[var(--text-primary)] transition-colors cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reload & Recover</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
