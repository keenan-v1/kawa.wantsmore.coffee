/**
 * Interaction utilities for Discord bot commands
 */
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  ButtonInteraction,
  Message,
} from 'discord.js'

/** Default modal timeout: 5 minutes */
export const MODAL_TIMEOUT = 5 * 60 * 1000

/** Default component timeout: 1 minute */
export const COMPONENT_TIMEOUT = 60 * 1000

/**
 * Await a modal submission with automatic timeout handling.
 *
 * @param interaction - The interaction that showed the modal
 * @param modalId - The custom ID of the modal to await
 * @param timeout - Timeout in milliseconds (default: 5 minutes)
 * @returns The modal submission interaction, or null if timed out/cancelled
 *
 * @example
 * ```typescript
 * await interaction.showModal(modal)
 * const submit = await awaitModal(interaction, modalId)
 * if (!submit) return // Modal was cancelled or timed out
 * ```
 */
export async function awaitModal(
  interaction: MessageComponentInteraction | ChatInputCommandInteraction,
  modalId: string,
  timeout: number = MODAL_TIMEOUT
): Promise<ModalSubmitInteraction | null> {
  return interaction
    .awaitModalSubmit({
      time: timeout,
      filter: (i: ModalSubmitInteraction) =>
        i.customId === modalId && i.user.id === interaction.user.id,
    })
    .catch(() => null)
}

/**
 * Await a message component interaction (button or select menu).
 *
 * @param message - The message containing the components
 * @param customId - The custom ID of the component to await
 * @param userId - The user ID to filter for
 * @param timeout - Timeout in milliseconds (default: 1 minute)
 * @returns The component interaction, or null if timed out
 */
export async function awaitComponent(
  message: Message,
  customId: string,
  userId: string,
  timeout: number = COMPONENT_TIMEOUT
): Promise<MessageComponentInteraction | null> {
  return message
    .awaitMessageComponent({
      filter: i => i.customId === customId && i.user.id === userId,
      time: timeout,
    })
    .catch(() => null)
}

/**
 * Await a select menu interaction.
 *
 * @param message - The message containing the select menu
 * @param customId - The custom ID of the select menu
 * @param userId - The user ID to filter for
 * @param timeout - Timeout in milliseconds (default: 1 minute)
 * @returns The select menu interaction, or null if timed out
 */
export async function awaitSelectMenu(
  message: Message,
  customId: string,
  userId: string,
  timeout: number = COMPONENT_TIMEOUT
): Promise<StringSelectMenuInteraction | null> {
  const interaction = await awaitComponent(message, customId, userId, timeout)
  if (interaction?.isStringSelectMenu()) {
    return interaction
  }
  return null
}

/**
 * Await a button interaction.
 *
 * @param message - The message containing the button
 * @param customId - The custom ID of the button
 * @param userId - The user ID to filter for
 * @param timeout - Timeout in milliseconds (default: 1 minute)
 * @returns The button interaction, or null if timed out
 */
export async function awaitButton(
  message: Message,
  customId: string,
  userId: string,
  timeout: number = COMPONENT_TIMEOUT
): Promise<ButtonInteraction | null> {
  const interaction = await awaitComponent(message, customId, userId, timeout)
  if (interaction?.isButton()) {
    return interaction
  }
  return null
}
