import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from 'discord.js'
import type { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, userSettings, fioUserStorage } from '@kawakawa/db'
import { eq, and, desc } from 'drizzle-orm'
import { requireLinkedUser } from '../../utils/auth.js'
import { MODAL_TIMEOUT } from '../../utils/interactions.js'
import logger from '../../utils/logger.js'

export const sync: Command = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Check your FIO sync status and configure credentials'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Check FIO credentials
    const fioUsernameRow = await db.query.userSettings.findFirst({
      where: and(eq(userSettings.userId, userId), eq(userSettings.settingKey, 'fio.username')),
    })

    const fioApiKeyRow = await db.query.userSettings.findFirst({
      where: and(eq(userSettings.userId, userId), eq(userSettings.settingKey, 'fio.apiKey')),
    })

    const hasFioUsername = !!fioUsernameRow?.value && fioUsernameRow.value !== '""'
    const hasFioApiKey = !!fioApiKeyRow?.value && fioApiKeyRow.value !== '""'
    const hasFioCredentials = hasFioUsername && hasFioApiKey

    // Get FIO username (parse JSON string)
    let fioUsername = ''
    if (fioUsernameRow?.value) {
      try {
        fioUsername = JSON.parse(fioUsernameRow.value)
      } catch {
        fioUsername = fioUsernameRow.value
      }
    }

    // Get last sync info
    const lastStorage = await db.query.fioUserStorage.findFirst({
      where: eq(fioUserStorage.userId, userId),
      orderBy: [desc(fioUserStorage.lastSyncedAt)],
    })

    const embed = new EmbedBuilder()
      .setTitle('📡 FIO Sync Status')
      .setColor(hasFioCredentials ? 0x57f287 : 0xfee75c)
      .setTimestamp()

    // FIO Credentials status
    embed.addFields({
      name: 'FIO Credentials',
      value: hasFioCredentials
        ? '✅ Configured'
        : '⚠️ Not configured\n\nClick the button below to set up your FIO credentials.',
      inline: false,
    })

    if (hasFioUsername && fioUsername) {
      embed.addFields({
        name: 'FIO Username',
        value: fioUsername,
        inline: true,
      })
    }

    // Last sync info
    if (lastStorage) {
      embed.addFields({
        name: 'Last Synced',
        value: lastStorage.lastSyncedAt.toLocaleString(),
        inline: true,
      })

      if (lastStorage.fioUploadedAt) {
        embed.addFields({
          name: 'FIO Data Age',
          value: lastStorage.fioUploadedAt.toLocaleString(),
          inline: true,
        })
      }
    } else {
      embed.addFields({
        name: 'Last Synced',
        value: 'Never - no inventory data yet',
        inline: true,
      })
    }

    // Set description based on status
    const whatWeSyncInfo =
      '\n\n**What we sync:**\n' +
      '• Your FIO profile (username, company)\n' +
      '• Inventory from all storage locations\n' +
      '• Contracts with other players\n\n' +
      "_We don't access your financial data or personal settings._"

    if (hasFioCredentials) {
      embed.setDescription(
        'Your FIO credentials are configured.\n\n' +
          '**Note:** Inventory sync runs automatically. Use `/inventory` to view your synced inventory.' +
          whatWeSyncInfo
      )
    } else {
      embed.setDescription(
        'Configure your FIO credentials to enable inventory syncing.\n\n' +
          'You can find your FIO API key at [fnar.net](https://fnar.net) under your profile settings.' +
          whatWeSyncInfo
      )
    }

    // Create buttons
    const row = new ActionRowBuilder<ButtonBuilder>()

    row.addComponents(
      new ButtonBuilder()
        .setCustomId('fio:configure')
        .setLabel(hasFioCredentials ? '🔧 Update Credentials' : '🔑 Configure FIO')
        .setStyle(hasFioCredentials ? ButtonStyle.Secondary : ButtonStyle.Primary)
    )

    if (hasFioCredentials) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('fio:clear')
          .setLabel('🗑️ Clear Credentials')
          .setStyle(ButtonStyle.Danger)
      )
    }

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    })

    // Create collector for button interactions
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: MODAL_TIMEOUT,
      filter: i => i.user.id === interaction.user.id,
    })

    collector.on('collect', async buttonInteraction => {
      if (buttonInteraction.customId === 'fio:configure') {
        // Show modal for FIO credential configuration
        const modal = new ModalBuilder()
          .setCustomId('fio:credentials-modal')
          .setTitle('Configure FIO Credentials')

        const usernameInput = new TextInputBuilder()
          .setCustomId('fio-username')
          .setLabel('FIO Username')
          .setPlaceholder('Your FIO username (case-sensitive)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)

        if (fioUsername) {
          usernameInput.setValue(fioUsername)
        }

        const apiKeyInput = new TextInputBuilder()
          .setCustomId('fio-apikey')
          .setLabel('FIO API Key')
          .setPlaceholder('Your FIO API key from fnar.net')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(20)
          .setMaxLength(100)

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(apiKeyInput)
        )

        await buttonInteraction.showModal(modal)

        // Wait for modal submission
        try {
          const modalSubmit = await buttonInteraction.awaitModalSubmit({
            time: MODAL_TIMEOUT,
            filter: i =>
              i.customId === 'fio:credentials-modal' && i.user.id === interaction.user.id,
          })

          await handleCredentialSubmit(modalSubmit, userId)
        } catch {
          // Modal timed out or was cancelled - no action needed
        }
      } else if (buttonInteraction.customId === 'fio:clear') {
        // Clear FIO credentials
        await db
          .delete(userSettings)
          .where(and(eq(userSettings.userId, userId), eq(userSettings.settingKey, 'fio.username')))
        await db
          .delete(userSettings)
          .where(and(eq(userSettings.userId, userId), eq(userSettings.settingKey, 'fio.apiKey')))

        logger.info({ userId }, 'FIO credentials cleared')

        await buttonInteraction.update({
          content: '✅ FIO credentials have been cleared.\n\nRun `/sync` again to reconfigure.',
          embeds: [],
          components: [],
        })
      }
    })

    collector.on('end', async () => {
      // Disable buttons after timeout
      try {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('fio:expired')
            .setLabel('Session expired - run /sync again')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        )
        await interaction.editReply({ components: [disabledRow] })
      } catch {
        // Interaction may have been deleted
      }
    })
  },
}

