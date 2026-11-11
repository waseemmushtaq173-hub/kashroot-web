'use client';

/**
 * A guard round the 3D views: three.js, WebGL and the dynamic import itself
 * can fail on an odd phone or a flaky network, and such a hiccup must never
 * take the whole portal down to "Something went wrong!". This small class
 * boundary catches anything thrown while a 3D view mounts or renders, logs
 * it, and shows a quiet panel with a retry — the Drawing right beside it
 * still shows the very same store, so nobody is left with nothing.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: string | null;
}

export class Guard3D extends Component<Props, State> {
  state: State = { failed: null };

  static getDerivedStateFromError(err: unknown): State {
    return { failed: err instanceof Error ? err.message : 'The 3D view could not open.' };
  }

  componentDidCatch(err: unknown, info: ErrorInfo) {
    console.error('3D view failed:', err instanceof Error ? err.message : err, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="grid place-items-center gap-2 rounded-3xl bg-slate-50 p-8 text-center ring-1 ring-slate-900/10">
          <p className="text-sm font-semibold text-slate-700">The 3D view could not open just now.</p>
          <p className="max-w-md text-xs text-slate-500">The Drawing shows the same store — and you can try the 3D view again at once.</p>
          <button
            type="button"
            onClick={() => this.setState({ failed: null })}
            className="min-h-10 cursor-pointer rounded-xl bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-900"
          >
            Try the 3D view again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
