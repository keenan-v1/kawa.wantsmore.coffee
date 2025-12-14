import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles, priceLists } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { getUserSettings, setSetting, deleteSetting } from '../../services/userSettings.js'
import type { LocationDisplayMode, Currency } from '@kawakawa/types'

const COMPONENT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

// Setting definitions for display and validation
interface SettingDef {
  key: string
  label: string
  description: string
  type: 'enum' | 'boolean' | 'string' | 'string[]'
  options?: { label: string; value: string }[]
  allowNull?: boolean
}

const SETTING_DEFINITIONS: SettingDef[] = [
  {
    key: 'display.locationDisplayMode',
    label: 'Location Display',
    description: 'How locations are shown in outputs',
    type: 'enum',
    options: [
      { label: 'Names only (e.g., Benten)', value: 'names-only' },
      { label: 'IDs only (e.g., BEN)', value: 'natural-ids-only' },
      { label: 'Both (e.g., Benten [BEN])', value: 'both' },
    ],
  },
  {
    key: 'market.preferredCurrency',
    label: 'Preferred Currency',
    description: 'Default currency for orders',
    type: 'enum',
    options: [
      { label: 'CIS (₡)', value: 'CIS' },
      { label: 'ICA (ǂ)', value: 'ICA' },
      { label: 'AIC (₳)', value: 'AIC' },
      { label: 'NCC (₦)', value: 'NCC' },
    ],
  },
  {
    key: 'market.defaultPriceList',
    label: 'Default Price List',
    description: 'Price list for auto-pricing (empty = disabled)',
    type: 'string',
    allowNull: true,
  },
  {
    key: 'market.automaticPricing',
    label: 'Auto-Pricing',
    description: 'Automatically price orders from price list',
    type: 'boolean',
    options: [
      { label: 'Enabled', value: 'true' },
      { label: 'Disabled', value: 'false' },
    ],
  },
]

function getSettingDef(key: string): SettingDef | undefined {
  return SETTING_DEFINITIONS.find(d => d.key === key)
}

function formatSettingValue(key: string, value: unknown): string {
  const def = getSettingDef(key)
  if (!def) return String(value)

  if (value === null || value === undefined) {
    return '*Not set*'
  }

  if (def.type === 'boolean') {
    return value ? '✅ Enabled' : '❌ Disabled'
  }

  if (def.type === 'enum' && def.options) {
    const opt = def.options.find(o => o.value === value)
    return opt?.label ?? String(value)
  }

  if (def.type === 'string[]' && Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '*None*'
  }

  return String(value)
}

