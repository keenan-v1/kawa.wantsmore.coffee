/**
 * Embed builder utilities for Discord bot
 */
import { EmbedBuilder } from 'discord.js'

/**
 * Standard embed colors
 */
export const COLORS = {
  /** Green - success messages */
  SUCCESS: 0x57f287,
  /** Red - error messages */
  ERROR: 0xed4245,
  /** Yellow - warning messages */
  WARNING: 0xfee75c,
  /** Blue - info messages */
  INFO: 0x5865f2,
  /** Purple - neutral/default */
  DEFAULT: 0x9b59b6,
} as const

/**
 * Options for creating a success embed
 */
export interface SuccessEmbedOptions {
  /** Embed title */
  title: string
  /** Embed description */
  description: string
  /** Footer text */
  footer?: string
  /** Notes to add as a field */
  notes?: string
}

/**
 * Create a success embed with consistent styling.
 *
 * @param options - Embed configuration
 * @returns Configured EmbedBuilder
 *
 * @example
 * ```typescript
 * const embed = createSuccessEmbed({
 *   title: '📝 Reservation Created',
 *   description: 'You have reserved 50x COF from seller.',
 *   footer: 'Reservation #123',
 *   notes: 'Please deliver by Friday',
 * })
 * await interaction.reply({ embeds: [embed] })
 * ```
 */
export function createSuccessEmbed(options: SuccessEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(options.title)
    .setColor(COLORS.SUCCESS)
    .setDescription(options.description)
    .setTimestamp()

  if (options.footer) {
    embed.setFooter({ text: options.footer })
  }

  if (options.notes) {
    embed.addFields({ name: 'Your Notes', value: options.notes, inline: false })
  }

  return embed
}

/**
 * Options for creating an error embed
 */
export interface ErrorEmbedOptions {
  /** Embed title */
  title: string
  /** Embed description */
  description: string
  /** Footer text */
  footer?: string
}

/**
 * Create an error embed with consistent styling.
 *
 * @param options - Embed configuration
 * @returns Configured EmbedBuilder
 */
export function createErrorEmbed(options: ErrorEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(options.title)
    .setColor(COLORS.ERROR)
    .setDescription(options.description)
    .setTimestamp()

  if (options.footer) {
    embed.setFooter({ text: options.footer })
  }

  return embed
}

/**
 * Options for creating an info embed
 */
export interface InfoEmbedOptions {
  /** Embed title */
  title: string
  /** Embed description */
  description: string
  /** Footer text */
  footer?: string
  /** Fields to add */
  fields?: { name: string; value: string; inline?: boolean }[]
}

/**
 * Create an info embed with consistent styling.
 *
 * @param options - Embed configuration
 * @returns Configured EmbedBuilder
 */
export function createInfoEmbed(options: InfoEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(options.title)
    .setColor(COLORS.INFO)
    .setDescription(options.description)
    .setTimestamp()

  if (options.footer) {
    embed.setFooter({ text: options.footer })
  }

  if (options.fields) {
    embed.addFields(options.fields)
  }

  return embed
}
