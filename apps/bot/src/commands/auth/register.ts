import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, users, userDiscordProfiles, userRoles, discordRoleMappings } from '@kawakawa/db'
import { eq, inArray } from 'drizzle-orm'
import { settingsService } from '@kawakawa/services/settings'
import logger from '../../utils/logger.js'

export const register: Command = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Create a new Kawakawa account linked to your Discord')
    .addStringOption(option =>
      option
        .setName('username')
        .setDescription('Your desired username (used for login)')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(50)
    )
    .addStringOption(option =>
      option
        .setName('display_name')
        .setDescription('Your display name (shown to others)')
        .setRequired(true)
        .setMaxLength(100)
    ) as SlashCommandBuilder,

  // Disabled for prefix commands - requires named options and contains sensitive account info
  prefixEnabled: false,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id
    const discordUsername = interaction.user.username
    const discordAvatar = interaction.user.avatar

    // Check if user already has a linked account
    const existingProfile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, discordId),
    })

    if (existingProfile) {
      await interaction.reply({
        content:
          'You already have a linked Kawakawa account.\n\n' +
          'Use `/whoami` to see your account details, or `/unlink` to disconnect.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const username = interaction.options.getString('username', true)
    const displayName = interaction.options.getString('display_name') || username

    // Check if username is already taken
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username),
    })

    if (existingUser) {
      await interaction.reply({
        content: `The username "${username}" is already taken. Please choose a different one.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Get Discord settings for guild ID
    const settings = await settingsService.getAll('discord.')
    const guildId = settings['discord.guildId']

    // Get user's Discord roles from guild (if in a guild context)
    let memberRoles: string[] = []
    if (interaction.guild && interaction.member && 'roles' in interaction.member) {
      const roles = interaction.member.roles
      if (Array.isArray(roles)) {
        memberRoles = roles
      } else if (roles && 'cache' in roles) {
        memberRoles = Array.from(roles.cache.keys())
      }
    } else if (guildId) {
      // Try to fetch from the configured guild if available
      try {
        const guild = interaction.client.guilds.cache.get(guildId)
        if (guild) {
          const member = await guild.members.fetch(discordId).catch(() => null)
          if (member) {
            memberRoles = Array.from(member.roles.cache.keys())
          }
        }
      } catch {
        // Silently continue without roles if we can't fetch
      }
    }

    // Look up Discord role mappings
    let appRolesToAssign: string[] = []
    if (memberRoles.length > 0) {
      const mappings = await db
        .select({
          discordRoleId: discordRoleMappings.discordRoleId,
          appRoleId: discordRoleMappings.appRoleId,
        })
        .from(discordRoleMappings)
        .where(inArray(discordRoleMappings.discordRoleId, memberRoles))

      appRolesToAssign = mappings.filter(m => m.appRoleId !== null).map(m => m.appRoleId as string)
    }

    // Default role is 'unverified' if no roles were auto-assigned
    const hasValidRole = appRolesToAssign.length > 0
    if (!hasValidRole) {
      appRolesToAssign = ['unverified']
    }

    // Create user with placeholder password (Discord-only account)
    // The password is a random hash that can't be used to login
    const placeholderPassword = `discord:${discordId}:${Date.now()}`

    try {
      // Use a transaction to ensure atomicity
      await db.transaction(async tx => {
        // Create the user
        const [newUser] = await tx
          .insert(users)
          .values({
            username,
            displayName,
            passwordHash: placeholderPassword, // Cannot be used for login
            isActive: true,
          })
          .returning()

        // Create Discord profile link
        await tx.insert(userDiscordProfiles).values({
          userId: newUser.id,
          discordId,
          discordUsername,
          discordAvatar,
        })

        // Assign roles
        for (const roleId of appRolesToAssign) {
          await tx.insert(userRoles).values({
            userId: newUser.id,
            roleId,
          })
        }

        logger.info(
          {
            userId: newUser.id,
            username: newUser.username,
            discordId,
            roles: appRolesToAssign,
            autoApproved: hasValidRole,
          },
          'User registered via Discord'
        )
      })

      // Build success embed
      const embed = new EmbedBuilder()
        .setTitle('Account Created!')
        .setColor(hasValidRole ? 0x57f287 : 0xfee75c) // Green if approved, yellow if pending
        .addFields(
          { name: 'Username', value: username, inline: true },
          { name: 'Display Name', value: displayName, inline: true },
          {
            name: 'Status',
            value: hasValidRole ? '✅ Auto-Approved' : '⏳ Pending Approval',
            inline: true,
          },
          {
            name: 'Assigned Roles',
            value: appRolesToAssign.join(', '),
            inline: false,
          }
        )
        .setTimestamp()

      if (!hasValidRole) {
        embed.setDescription(
          'Your account has been created but requires admin approval before you can access all features.\n\n' +
            'An admin will review your account shortly.'
        )
      } else {
        embed.setDescription(
          'Welcome to Kawakawa! Your Discord roles have been matched and your account is ready to use.\n\n' +
            'Use `/whoami` to see your account details.'
        )
      }

      await interaction.reply({ embeds: [embed], ephemeral: true })
    } catch (error) {
      logger.error({ error, discordId, username }, 'Failed to create user')
      await interaction.reply({
        content:
          'An error occurred while creating your account. Please try again or contact an admin.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
