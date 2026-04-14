"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render errors in any child component so one broken chart
 * doesn't blank the entire page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Component crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "32px",
          textAlign: "center",
          color: "var(--text-3)",
          fontSize: "13px",
        }}>
          Failed to load this section.{" "}
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{ color: "var(--green)", background: "none", border: "none", cursor: "pointer", fontSize: "13px" }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
