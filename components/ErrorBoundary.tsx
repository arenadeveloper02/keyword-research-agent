"use client"

import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryInner extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">
            The page hit an unexpected error. Reload to try again — past runs remain available in the History tab.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Reload page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function ErrorBoundary({ children }: ErrorBoundaryProps) {
  return <ErrorBoundaryInner>{children}</ErrorBoundaryInner>;
}
