import type { CommodityCategory } from '@kawakawa/types'

/** Hex color (without #) for each commodity category */
export const categoryColors: Record<CommodityCategory, string> = {
  'agricultural products': 'b22222',
  alloys: 'cd7f32',
  chemicals: 'db7093',
  'construction materials': '6495ed',
  'construction parts': '4682b4',
  'construction prefabs': '1c39bb',
  'consumable bundles': '971728',
  'consumables (basic)': 'cd5c5c',
  'consumables (luxury)': 'da2c43',
  drones: 'e25822',
  'electronic devices': '8a2be2',
  'electronic parts': '9370db',
  'electronic pieces': 'b19cd9',
  'electronic systems': '663399',
  elements: '806043',
  'energy systems': '2e8b57',
  fuels: '32cd32',
  gases: '00ced1',
  infrastructure: '1e1e8c',
  liquids: 'bcd4e6',
  'medical equipment': '99cc99',
  metals: '696969',
  minerals: 'c4a484',
  ores: '838996',
  plastics: 'cb3365',
  'ship engines': 'ff4500',
  'ship kits': 'ff8c00',
  'ship parts': 'ffa500',
  'ship shields': 'ffb347',
  'software components': 'c5b358',
  'software systems': '9b870c',
  'software tools': 'daa520',
  textiles: '96a53c',
  'unit prefabs': '534b4f',
  utility: 'cec7c1',
}

const DEFAULT_COLOR = '808080'

function hexToRgb(hex: string): [number, number, number] {
  const num = parseInt(hex.replace('#', ''), 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map(x =>
        Math.max(0, Math.min(255, Math.round(x)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

/**
 * Adjust brightness of a hex color.
 * Positive percent brightens (moves toward white), negative darkens (moves toward black).
 */
function adjustBrightness(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex)
  const factor = percent / 100

  if (percent > 0) {
    // Brighten: interpolate toward white (255)
    return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor)
  } else {
    // Darken: interpolate toward black (0)
    return rgbToHex(r * (1 + factor), g * (1 + factor), b * (1 + factor))
  }
}

export interface PrunIconStyles {
  background: string
  color: string
}

/**
 * Get the PRUN-style gradient background and text color for a category.
 * Mimics the original game's material icon styling.
 */
export function getPrunIconStyles(category: string | undefined): PrunIconStyles {
  const baseHex = categoryColors[category as CommodityCategory] ?? DEFAULT_COLOR

  return {
    background: `linear-gradient(135deg, ${adjustBrightness(baseHex, -20)}, ${adjustBrightness(baseHex, 10)})`,
    color: adjustBrightness(baseHex, 40),
  }
}
