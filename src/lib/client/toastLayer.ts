/**
 * Toasts above pop-up windows. A modal <dialog> (showModal) sits in the
 * browser's top layer, above everything else on the page — so a toast shown
 * while one is open was hidden behind it (on a phone the window covers the
 * whole screen). Each time a window opens, the toast area (sonner's section)
 * is put into the top layer too, as a manual popover shown after the window,
 * so toasts appear above it. Styles: globals.css (see-through, clicks pass
 * through except on the toasts).
 */
export function liftToasts(): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>('section[data-react-aria-top-layer][aria-live]');
  if (!el || typeof el.showPopover !== 'function') return;
  try {
    if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
    // Shown again so it lands above the window that just opened.
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  } catch {
    // An older browser: toasts stay where they were.
  }
}
