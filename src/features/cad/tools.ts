/**
 * Every toolbar tool, and the build phase it becomes usable in.
 *
 * A tool from a later phase is shown disabled with its phase number, never
 * as a button that pretends to work. Raise CURRENT_PHASE only when the
 * phase's tools are implemented and tested.
 */

export const CURRENT_PHASE = 1;

export type ToolId =
  | 'new'
  | 'open'
  | 'save'
  | 'export'
  | 'undo'
  | 'redo'
  | 'select'
  | 'sketch'
  | 'extrude'
  | 'revolve'
  | 'box'
  | 'cylinder'
  | 'union'
  | 'cut'
  | 'intersect'
  | 'measure'
  | 'fit'
  | 'grid'
  | 'axes'
  | 'settings';

export type ToolGroup = 'file' | 'edit' | 'create' | 'combine' | 'inspect' | 'view';

export interface ToolDef {
  id: ToolId;
  label: string;
  group: ToolGroup;
  /** The build phase that makes this tool work. */
  phase: number;
  /** What the tool does, shown as its tooltip. */
  hint: string;
  shortcut?: string;
}

export const TOOL_GROUP_LABELS: Record<ToolGroup, string> = {
  file: 'File',
  edit: 'Edit',
  create: 'Create',
  combine: 'Combine',
  inspect: 'Inspect',
  view: 'View',
};

export const TOOLS: readonly ToolDef[] = [
  { id: 'new', label: 'New', group: 'file', phase: 3, hint: 'Start a new, empty project.' },
  { id: 'open', label: 'Open', group: 'file', phase: 6, hint: 'Open a saved project.' },
  { id: 'save', label: 'Save', group: 'file', phase: 6, hint: 'Save this project to your account.' },
  { id: 'export', label: 'Export', group: 'file', phase: 6, hint: 'Download as STEP, STL, GLB or Kashroot JSON.' },
  { id: 'undo', label: 'Undo', group: 'edit', phase: 3, hint: 'Undo the last change.' },
  { id: 'redo', label: 'Redo', group: 'edit', phase: 3, hint: 'Redo the change you undid.' },
  { id: 'select', label: 'Select', group: 'edit', phase: 1, hint: 'Pick planes, and later faces, edges and features.', shortcut: 'Esc clears' },
  { id: 'sketch', label: 'Sketch', group: 'create', phase: 4, hint: 'Draw lines, rectangles, circles and arcs on a plane.' },
  { id: 'extrude', label: 'Extrude', group: 'create', phase: 4, hint: 'Push a sketch into a solid.' },
  { id: 'revolve', label: 'Revolve', group: 'create', phase: 4, hint: 'Spin a sketch round an axis into a solid.' },
  { id: 'box', label: 'Box', group: 'create', phase: 2, hint: 'Add a box from length, width and height.' },
  { id: 'cylinder', label: 'Cylinder', group: 'create', phase: 2, hint: 'Add a cylinder from radius and height.' },
  { id: 'union', label: 'Union', group: 'combine', phase: 4, hint: 'Join solids into one.' },
  { id: 'cut', label: 'Cut', group: 'combine', phase: 4, hint: 'Remove one solid from another.' },
  { id: 'intersect', label: 'Intersect', group: 'combine', phase: 4, hint: 'Keep only where solids overlap.' },
  { id: 'measure', label: 'Measure', group: 'inspect', phase: 4, hint: 'Measure distances, volume and area.' },
  { id: 'fit', label: 'Fit view', group: 'view', phase: 1, hint: 'Frame everything in the view.', shortcut: 'F' },
  { id: 'grid', label: 'Grid', group: 'view', phase: 1, hint: 'Show or hide the floor grid.', shortcut: 'G' },
  { id: 'axes', label: 'Axes', group: 'view', phase: 1, hint: 'Show or hide the X, Y and Z axes at the origin.' },
  { id: 'settings', label: 'Settings', group: 'view', phase: 1, hint: 'Grid spacing, snapping and what the view shows.' },
];

export function isToolAvailable(tool: ToolDef, phase: number = CURRENT_PHASE): boolean {
  return tool.phase <= phase;
}

export function toolById(id: ToolId): ToolDef {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown tool: ${id}`);
  return t;
}
