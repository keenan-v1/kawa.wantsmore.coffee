import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles } from '@kawakawa/db'
import { eq } from 'drizzle-orm'

export const unlink: Command = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Disconnect your Discord from your Kawakawa account'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id

    // Find the Discord profile
    const profile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, discordId),
      with: {
        user: true,
      },
    })

    if (!profile) {
      await interaction.reply({
        content: "You don't have a linked Kawakawa account.",
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Check if this is a Discord-only account (no password set)
    const isDiscordOnlyAccount = profile.user.passwordHash.startsWith('discord:')

    if (isDiscordOnlyAccount) {
      // Warn user that they'll lose access
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Warning: Discord-Only Account')
        .setColor(0xed4245) // Red
        .setDescription(
          'Your account was created via Discord and has no password.\n\n' +
            "**If you unlink, you won't be able to log in!**\n\n" +
            'Before unlinking, you should:\n' +
            '1. Log in to the website\n' +
            '2. Set a password in your account settings\n\n' +
            "If you're sure you want to unlink anyway, use `/unlink-confirm`."
        )

      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    // Delete the Discord profile link
    try {
      await db.delete(userDiscordProfiles).where(eq(userDiscordProfiles.discordId, discordId))

      await interaction.reply({
        content:
          `✅ Successfully unlinked your Discord from **${profile.user.username}**.\n\n` +
          'You can still log in with your username and password on the website.\n' +
          'Use `/link` to reconnect your Discord later.',
        flags: MessageFlags.Ephemeral,
      })
    } catch (error) {
      console.error('Failed to unlink Discord:', error)
      await interaction.reply({
        content: 'An error occurred while unlinking your account. Please try again.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
