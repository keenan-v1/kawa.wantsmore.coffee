/**
 * /password command - Generate a password reset link
 * Allows users to set or change their password via the web interface
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles, passwordResetTokens } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'
import { getWebUrl } from '../../config.js'
import logger from '../../utils/logger.js'

export const password: Command = {
  data: new SlashCommandBuilder()
    .setName('password')
    .setDescription('Get a link to set or change your password on the website'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id

    // Find user by Discord ID
    const profile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, discordId),
      with: {
        user: true,
      },
    })

    if (!profile) {
      await interaction.reply({
        content:
          'You do not have a linked Kawakawa account.\n\n' +
          'Use `/register` to create a new account, or `/link` to connect an existing one.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const user = profile.user

    // Generate reset token (same logic as AdminController)
    const token = crypto.randomBytes(32).toString('hex')
    const expirationHours = 24
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000)

    // Store reset token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
      used: false,
    })

    logger.info(
      { userId: user.id, username: user.username, discordId },
      'Password reset token generated via Discord'
    )

    // Get web URL
    const webUrl = await getWebUrl()
    const resetUrl = `${webUrl}/reset-password?token=${token}`

    // Check if this is a Discord-only account
    const isDiscordOnly = user.passwordHash.startsWith('discord:')

    const embed = new EmbedBuilder()
      .setTitle('🔑 Password Reset Link')
      .setColor(0x5865f2)
      .setDescription(
        isDiscordOnly
          ? 'Your account was created via Discord and has no password set.\n\n' +
              'Click the button below to set a password. This will allow you to log in on the website.'
          : 'Click the button below to reset your password.\n\n' +
              'This will allow you to set a new password for logging in on the website.'
      )
      .addFields({
        name: 'Expires',
        value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
        inline: true,
      })
      .setFooter({ text: `Account: ${user.username}` })
      .setTimestamp()

    // Create button with link
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(isDiscordOnly ? '🔐 Set Password' : '🔐 Reset Password')
        .setStyle(ButtonStyle.Link)
        .setURL(resetUrl)
    )

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    })
  },
}
