// Formatting utilities for the application

/**
 * Converts camelCase string to human-friendly spaced format
 * Examples:
 *   "basicStructurePanels" -> "Basic Structure Panels"
 *   "h2O" -> "H2 O"
 *   "polyEthylene" -> "Poly Ethylene"
 */
export function camelCaseToHumanReadable(input: string): string {
  if (!input) return input

  // Insert space before capital letters and numbers
  const spaced = input.replace(/([A-Z0-9])/g, ' $1')

  // Capitalize first letter and trim
  const result = spaced.charAt(0).toUpperCase() + spaced.slice(1)

  return result.trim()
}
