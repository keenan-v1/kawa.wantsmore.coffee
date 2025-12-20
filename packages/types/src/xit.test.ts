import { describe, expect, it } from 'vitest'
import { aggregateMaterials, isXitJson, parseXitJson } from './xit'

const VALID_XIT_JSON = `{
  "actions": [{"type": "MTRA", "name": "TransferAction"}],
  "global": {"name": "PRUNplanner Construct"},
  "groups": [
    {
      "type": "Manual",
      "name": "A1",
      "materials": {"HSE": 26, "LDE": 76, "LSE": 28, "RSE": 4, "RTA": 8}
    }
  ]
}`

const MULTI_GROUP_XIT_JSON = `{
  "global": {"name": "Multi-Group Build"},
  "groups": [
    {"name": "A1", "materials": {"HSE": 10, "LDE": 20}},
    {"name": "A2", "materials": {"HSE": 5, "COF": 100}}
  ]
}`

describe('isXitJson', () => {
  it('returns true for valid XIT JSON', () => {
    expect(isXitJson(VALID_XIT_JSON)).toBe(true)
  })

  it('returns true for minimal valid XIT JSON', () => {
    const minimal = '{"groups":[{"materials":{"RAT":10}}]}'
    expect(isXitJson(minimal)).toBe(true)
  })

  it('returns false for non-JSON strings', () => {
    expect(isXitJson('hello world')).toBe(false)
    expect(isXitJson('COF BEN')).toBe(false)
    expect(isXitJson('')).toBe(false)
  })

  it('returns false for JSON without groups', () => {
    expect(isXitJson('{"foo": "bar"}')).toBe(false)
    expect(isXitJson('{"actions": []}')).toBe(false)
  })

  it('returns false for JSON with empty groups', () => {
    expect(isXitJson('{"groups": []}')).toBe(false)
  })

  it('returns false for JSON with groups but no materials', () => {
    expect(isXitJson('{"groups": [{"name": "A1"}]}')).toBe(false)
  })

  it('handles whitespace around input', () => {
    expect(isXitJson(`  ${VALID_XIT_JSON}  `)).toBe(true)
  })
})

describe('aggregateMaterials', () => {
  it('aggregates materials from a single group', () => {
    const groups = [{ materials: { HSE: 26, LDE: 76 } }]
    expect(aggregateMaterials(groups)).toEqual({ HSE: 26, LDE: 76 })
  })

  it('sums quantities for same ticker across groups', () => {
    const groups = [{ materials: { HSE: 10, LDE: 20 } }, { materials: { HSE: 5, COF: 100 } }]
    expect(aggregateMaterials(groups)).toEqual({ HSE: 15, LDE: 20, COF: 100 })
  })

  it('ignores groups without materials', () => {
    const groups = [{ name: 'Empty' }, { materials: { RAT: 50 } }] as Array<{
      materials?: Record<string, number>
    }>
    expect(aggregateMaterials(groups)).toEqual({ RAT: 50 })
  })

  it('ignores zero and negative quantities', () => {
    const groups = [{ materials: { RAT: 50, COF: 0, DW: -10 } }]
    expect(aggregateMaterials(groups)).toEqual({ RAT: 50 })
  })

  it('ignores non-number values', () => {
    const groups = [{ materials: { RAT: 50, BAD: 'invalid' as unknown as number } }]
    expect(aggregateMaterials(groups)).toEqual({ RAT: 50 })
  })

  it('returns empty object for empty groups array', () => {
    expect(aggregateMaterials([])).toEqual({})
  })
})

describe('parseXitJson', () => {
  it('parses valid XIT JSON and aggregates materials', () => {
    const result = parseXitJson(VALID_XIT_JSON)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.materials).toEqual({ HSE: 26, LDE: 76, LSE: 28, RSE: 4, RTA: 8 })
      expect(result.name).toBe('PRUNplanner Construct')
    }
  })

  it('parses multi-group XIT JSON and sums materials', () => {
    const result = parseXitJson(MULTI_GROUP_XIT_JSON)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.materials).toEqual({ HSE: 15, LDE: 20, COF: 100 })
      expect(result.name).toBe('Multi-Group Build')
    }
  })

  it('parses XIT JSON without global name', () => {
    const json = '{"groups":[{"materials":{"RAT":10}}]}'
    const result = parseXitJson(json)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.materials).toEqual({ RAT: 10 })
      expect(result.name).toBeUndefined()
    }
  })

  it('returns error for non-JSON input', () => {
    const result = parseXitJson('COF BEN')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Input is not JSON')
    }
  })

  it('returns error for invalid JSON syntax', () => {
    const result = parseXitJson('{"groups": [}')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Invalid JSON')
    }
  })

  it('returns error for missing groups array', () => {
    const result = parseXitJson('{"foo": "bar"}')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Missing or invalid "groups" array')
    }
  })

  it('returns error for empty groups array', () => {
    const result = parseXitJson('{"groups": []}')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('No groups found')
    }
  })

  it('returns error for groups without materials', () => {
    const result = parseXitJson('{"groups": [{"name": "A1"}]}')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('No groups with valid materials found')
    }
  })

  it('returns error when all materials have zero quantities', () => {
    const result = parseXitJson('{"groups": [{"materials": {"RAT": 0}}]}')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('No valid materials found in groups')
    }
  })

  it('handles whitespace in input', () => {
    const result = parseXitJson(`\n  ${VALID_XIT_JSON}\n  `)
    expect(result.success).toBe(true)
  })
})