export const settings: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View and manage your settings') as SlashCommandBuilder,

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

    const userId = profile.user.id

    // Fetch price lists for the dropdown
    const priceListOptions = await db.query.priceLists.findMany({
      where: eq(priceLists.isActive, true),
      columns: { code: true, name: true, currency: true },
      orderBy: priceLists.code,
    })

    // Get current settings
    const currentSettings = await getUserSettings(userId)

    // Build settings embed
    const buildEmbed = (settings: Record<string, unknown>): EmbedBuilder => {
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Your Settings')
        .setColor(0x5865f2)
        .setDescription('Select a setting below to change it.')

      for (const def of SETTING_DEFINITIONS) {
        const value = settings[def.key]
        embed.addFields({
          name: def.label,
          value: `${formatSettingValue(def.key, value)}\n*${def.description}*`,
          inline: true,
        })
      }

      return embed
    }

    // Build select menu for choosing setting to edit
    const buildSelectMenu = (): ActionRowBuilder<StringSelectMenuBuilder> => {
      const select = new StringSelectMenuBuilder()
        .setCustomId('settings:select')
        .setPlaceholder('Select a setting to change')
        .addOptions(
          SETTING_DEFINITIONS.map(def => ({
            label: def.label,
            description: def.description.slice(0, 100),
            value: def.key,
          }))
        )

      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
    }

    const response = await interaction.reply({
      embeds: [buildEmbed(currentSettings)],
      components: [buildSelectMenu()],
      flags: MessageFlags.Ephemeral,
    })

    // Handle setting selection
    const collector = response.createMessageComponentCollector({
      time: COMPONENT_TIMEOUT,
      filter: i => i.user.id === interaction.user.id,
    })

    collector.on('collect', async (selectInteraction: StringSelectMenuInteraction | ButtonInteraction) => {
      if (selectInteraction.isStringSelectMenu() && selectInteraction.customId === 'settings:select') {
        const settingKey = selectInteraction.values[0]
        const def = getSettingDef(settingKey)

        if (!def) {
          await selectInteraction.reply({
            content: '❌ Unknown setting.',
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        // Show appropriate input based on setting type
        if (def.type === 'enum' || def.type === 'boolean') {
          // Show select menu for enum/boolean
          const options = def.options ?? []

          const valueSelect = new StringSelectMenuBuilder()
            .setCustomId(`settings:set:${settingKey}`)
            .setPlaceholder(`Select ${def.label.toLowerCase()}`)
            .addOptions(options.map(opt => ({ label: opt.label, value: opt.value })))

          const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(valueSelect)

          await selectInteraction.reply({
            content: `**${def.label}**\n${def.description}`,
            components: [row],
            flags: MessageFlags.Ephemeral,
          })
        } else if (settingKey === 'market.defaultPriceList') {
          // Special handling for price list - show available price lists
          const options = [
            { label: 'None (disable auto-pricing)', value: '__null__' },
            ...priceListOptions.map(pl => ({
              label: `${pl.code} - ${pl.name} (${pl.currency})`,
              value: pl.code,
            })),
          ]

          if (options.length > 25) {
            options.length = 25 // Discord limit
          }

          const valueSelect = new StringSelectMenuBuilder()
            .setCustomId(`settings:set:${settingKey}`)
            .setPlaceholder('Select a price list')
            .addOptions(options)

          const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(valueSelect)

          await selectInteraction.reply({
            content: `**${def.label}**\n${def.description}`,
            components: [row],
            flags: MessageFlags.Ephemeral,
          })
        } else {
          // Show modal for text input
          const modalId = `settings:modal:${settingKey}:${Date.now()}`
          const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(`Edit ${def.label}`)

          const currentValue = currentSettings[settingKey]
          const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel(def.label)
            .setPlaceholder(def.description)
            .setStyle(TextInputStyle.Short)
            .setRequired(!def.allowNull)

          if (currentValue !== null && currentValue !== undefined) {
            input.setValue(String(currentValue))
          }

          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))

          await selectInteraction.showModal(modal)

          try {
            const modalSubmit = await selectInteraction
              .awaitModalSubmit({
                time: COMPONENT_TIMEOUT,
                filter: (i: ModalSubmitInteraction) =>
                  i.customId === modalId && i.user.id === selectInteraction.user.id,
              })
              .catch(() => null)

            if (modalSubmit) {
              const newValue = modalSubmit.fields.getTextInputValue('value').trim()

              if (!newValue && def.allowNull) {
                await deleteSetting(userId, settingKey)
                await modalSubmit.reply({
                  content: `✅ **${def.label}** has been reset to default.`,
                  flags: MessageFlags.Ephemeral,
                })
              } else {
                await setSetting(userId, settingKey, newValue || null)
                await modalSubmit.reply({
                  content: `✅ **${def.label}** updated to: ${newValue || '*Not set*'}`,
                  flags: MessageFlags.Ephemeral,
                })
              }

              // Refresh the settings view
              const updatedSettings = await getUserSettings(userId)
              await interaction.editReply({
                embeds: [buildEmbed(updatedSettings)],
                components: [buildSelectMenu()],
              })
            }
          } catch (error) {
            console.error('Modal error:', error)
          }
        }
      } else if (
        selectInteraction.isStringSelectMenu() &&
        selectInteraction.customId.startsWith('settings:set:')
      ) {
        // Handle value selection for enum/boolean/price list
        const settingKey = selectInteraction.customId.replace('settings:set:', '')
        const def = getSettingDef(settingKey)
        let newValue: unknown = selectInteraction.values[0]

        if (!def) {
          await selectInteraction.reply({
            content: '❌ Unknown setting.',
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        // Convert value based on type
        if (def.type === 'boolean') {
          newValue = newValue === 'true'
        } else if (newValue === '__null__') {
          newValue = null
        }

        try {
          if (newValue === null) {
            await deleteSetting(userId, settingKey)
            await selectInteraction.reply({
              content: `✅ **${def.label}** has been reset to default.`,
              flags: MessageFlags.Ephemeral,
            })
          } else {
            await setSetting(userId, settingKey, newValue)
            await selectInteraction.reply({
              content: `✅ **${def.label}** updated to: ${formatSettingValue(settingKey, newValue)}`,
              flags: MessageFlags.Ephemeral,
            })
          }

          // Refresh the settings view
          const updatedSettings = await getUserSettings(userId)
          await interaction.editReply({
            embeds: [buildEmbed(updatedSettings)],
            components: [buildSelectMenu()],
          })
        } catch (error) {
          console.error('Error saving setting:', error)
          await selectInteraction.reply({
            content: '❌ Failed to save setting. Please try again.',
            flags: MessageFlags.Ephemeral,
          })
        }
      }
    })

    collector.on('end', async () => {
      try {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('settings:expired')
            .setLabel('Session expired - run /settings again')
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
