/**
 * XIT ACT JSON Parser
 *
 * Parses XIT ACT format used by PRUNplanner and similar tools.
 * Extracts material requirements from groups and aggregates them.
 */

/**
 * Map of commodity ticker to quantity
 */
export interface XitMaterials {
  [ticker: string]: number
}

/**
 * A group within the XIT JSON containing materials
 */
export interface XitGroup {
  type?: string
  name?: string
  materials: XitMaterials
}

/**
 * Full XIT JSON structure
 */
export interface XitJson {
  actions?: unknown[]
  global?: { name?: string }
  groups: XitGroup[]
}

/**
 * Successful parse result with aggregated materials
 */
export interface XitParseResult {
  success: true
  /** Aggregated materials across all groups */
  materials: XitMaterials
  /** Name from global.name if present */
  name?: string
}

/**
 * Failed parse result with error message
 */
export interface XitParseError {
  success: false
  error: string
}

/**
 * Quick check if a string looks like XIT JSON.
 * Does not validate the full structure, just checks basic shape.
 */
export function isXitJson(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed.startsWith('{')) return false

  try {
    const parsed = JSON.parse(trimmed)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray(parsed.groups) &&
      parsed.groups.length > 0 &&
      parsed.groups.some(
        (g: unknown) =>
          typeof g === 'object' &&
          g !== null &&
          'materials' in g &&
          typeof (g as XitGroup).materials === 'object'
      )
    )
  } catch {
    return false
  }
}

/**
 * Aggregate materials from multiple groups into a single map.
 * If the same ticker appears in multiple groups, quantities are summed.
 */
export function aggregateMaterials(groups: XitGroup[]): XitMaterials {
  const result: XitMaterials = {}

  for (const group of groups) {
    if (!group.materials || typeof group.materials !== 'object') continue

    for (const [ticker, quantity] of Object.entries(group.materials)) {
      if (typeof quantity !== 'number' || quantity <= 0) continue
      result[ticker] = (result[ticker] ?? 0) + quantity
    }
  }

  return result
}

/**
 * Parse XIT JSON string and return aggregated materials.
 */
export function parseXitJson(input: string): XitParseResult | XitParseError {
  const trimmed = input.trim()

  if (!trimmed.startsWith('{')) {
    return { success: false, error: 'Input is not JSON' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    return {
      success: false,
      error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { success: false, error: 'JSON is not an object' }
  }

  const obj = parsed as Record<string, unknown>

  if (!Array.isArray(obj.groups)) {
    return { success: false, error: 'Missing or invalid "groups" array' }
  }

  if (obj.groups.length === 0) {
    return { success: false, error: 'No groups found' }
  }

  // Validate at least one group has materials
  const hasValidGroup = obj.groups.some(
    (g: unknown) =>
      typeof g === 'object' &&
      g !== null &&
      'materials' in g &&
      typeof (g as XitGroup).materials === 'object'
  )

  if (!hasValidGroup) {
    return { success: false, error: 'No groups with valid materials found' }
  }

  const materials = aggregateMaterials(obj.groups as XitGroup[])

  if (Object.keys(materials).length === 0) {
    return { success: false, error: 'No valid materials found in groups' }
  }

  const global = obj.global as { name?: string } | undefined
  const name = typeof global?.name === 'string' ? global.name : undefined

  return {
    success: true,
    materials,
    name,
  }
}
