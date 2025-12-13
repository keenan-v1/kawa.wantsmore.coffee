// Formatting utilities for the application

import localizedMaterials from './materials.json'
import type { CommodityCategory } from '@kawakawa/types'

/**
 * Fetches the en-US localized name of the commodity for now.
 */
export function localizeMaterial(materialName: string): string {
  if (!materialName) return materialName
  return localizedMaterials.find(o => o.material === materialName)?.name ?? materialName
}

export function localizeMaterialCategory(categoryName: CommodityCategory): string {
  if (!categoryName) return categoryName
  return categories[categoryName]
}

const categories: Record<CommodityCategory, string> = {
  'agricultural products': 'Agricultural Products',
  alloys: 'Alloys',
  chemicals: 'Chemicals',
  'construction materials': 'Construction Materials',
  'construction parts': 'Construction Parts',
  'construction prefabs': 'Construction Prefabs',
  'consumable bundles': 'Consumable Bundles',
  'consumables (basic)': 'Consumables (basic)',
  'consumables (luxury)': 'Consumables (luxury)',
  drones: 'Drones',
  'electronic devices': 'Electronic Devices',
  'electronic parts': 'Electronic Parts',
  'electronic pieces': 'Electronic Pieces',
  'electronic systems': 'Electronic Systems',
  elements: 'Elements',
  'energy systems': 'Energy Systems',
  fuels: 'Fuels',
  gases: 'Gases',
  infrastructure: 'Infrastructure',
  liquids: 'Liquids',
  'medical equipment': 'Medical Equipment',
  metals: 'Metals',
  minerals: 'Minerals',
  ores: 'Ores',
  plastics: 'Plastics',
  'ship engines': 'Ship Engines',
  'ship kits': 'Ship Kits',
  'ship parts': 'Ship Parts',
  'ship shields': 'Ship Shields',
  'software components': 'Software Components',
  'software systems': 'Software Systems',
  'software tools': 'Software Tools',
  textiles: 'Textiles',
  'unit prefabs': 'Unit Prefabs',
  utility: 'Utility',
}
