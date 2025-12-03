// Formatting utilities for the application

import localizedMaterials from './materials.json'

/**
 * Fetches the en-US localized name of the commodity for now.
 */
export function localizeMaterial(materialName: string): string {
  if (!materialName) return materialName
  return localizedMaterials.find(o => o.material === materialName)?.name ?? materialName
}
