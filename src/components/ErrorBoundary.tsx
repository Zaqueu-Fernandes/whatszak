import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  silent?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.silent) return null;
      return this.props.fallback ?? (
        <div style={{ padding: 20, textAlign: "center" }}>
          <h2>Algo deu errado</h2>
          <p style={{ color: "#666", fontSize: 14 }}>{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: "8px 16px", background: "#25D366", color: "#fff", border: "none", borderRadius: 8 }}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
