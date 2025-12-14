import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, users, userDiscordProfiles } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import * as bcrypt from 'bcrypt'
import logger from '../../utils/logger.js'

export const link: Command = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord to an existing Kawakawa account')
    .addStringOption(option =>
      option.setName('username').setDescription('Your Kawakawa username').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('password').setDescription('Your Kawakawa password').setRequired(true)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id
    const discordUsername = interaction.user.username
    const discordAvatar = interaction.user.avatar

    // Check if Discord is already linked
    const existingProfile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, discordId),
    })

    if (existingProfile) {
      await interaction.reply({
        content:
          'Your Discord is already linked to a Kawakawa account.\n\n' +
          'Use `/whoami` to see your account, or `/unlink` first to disconnect.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const username = interaction.options.getString('username', true)
    const password = interaction.options.getString('password', true)

    // Find user by username
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
      with: {
        discordProfile: true,
      },
    })

    if (!user) {
      await interaction.reply({
        content: 'Invalid username or password.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Check if this account already has a Discord link
    if (user.discordProfile) {
      await interaction.reply({
        content:
          'This Kawakawa account is already linked to a different Discord account.\n\n' +
          'If you need to change the linked Discord, please contact an admin.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash)
    if (!passwordValid) {
      await interaction.reply({
        content: 'Invalid username or password.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Create the Discord profile link
    try {
      await db.insert(userDiscordProfiles).values({
        userId: user.id,
        discordId,
        discordUsername,
        discordAvatar,
      })

      logger.info({ userId: user.id, username, discordId }, 'Discord account linked')

      await interaction.reply({
        content:
          `✅ Successfully linked your Discord to **${username}**!\n\n` +
          'You can now use `/whoami` to see your account details.',
        flags: MessageFlags.Ephemeral,
      })
    } catch (error) {
      logger.error({ error, discordId, username }, 'Failed to link Discord')
      await interaction.reply({
        content: 'An error occurred while linking your account. Please try again.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
