import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles, userRoles, roles } from '@kawakawa/db'
import { eq } from 'drizzle-orm'

export const whoami: Command = {
  data: new SlashCommandBuilder()
    .setName('whoami')
    .setDescription('Show your linked Kawakawa account information'),

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

    // Get user's roles
    const userRoleList = await db
      .select({
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))

    const roleNames = userRoleList.map(r => r.roleName).join(', ') || 'None'

    const embed = new EmbedBuilder()
      .setTitle('Your Kawakawa Account')
      .setColor(0x5865f2) // Discord blurple
      .addFields(
        { name: 'Username', value: user.username, inline: true },
        { name: 'Display Name', value: user.displayName || user.username, inline: true },
        { name: 'Status', value: user.isActive ? 'Active' : 'Inactive', inline: true },
        { name: 'Roles', value: roleNames, inline: false }
      )
      .setFooter({ text: `Account ID: ${user.id}` })
      .setTimestamp()

    if (interaction.user.avatar) {
      embed.setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
  },
}
