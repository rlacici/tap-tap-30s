/** Spawn anchors on user-mouth-background.png (0–100% of play board). */

export type ToothKind = 'molar' | 'premolar' | 'canine' | 'incisor' | 'tongue'

export type ToothAnchor = {
  id: string
  x: number
  y: number
  arch: 'upper' | 'lower' | 'tongue'
  kind: ToothKind
}

/**
 * Upper arch near top, lower near bottom — on tooth surfaces of the user BG.
 * Tongue anchors sit on the visible tongue mid-board.
 * 36 fixed % points for spawn variety (outer molars inset).
 */
export const TOOTH_ANCHORS: ToothAnchor[] = [
  // Upper (15)
  { id: 'u-mol-0', x: 7.3, y: 19.0, arch: 'upper', kind: 'molar' },
  { id: 'u-mol-1', x: 12.0, y: 18.5, arch: 'upper', kind: 'molar' },
  { id: 'u-pre-2', x: 17.7, y: 11.6, arch: 'upper', kind: 'premolar' },
  { id: 'u-pre-2b', x: 21.5, y: 9.8, arch: 'upper', kind: 'premolar' },
  { id: 'u-pre-3', x: 25.3, y: 8.1, arch: 'upper', kind: 'premolar' },
  { id: 'u-can-4', x: 29.8, y: 6.5, arch: 'upper', kind: 'canine' },
  { id: 'u-inc-5', x: 36.2, y: 6.0, arch: 'upper', kind: 'incisor' },
  { id: 'u-inc-6', x: 42.7, y: 5.4, arch: 'upper', kind: 'incisor' },
  { id: 'u-inc-7', x: 56.4, y: 5.4, arch: 'upper', kind: 'incisor' },
  { id: 'u-inc-7b', x: 63.0, y: 6.0, arch: 'upper', kind: 'incisor' },
  { id: 'u-can-8', x: 69.7, y: 6.5, arch: 'upper', kind: 'canine' },
  { id: 'u-pre-9', x: 74.5, y: 8.1, arch: 'upper', kind: 'premolar' },
  { id: 'u-pre-9b', x: 78.4, y: 9.8, arch: 'upper', kind: 'premolar' },
  { id: 'u-pre-10', x: 82.2, y: 11.6, arch: 'upper', kind: 'premolar' },
  { id: 'u-mol-11', x: 88.0, y: 18.5, arch: 'upper', kind: 'molar' },

  // Lower (15)
  { id: 'l-mol-1', x: 15.8, y: 82.6, arch: 'lower', kind: 'molar' },
  { id: 'l-pre-2', x: 18.6, y: 85.1, arch: 'lower', kind: 'premolar' },
  { id: 'l-pre-2b', x: 22.0, y: 86.9, arch: 'lower', kind: 'premolar' },
  { id: 'l-pre-3', x: 25.7, y: 88.8, arch: 'lower', kind: 'premolar' },
  { id: 'l-can-4', x: 29.7, y: 90.3, arch: 'lower', kind: 'canine' },
  { id: 'l-inc-5', x: 36.4, y: 90.5, arch: 'lower', kind: 'incisor' },
  { id: 'l-inc-6', x: 43.1, y: 91.7, arch: 'lower', kind: 'incisor' },
  { id: 'l-inc-6b', x: 49.5, y: 90.6, arch: 'lower', kind: 'incisor' },
  { id: 'l-inc-7', x: 56.6, y: 91.7, arch: 'lower', kind: 'incisor' },
  { id: 'l-inc-7b', x: 63.2, y: 90.5, arch: 'lower', kind: 'incisor' },
  { id: 'l-can-8', x: 69.8, y: 90.4, arch: 'lower', kind: 'canine' },
  { id: 'l-pre-9', x: 74.2, y: 88.7, arch: 'lower', kind: 'premolar' },
  { id: 'l-pre-9b', x: 77.5, y: 86.9, arch: 'lower', kind: 'premolar' },
  { id: 'l-pre-10', x: 81.3, y: 85.1, arch: 'lower', kind: 'premolar' },
  { id: 'l-mol-11', x: 84.0, y: 82.7, arch: 'lower', kind: 'molar' },

  // Tongue (6) — mid-mouth on the visible tongue of the user BG
  { id: 't-tip', x: 50.0, y: 58.5, arch: 'tongue', kind: 'tongue' },
  { id: 't-mid-left', x: 41.5, y: 62.5, arch: 'tongue', kind: 'tongue' },
  { id: 't-mid-right', x: 58.5, y: 62.5, arch: 'tongue', kind: 'tongue' },
  { id: 't-left', x: 38.0, y: 68.0, arch: 'tongue', kind: 'tongue' },
  { id: 't-center', x: 49.9, y: 70.0, arch: 'tongue', kind: 'tongue' },
  { id: 't-right', x: 61.9, y: 68.0, arch: 'tongue', kind: 'tongue' },
]