/**
 * Handle FIO credential modal submission
 */
async function handleCredentialSubmit(
  interaction: ModalSubmitInteraction,
  userId: number
): Promise<void> {
  const fioUsername = interaction.fields.getTextInputValue('fio-username').trim()
  const fioApiKey = interaction.fields.getTextInputValue('fio-apikey').trim()

  // Save credentials to user settings
  try {
    // Upsert FIO username
    await db
      .insert(userSettings)
      .values({
        userId,
        settingKey: 'fio.username',
        value: JSON.stringify(fioUsername),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userSettings.userId, userSettings.settingKey],
        set: {
          value: JSON.stringify(fioUsername),
          updatedAt: new Date(),
        },
      })

    // Upsert FIO API key
    await db
      .insert(userSettings)
      .values({
        userId,
        settingKey: 'fio.apiKey',
        value: JSON.stringify(fioApiKey),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userSettings.userId, userSettings.settingKey],
        set: {
          value: JSON.stringify(fioApiKey),
          updatedAt: new Date(),
        },
      })

    logger.info({ userId, fioUsername }, 'FIO credentials saved')

    await interaction.reply({
      content:
        `✅ FIO credentials saved for **${fioUsername}**!\n\n` +
        'Your inventory will be synced automatically. Use `/inventory` to view your synced data.',
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    logger.error({ error, userId }, 'Failed to save FIO credentials')
    await interaction.reply({
      content: '❌ Failed to save FIO credentials. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
