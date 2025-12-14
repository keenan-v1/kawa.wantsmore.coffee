/**
 * Modal builder utilities for Discord bot commands
 */
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js'

/**
 * Options for creating a quantity + notes modal
 */
export interface QuantityNotesModalOptions {
  /** Custom ID for the modal */
  modalId: string
  /** Modal title */
  title: string
  /** Maximum allowed quantity */
  maxQuantity: number
  /** Custom label for quantity field (default: "Quantity (max {maxQuantity})") */
  quantityLabel?: string
  /** Placeholder text for notes field */
  notesPlaceholder?: string
}

/**
 * Create a modal with quantity and optional notes inputs.
 * Commonly used for reserve/fill operations.
 *
 * @param options - Modal configuration options
 * @returns Configured ModalBuilder
 *
 * @example
 * ```typescript
 * const modal = createQuantityNotesModal({
 *   modalId: `reserve-modal:${Date.now()}`,
 *   title: 'Reserve COF',
 *   maxQuantity: 100,
 *   notesPlaceholder: 'Any message for the seller',
 * })
 * await interaction.showModal(modal)
 * ```
 */
export function createQuantityNotesModal(options: QuantityNotesModalOptions): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(options.modalId).setTitle(options.title)

  const quantityInput = new TextInputBuilder()
    .setCustomId('quantity')
    .setLabel(options.quantityLabel ?? `Quantity (max ${options.maxQuantity})`)
    .setPlaceholder(options.maxQuantity.toString())
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10)

  const notesInput = new TextInputBuilder()
    .setCustomId('notes')
    .setLabel('Notes (optional)')
    .setPlaceholder(options.notesPlaceholder ?? 'Any additional notes')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500)

  return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput)
  )
}

/**
 * Options for creating a single text input modal
 */
export interface SingleInputModalOptions {
  /** Custom ID for the modal */
  modalId: string
  /** Modal title */
  title: string
  /** Input field custom ID */
  inputId: string
  /** Input field label */
  label: string
  /** Placeholder text */
  placeholder?: string
  /** Input style (Short or Paragraph) */
  style?: TextInputStyle
  /** Whether the field is required */
  required?: boolean
  /** Maximum length */
  maxLength?: number
  /** Minimum length */
  minLength?: number
  /** Default value */
  value?: string
}

/**
 * Create a modal with a single text input.
 *
 * @param options - Modal configuration options
 * @returns Configured ModalBuilder
 */
export function createSingleInputModal(options: SingleInputModalOptions): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(options.modalId).setTitle(options.title)

  const input = new TextInputBuilder()
    .setCustomId(options.inputId)
    .setLabel(options.label)
    .setStyle(options.style ?? TextInputStyle.Short)
    .setRequired(options.required ?? true)

  if (options.placeholder) {
    input.setPlaceholder(options.placeholder)
  }
  if (options.maxLength) {
    input.setMaxLength(options.maxLength)
  }
  if (options.minLength) {
    input.setMinLength(options.minLength)
  }
  if (options.value) {
    input.setValue(options.value)
  }

  return modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))
}
