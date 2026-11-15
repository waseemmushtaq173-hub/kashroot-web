'use client';

/**
 * A guard round the 3D views: three.js, WebGL and the dynamic import itself
 * can fail on an odd phone or a flaky network, and such a hiccup must never
 * take the whole portal down to "Something went wrong!". This small class
 * boundary catches anything thrown while a 3D view mounts or renders, logs
 * it, and shows a quiet panel with a retry — the Drawing right beside it
 * still shows the very same store, so nobody is left with nothing.
 *
 * The FIRST failure never reaches the human: the guard automatically
 * remounts the view from scratch ~350 ms later (a fresh key: a brand-new
 * canvas, a brand-new WebGL context, no memory of the failed one) while a
 * quiet "Opening the 3D view…" note holds the space. Only a second failure
 * brings the manual panel with "Try the 3D view again".
 */
import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: string | null;
  /** Bumped on every remount: the new key tears the whole 3D subtree down and mounts it clean. */
  tries: number;
}

/** How long the automatic remount waits after the first failure. */
const AUTO_RETRY_MS = 350;

export class Guard3D extends Component<Props, State> {
  state: State = { failed: null, tries: 0 };
  /** Automatic retries spent (one): kept off state, it only drives behaviour. */
  private auto = 0;
  /** Non-null while the automatic remount is scheduled. */
  private timer: number | null = null;

  static getDerivedStateFromError(err: unknown): Partial<State> {
    return { failed: err instanceof Error ? err.message : 'The 3D view could not open.' };
  }

  componentDidCatch(err: unknown, info: ErrorInfo) {
    console.error('3D view failed:', err instanceof Error ? err.message : err, info.componentStack);
    // The one automatic retry: remount clean ~350 ms after the first
    // failure — a one-off WebGL hiccup (a context lost under memory
    // pressure, a slow dynamic import) almost always clears on a fresh
    // mount, and the human never sees an error at all.
    if (this.auto === 0 && this.timer === null) {
      this.timer = window.setTimeout(() => {
        this.timer = null;
        this.auto = 1;
        this.setState((s) => ({ failed: null, tries: s.tries + 1 }));
      }, AUTO_RETRY_MS);
    }
  }

  componentWillUnmount() {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  render() {
    if (this.state.failed) {
      if (this.timer !== null) {
        // The automatic remount is on its way: hold the space quietly.
        return (
          <div role="status" className="grid place-items-center gap-2 rounded-3xl bg-slate-50 p-8 text-center ring-1 ring-slate-900/10">
            <p className="text-sm font-semibold text-slate-700">Opening the 3D view…</p>
          </div>
        );
      }
      return (
        <div role="alert" className="grid place-items-center gap-2 rounded-3xl bg-slate-50 p-8 text-center ring-1 ring-slate-900/10">
          <p className="text-sm font-semibold text-slate-700">The 3D view could not open just now.</p>
          <p className="max-w-md text-xs text-slate-500">The Drawing shows the same store — and you can try the 3D view again at once.</p>
          <button
            type="button"
            onClick={() => this.setState((s) => ({ failed: null, tries: s.tries + 1 }))}
            className="min-h-10 cursor-pointer rounded-xl bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-900"
          >
            Try the 3D view again
          </button>
        </div>
      );
    }
    return <Fragment key={this.state.tries}>{this.props.children}</Fragment>;
  }
}
