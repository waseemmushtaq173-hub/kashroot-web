/**
 * Viewport colours. Kashroot's indigo marks hover and selection; axes use
 * the usual CAD convention (X red, Y green, Z blue).
 */
export const VIEWPORT_COLORS = {
  background: '#F3F4F8',
  gridCell: '#CDD0DE',
  gridSection: '#A3A8C2',
  axisX: '#D1453B',
  axisY: '#2F9E44',
  axisZ: '#2563EB',
  datum: '#8087AD',
  datumHover: '#6358E0',
  datumSelected: '#3730A3',
} as const;

/** Name of the group "Fit view" frames. Everything that belongs to the model goes inside it. */
export const FIT_ROOT_NAME = 'cad-fit-root';

/** A press that moves further than this before release is an orbit or pan, not a click. */
export const CLICK_TOLERANCE_PX = 4;
