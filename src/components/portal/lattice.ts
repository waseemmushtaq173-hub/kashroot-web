/**
 * Khatamband — the interlocking geometric lattice of carved walnut ceilings —
 * drawn as an 8-point star grid, used at very low opacity behind content.
 */
export const LATTICE_BG = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56' fill='none' stroke='%2378350f' stroke-width='0.8' stroke-opacity='0.11'%3E%3Cpath d='M28 4 L34 22 L52 28 L34 34 L28 52 L22 34 L4 28 L22 22 Z'/%3E%3Cpath d='M0 0 L12 12 M56 0 L44 12 M0 56 L12 44 M56 56 L44 44'/%3E%3Crect x='20' y='20' width='16' height='16' transform='rotate(45 28 28)'/%3E%3C/svg%3E")`,
  backgroundSize: '56px 56px',
} as const;
