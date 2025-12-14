/**
 * Discord component builder utilities
 */
import { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

/**
 * Option for a select menu
 */
export interface SelectMenuOption {
  /** Display label */
  label: string
  /** Value sent when selected */
  value: string
  /** Optional description */
  description?: string
  /** Optional emoji */
  emoji?: string
  /** Whether this option is selected by default */
  default?: boolean
}

/**
 * Options for creating a select menu
 */
export interface CreateSelectMenuOptions {
  /** Custom ID for the select menu */
  customId: string
  /** Placeholder text when nothing is selected */
  placeholder: string
  /** Menu options */
  options: SelectMenuOption[]
  /** Minimum values to select (default: 1) */
  minValues?: number
  /** Maximum values to select (default: 1) */
  maxValues?: number
  /** Whether the menu is disabled */
  disabled?: boolean
}

/**
 * Create a select menu in an action row.
 *
 * @param options - Select menu configuration
 * @returns ActionRowBuilder containing the select menu
 *
 * @example
 * ```typescript
 * const selectRow = createSelectMenu({
 *   customId: 'order-select',
 *   placeholder: 'Select an order',
 *   options: orders.map(o => ({
 *     label: `${o.commodity} @ ${o.location}`,
 *     value: `order:${o.id}`,
 *     description: `${o.price} ${o.currency}`,
 *   })),
 * })
 * await interaction.reply({ components: [selectRow] })
 * ```
 */
export function createSelectMenu(
  options: CreateSelectMenuOptions
): ActionRowBuilder<StringSelectMenuBuilder> {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(options.customId)
    .setPlaceholder(options.placeholder)
    .setMinValues(options.minValues ?? 1)
    .setMaxValues(options.maxValues ?? 1)

  if (options.disabled) {
    selectMenu.setDisabled(true)
  }

  // Add options with proper typing
  selectMenu.addOptions(
    options.options.map(opt => ({
      label: opt.label,
      value: opt.value,
      description: opt.description,
      emoji: opt.emoji,
      default: opt.default,
    }))
  )

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
}

/**
 * Options for creating a button
 */
export interface CreateButtonOptions {
  /** Custom ID for the button */
  customId: string
  /** Button label text */
  label: string
  /** Button style */
  style?: ButtonStyle
  /** Optional emoji */
  emoji?: string
  /** Whether the button is disabled */
  disabled?: boolean
}

/**
 * Create a button builder.
 *
 * @param options - Button configuration
 * @returns Configured ButtonBuilder
 */
export function createButton(options: CreateButtonOptions): ButtonBuilder {
  const button = new ButtonBuilder()
    .setCustomId(options.customId)
    .setLabel(options.label)
    .setStyle(options.style ?? ButtonStyle.Primary)

  if (options.emoji) {
    button.setEmoji(options.emoji)
  }
  if (options.disabled) {
    button.setDisabled(true)
  }

  return button
}

/**
 * Create an action row with buttons.
 *
 * @param buttons - Array of button configurations
 * @returns ActionRowBuilder containing the buttons
 */
export function createButtonRow(buttons: CreateButtonOptions[]): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>()
  for (const options of buttons) {
    row.addComponents(createButton(options))
  }
  return row
}
