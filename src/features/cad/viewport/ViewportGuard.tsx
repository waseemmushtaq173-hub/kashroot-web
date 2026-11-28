'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
  /** Bumped on each remount: a new key gives a brand-new canvas and WebGL context. */
  attempt: number;
}

const AUTO_RETRY_MS = 350;

/**
 * Keeps a 3D failure inside the viewport. The toolbar, model tree and
 * properties stay usable. The first failure retries once by itself; a second
 * one shows what went wrong and a button to try again.
 */
export class ViewportGuard extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[cad] 3D view failed', error, info.componentStack);
    // Only the very first failure retries by itself.
    if (this.state.attempt === 0) this.timer = setTimeout(this.retry, AUTO_RETRY_MS);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  retry = () => {
    this.timer = null;
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.failed) {
      const waiting = this.state.attempt === 0;
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-kr-neutral-50 p-6" role="alert">
          {waiting ? (
            <p className="text-sm text-ink-soft">Opening the 3D view…</p>
          ) : (
            <div className="max-w-sm space-y-3 text-center">
              <p className="font-semibold text-ink">The 3D view could not start.</p>
              <p className="text-sm text-ink-soft">
                This usually means WebGL is turned off or not supported in this browser. Try another browser, or turn on hardware acceleration in this
                browser&apos;s settings.
              </p>
              <button type="button" onClick={this.retry} className="rounded-md border border-forest-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:border-forest">
                Try again
              </button>
            </div>
          )}
        </div>
      );
    }
    return <div key={this.state.attempt} className="absolute inset-0">{this.props.children}</div>;
  }
}
