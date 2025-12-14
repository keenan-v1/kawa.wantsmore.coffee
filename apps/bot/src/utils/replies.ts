/**
 * Reply utilities for Discord bot commands
 */
import { MessageFlags } from 'discord.js'
import type {
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  MessageComponentInteraction,
  InteractionReplyOptions,
} from 'discord.js'

type RepliableInteraction =
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | MessageComponentInteraction

/**
 * Send an ephemeral error reply to the user.
 *
 * @param interaction - The Discord interaction
 * @param message - The error message (without emoji prefix)
 *
 * @example
 * ```typescript
 * await replyError(interaction, 'Invalid quantity. Please enter a positive number.')
 * return
 * ```
 */
export async function replyError(
  interaction: RepliableInteraction,
  message: string
): Promise<void> {
  await interaction.reply({
    content: `❌ ${message}`,
    flags: MessageFlags.Ephemeral,
  })
}

/**
 * Send an ephemeral success reply to the user.
 *
 * @param interaction - The Discord interaction
 * @param message - The success message (without emoji prefix)
 *
 * @example
 * ```typescript
 * await replySuccess(interaction, 'Order created successfully!')
 * ```
 */
export async function replySuccess(
  interaction: RepliableInteraction,
  message: string
): Promise<void> {
  await interaction.reply({
    content: `✅ ${message}`,
    flags: MessageFlags.Ephemeral,
  })
}

/**
 * Send an ephemeral info reply to the user.
 *
 * @param interaction - The Discord interaction
 * @param message - The info message (without emoji prefix)
 */
export async function replyInfo(interaction: RepliableInteraction, message: string): Promise<void> {
  await interaction.reply({
    content: `ℹ️ ${message}`,
    flags: MessageFlags.Ephemeral,
  })
}

/**
 * Send an ephemeral warning reply to the user.
 *
 * @param interaction - The Discord interaction
 * @param message - The warning message (without emoji prefix)
 */
export async function replyWarning(
  interaction: RepliableInteraction,
  message: string
): Promise<void> {
  await interaction.reply({
    content: `⚠️ ${message}`,
    flags: MessageFlags.Ephemeral,
  })
}

/**
 * Send a custom ephemeral reply to the user.
 *
 * @param interaction - The Discord interaction
 * @param options - The reply options (flags will be set to Ephemeral)
 */
export async function replyEphemeral(
  interaction: RepliableInteraction,
  options: Omit<InteractionReplyOptions, 'flags'>
): Promise<void> {
  await interaction.reply({
    ...options,
    flags: MessageFlags.Ephemeral,
  })
}
