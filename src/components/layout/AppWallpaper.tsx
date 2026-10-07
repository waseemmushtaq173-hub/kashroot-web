'use client';

/**
 * AppWallpaper — dynamic premium base for the entire app.
 * Fixed SVG art + per-theme mesh gradients + slow-drifting orbs + film grain.
 * pointer-events-none and aria-hidden so it never blocks content or AT.
 */
export function AppWallpaper() {
  return (
    <div aria-hidden="true" className="kr-wallpaper">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/wallpaper-kashmir.svg"
        alt=""
        className="kr-wallpaper__img"
        draggable={false}
      />
      <div className="kr-wallpaper__mesh" />
      <span className="kr-wallpaper__orb kr-wallpaper__orb--a" />
      <span className="kr-wallpaper__orb kr-wallpaper__orb--b" />
      <span className="kr-wallpaper__orb kr-wallpaper__orb--c" />
      <div className="kr-wallpaper__grain" />
    </div>
  );
}
