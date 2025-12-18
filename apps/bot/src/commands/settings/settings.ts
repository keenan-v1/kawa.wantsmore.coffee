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
  MessageComponentInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import { db, priceLists } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import {
  getUserSettings,
  setSetting,
  deleteSetting,
  USE_WEBSITE_SETTING,
  USE_CHANNEL_DEFAULT,
} from '../../services/userSettings.js'
import { formatLocation, resolveLocation } from '../../services/locationService.js'
import { formatCommodityWithMode, resolveCommodity } from '../../services/commodityService.js'
import type { LocationDisplayMode, CommodityDisplayMode } from '@kawakawa/types'
import { requireLinkedUser } from '../../utils/auth.js'
import { COMPONENT_TIMEOUT } from '../../utils/interactions.js'

// Setting definitions for display and validation
interface SettingDef {
  key: string
  label: string
  description: string
  type: 'enum' | 'boolean' | 'string' | 'favorites'
  options?: { label: string; value: string }[]
  allowNull?: boolean
}

const SETTING_DEFINITIONS: SettingDef[] = [
  // Discord-specific display settings
  {
    key: 'discord.locationDisplayMode',
    label: 'Location Display',
    description: 'How locations are shown in Discord',
    type: 'enum',
    options: [
      { label: 'Use website setting', value: USE_WEBSITE_SETTING },
      { label: 'Names only (Katoa)', value: 'names-only' },
      { label: 'IDs only (UV-351a)', value: 'natural-ids-only' },
      { label: 'Both (Katoa [UV-351a])', value: 'both' },
    ],
  },
  {
    key: 'discord.commodityDisplayMode',
    label: 'Commodity Display',
    description: 'How commodities are shown in Discord',
    type: 'enum',
    options: [
      { label: 'Use website setting', value: USE_WEBSITE_SETTING },
      { label: 'Tickers only (COF)', value: 'ticker-only' },
      { label: 'Names only (Coffee)', value: 'name-only' },
      { label: 'Both (COF - Coffee)', value: 'both' },
    ],
  },
  {
    key: 'discord.messageVisibility',
    label: 'Message Visibility',
    description: 'Whether replies are private or public',
    type: 'enum',
    options: [
      { label: 'Use channel default', value: USE_CHANNEL_DEFAULT },
      { label: 'Private (only you)', value: 'ephemeral' },
      { label: 'Public (visible to all)', value: 'public' },
    ],
  },
  // Market settings
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
    description: 'Price list for auto-pricing',
    type: 'string',
    allowNull: true,
  },
  {
    key: 'market.automaticPricing',
    label: 'Auto-Pricing',
    description: 'Auto-price orders from price list',
    type: 'boolean',
    options: [
      { label: 'Enabled', value: 'true' },
      { label: 'Disabled', value: 'false' },
    ],
  },
  // Favorites
  {
    key: 'market.favoritedLocations',
    label: 'Favorite Locations',
    description: 'Locations shown first in searches',
    type: 'favorites',
  },
  {
    key: 'market.favoritedCommodities',
    label: 'Favorite Commodities',
    description: 'Commodities shown first in searches',
    type: 'favorites',
  },
]

function getSettingDef(key: string): SettingDef | undefined {
  return SETTING_DEFINITIONS.find(d => d.key === key)
}

function formatSettingValue(
  key: string,
  value: unknown,
  allSettings?: Record<string, unknown>
): string {
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
    const label = opt?.label ?? String(value)

    // For "use-website", show the resolved value from web settings
    if (value === USE_WEBSITE_SETTING && allSettings) {
      const webKey = key.replace('discord.', 'display.')
      const webValue = allSettings[webKey]
      if (webValue !== undefined) {
        // Find the label for the web value (excluding the use-website option)
        const webOpt = def.options.find(
          o => o.value === webValue && o.value !== USE_WEBSITE_SETTING
        )
        if (webOpt) {
          return `${label} → ${webOpt.label}`
        }
      }
    }

    return label
  }

  // Favorites are handled separately by formatFavoritesValue
  if (def.type === 'favorites' && Array.isArray(value)) {
    if (value.length === 0) return '*None*'
    if (value.length <= 5) return value.join(', ')
    return `${value.slice(0, 5).join(', ')} +${value.length - 5} more`
  }

  return String(value)
}

async function formatFavoritesValue(
  key: string,
  value: unknown,
  settings: Record<string, unknown>
): Promise<string> {
  if (!Array.isArray(value) || value.length === 0) {
    return '*None*'
  }

  const locationMode = (settings['discord.locationDisplayMode'] ??
    'natural-ids-only') as LocationDisplayMode
  const commodityMode = (settings['discord.commodityDisplayMode'] ??
    'ticker-only') as CommodityDisplayMode
  const isCommodities = key === 'market.favoritedCommodities'

  const formatOne = async (item: string): Promise<string> => {
    if (isCommodities) {
      return formatCommodityWithMode(item, commodityMode)
    } else {
      return formatLocation(item, locationMode)
    }
  }

  const itemsToShow = value.slice(0, 5)
  const formatted = await Promise.all(itemsToShow.map(formatOne))

  if (value.length <= 5) {
    return formatted.join(', ')
  }
  return `${formatted.join(', ')} +${value.length - 5} more`
}

export const settings: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View and manage your settings') as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Fetch price lists for the dropdown
    const priceListOptions = await db.query.priceLists.findMany({
      where: eq(priceLists.isActive, true),
      columns: { code: true, name: true, currency: true },
      orderBy: priceLists.code,
    })

    // Get current settings
    let currentSettings = await getUserSettings(userId)

    // Build settings embed
    const buildEmbed = async (settings: Record<string, unknown>): Promise<EmbedBuilder> => {
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Your Settings')
        .setColor(0x5865f2)
        .setDescription('Select a setting below to change it.')

      // Group settings by category
      const displaySettings = SETTING_DEFINITIONS.filter(d => d.key.startsWith('discord.'))
      const marketSettings = SETTING_DEFINITIONS.filter(
        d => d.key.startsWith('market.') && d.type !== 'favorites'
      )
      const favoriteSettings = SETTING_DEFINITIONS.filter(d => d.type === 'favorites')

      // Display settings
      embed.addFields({
        name: '📺 Display (Discord)',
        value: displaySettings
          .map(
            def => `**${def.label}:** ${formatSettingValue(def.key, settings[def.key], settings)}`
          )
          .join('\n'),
        inline: false,
      })

      // Market settings
      embed.addFields({
        name: '💰 Market',
        value: marketSettings
          .map(
            def => `**${def.label}:** ${formatSettingValue(def.key, settings[def.key], settings)}`
          )
          .join('\n'),
        inline: false,
      })

      // Favorites (async formatting with display preferences)
      const favoritesLines = await Promise.all(
        favoriteSettings.map(async def => {
          const formatted = await formatFavoritesValue(def.key, settings[def.key], settings)
          return `**${def.label}:** ${formatted}`
        })
      )
      embed.addFields({
        name: '⭐ Favorites',
        value: favoritesLines.join('\n'),
        inline: false,
      })

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
            emoji: def.type === 'favorites' ? '⭐' : undefined,
          }))
        )

      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
    }

    const response = await interaction.reply({
      embeds: [await buildEmbed(currentSettings)],
      components: [buildSelectMenu()],
      flags: MessageFlags.Ephemeral,
    })

    // Refresh settings and update embed
    const refreshEmbed = async (): Promise<void> => {
      currentSettings = await getUserSettings(userId)
      await interaction.editReply({
        embeds: [await buildEmbed(currentSettings)],
        components: [buildSelectMenu()],
      })
    }

    // Handle setting selection
    const collector = response.createMessageComponentCollector({
      time: COMPONENT_TIMEOUT,
      filter: i => i.user.id === interaction.user.id,
    })

    collector.on(
      'collect',
      async (componentInteraction: StringSelectMenuInteraction | ButtonInteraction) => {
        if (
          componentInteraction.isStringSelectMenu() &&
          componentInteraction.customId === 'settings:select'
        ) {
          const settingKey = componentInteraction.values[0]
          const def = getSettingDef(settingKey)

          if (!def) {
            await componentInteraction.reply({
              content: '❌ Unknown setting.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // Handle favorites specially
          if (def.type === 'favorites') {
            await handleFavoritesMenu(
              componentInteraction,
              userId,
              settingKey,
              currentSettings,
              refreshEmbed
            )
            return
          }

          // Show appropriate input based on setting type
          if (def.type === 'enum' || def.type === 'boolean') {
            const options = def.options ?? []

            const valueSelect = new StringSelectMenuBuilder()
              .setCustomId(`settings:set:${settingKey}`)
              .setPlaceholder(`Select ${def.label.toLowerCase()}`)
              .addOptions(options.map(opt => ({ label: opt.label, value: opt.value })))

            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(valueSelect)

            const valueResponse = await componentInteraction.reply({
              content: `**${def.label}**\n${def.description}`,
              components: [row],
              flags: MessageFlags.Ephemeral,
              withResponse: true,
            })

            // Await selection from the value dropdown
            try {
              const valueInteraction = await valueResponse.resource?.message?.awaitMessageComponent(
                {
                  componentType: ComponentType.StringSelect,
                  time: COMPONENT_TIMEOUT,
                  filter: i => i.user.id === componentInteraction.user.id,
                }
              )

              if (valueInteraction) {
                let newValue: unknown = valueInteraction.values[0]
                if (def.type === 'boolean') {
                  newValue = newValue === 'true'
                }

                await setSetting(userId, settingKey, newValue)
                await valueInteraction.update({
                  content: `✅ **${def.label}** updated to: ${formatSettingValue(settingKey, newValue)}`,
                  components: [],
                })
                await refreshEmbed()
              }
            } catch {
              // Timeout or error - ignore
            }
          } else if (settingKey === 'market.defaultPriceList') {
            const options = [
              { label: 'None (disable auto-pricing)', value: '__null__' },
              ...priceListOptions.map(pl => ({
                label: `${pl.code} - ${pl.name} (${pl.currency})`,
                value: pl.code,
              })),
            ]

            if (options.length > 25) {
              options.length = 25
            }

            const valueSelect = new StringSelectMenuBuilder()
              .setCustomId(`settings:set:${settingKey}`)
              .setPlaceholder('Select a price list')
              .addOptions(options)

            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(valueSelect)

            const valueResponse = await componentInteraction.reply({
              content: `**${def.label}**\n${def.description}`,
              components: [row],
              flags: MessageFlags.Ephemeral,
              withResponse: true,
            })

            // Await selection from the value dropdown
            try {
              const valueInteraction = await valueResponse.resource?.message?.awaitMessageComponent(
                {
                  componentType: ComponentType.StringSelect,
                  time: COMPONENT_TIMEOUT,
                  filter: i => i.user.id === componentInteraction.user.id,
                }
              )

              if (valueInteraction) {
                let newValue: unknown = valueInteraction.values[0]
                if (newValue === '__null__') {
                  newValue = null
                }

                if (newValue === null) {
                  await deleteSetting(userId, settingKey)
                  await valueInteraction.update({
                    content: `✅ **${def.label}** has been reset to default.`,
                    components: [],
                  })
                } else {
                  await setSetting(userId, settingKey, newValue)
                  await valueInteraction.update({
                    content: `✅ **${def.label}** updated to: ${formatSettingValue(settingKey, newValue)}`,
                    components: [],
                  })
                }
                await refreshEmbed()
              }
            } catch {
              // Timeout or error - ignore
            }
          } else {
            // Modal for text input
            const modalId = `settings:modal:${settingKey}:${Date.now()}`
            const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Edit ${def.label}`)

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

            await componentInteraction.showModal(modal)

            try {
              const modalSubmit = await componentInteraction
                .awaitModalSubmit({
                  time: COMPONENT_TIMEOUT,
                  filter: (i: ModalSubmitInteraction) =>
                    i.customId === modalId && i.user.id === componentInteraction.user.id,
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

                await refreshEmbed()
              }
            } catch (error) {
              console.error('Modal error:', error)
            }
          }
        }
      }
    )

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

/**
 * Handle favorites menu (add/remove/view favorites)
 */
async function handleFavoritesMenu(
  interaction: StringSelectMenuInteraction,
  userId: number,
  settingKey: string,
  currentSettings: Record<string, unknown>,
  refreshEmbed: () => Promise<void>
): Promise<void> {
  const isCommodities = settingKey === 'market.favoritedCommodities'
  const label = isCommodities ? 'Commodities' : 'Locations'
  const currentFavorites = (currentSettings[settingKey] as string[]) ?? []

  // Get display settings
  const locationMode = (currentSettings['discord.locationDisplayMode'] ??
    'natural-ids-only') as LocationDisplayMode
  const commodityMode = (currentSettings['discord.commodityDisplayMode'] ??
    'ticker-only') as CommodityDisplayMode

  // Format a favorite for display
  const formatFavorite = async (fav: string): Promise<string> => {
    if (isCommodities) {
      return formatCommodityWithMode(fav, commodityMode)
    } else {
      return formatLocation(fav, locationMode)
    }
  }

  // Build favorites management menu
  const buildFavoritesMenu = async (): Promise<{
    embeds: EmbedBuilder[]
    components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]
  }> => {
    let description: string
    if (currentFavorites.length > 0) {
      const formatted = await Promise.all(currentFavorites.map(formatFavorite))
      description = `Your favorites appear first in autocomplete suggestions.\n\n**Current favorites:**\n${formatted.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    } else {
      description = `You have no favorite ${label.toLowerCase()} yet.\n\nFavorites appear first in autocomplete suggestions.`
    }

    const embed = new EmbedBuilder()
      .setTitle(`⭐ Favorite ${label}`)
      .setColor(0xffd700)
      .setDescription(description)

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`fav:add:${settingKey}`)
        .setLabel(`Add ${isCommodities ? 'Commodity' : 'Location'}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕'),
      new ButtonBuilder()
        .setCustomId(`fav:remove:${settingKey}`)
        .setLabel('Remove')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('➖')
        .setDisabled(currentFavorites.length === 0),
      new ButtonBuilder()
        .setCustomId(`fav:clear:${settingKey}`)
        .setLabel('Clear All')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentFavorites.length === 0)
    )

    return { embeds: [embed], components: [buttons] }
  }

  await interaction.reply({
    ...(await buildFavoritesMenu()),
    flags: MessageFlags.Ephemeral,
  })

  // Get the message for the collector
  const favMessage = await interaction.fetchReply()

  // Collector for favorites management
  const favCollector = favMessage.createMessageComponentCollector({
    time: COMPONENT_TIMEOUT,
    filter: i => i.user.id === interaction.user.id,
  })

  favCollector.on('collect', async (favInteraction: MessageComponentInteraction) => {
    try {
      if (favInteraction.isButton()) {
        const [, action] = favInteraction.customId.split(':')

        if (action === 'add') {
          // Show modal to add a favorite
          const modalId = `fav:add-modal:${settingKey}:${Date.now()}`
          const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(`Add Favorite ${isCommodities ? 'Commodity' : 'Location'}`)

          const input = new TextInputBuilder()
            .setCustomId('value')
            .setLabel(
              isCommodities
                ? 'Commodity tickers (comma-separated)'
                : 'Location names or IDs (comma-separated)'
            )
            .setPlaceholder(isCommodities ? 'COF, RAT, DW' : 'Katoa, Benten Station')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200)

          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))

          await favInteraction.showModal(modal)

          try {
            const modalSubmit = await favInteraction
              .awaitModalSubmit({
                time: COMPONENT_TIMEOUT,
                filter: (i: ModalSubmitInteraction) =>
                  i.customId === modalId && i.user.id === favInteraction.user.id,
              })
              .catch(() => null)

            if (modalSubmit) {
              const rawValue = modalSubmit.fields.getTextInputValue('value').trim()

              // Parse comma-separated values (supports names with spaces)
              const inputs = rawValue
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0)

              if (inputs.length === 0) {
                await modalSubmit.reply({
                  content: '❌ No valid input provided.',
                  flags: MessageFlags.Ephemeral,
                })
                return
              }

              const added: string[] = []
              const alreadyFavorited: string[] = []
              const notFound: string[] = []

              for (const input of inputs) {
                if (isCommodities) {
                  const commodity = await resolveCommodity(input)
                  if (!commodity) {
                    notFound.push(input)
                    continue
                  }
                  if (currentFavorites.includes(commodity.ticker)) {
                    alreadyFavorited.push(
                      await formatCommodityWithMode(commodity.ticker, commodityMode)
                    )
                    continue
                  }
                  currentFavorites.push(commodity.ticker)
                  added.push(await formatCommodityWithMode(commodity.ticker, commodityMode))
                } else {
                  const location = await resolveLocation(input)
                  if (!location) {
                    notFound.push(input)
                    continue
                  }
                  if (currentFavorites.includes(location.naturalId)) {
                    alreadyFavorited.push(await formatLocation(location.naturalId, locationMode))
                    continue
                  }
                  currentFavorites.push(location.naturalId)
                  added.push(await formatLocation(location.naturalId, locationMode))
                }
              }

              // Save if any were added
              if (added.length > 0) {
                await setSetting(userId, settingKey, currentFavorites)
              }

              // Build response message
              const parts: string[] = []
              if (added.length > 0) {
                parts.push(`✅ Added: ${added.join(', ')}`)
              }
              if (alreadyFavorited.length > 0) {
                parts.push(`ℹ️ Already favorited: ${alreadyFavorited.join(', ')}`)
              }
              if (notFound.length > 0) {
                parts.push(`❌ Not found: ${notFound.map(s => `\`${s}\``).join(', ')}`)
              }

              await modalSubmit.reply({
                content: parts.join('\n'),
                flags: MessageFlags.Ephemeral,
              })

              // Update the favorites menu
              await interaction.editReply(await buildFavoritesMenu())
              await refreshEmbed()
            }
          } catch (error) {
            console.error('Modal error:', error)
          }
        } else if (action === 'remove') {
          // Show select menu to remove a favorite
          if (currentFavorites.length === 0) {
            await favInteraction.reply({
              content: '❌ No favorites to remove.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // Format favorites for display in the select menu
          const formattedFavorites = await Promise.all(
            currentFavorites.slice(0, 25).map(async fav => ({
              label: await formatFavorite(fav),
              value: fav,
            }))
          )

          const removeSelect = new StringSelectMenuBuilder()
            .setCustomId(`fav:remove-select:${settingKey}`)
            .setPlaceholder('Select favorite to remove')
            .addOptions(formattedFavorites)

          const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(removeSelect)

          await favInteraction.reply({
            content: 'Select a favorite to remove:',
            components: [row],
            flags: MessageFlags.Ephemeral,
          })
        } else if (action === 'clear') {
          // Clear all favorites
          await setSetting(userId, settingKey, [])
          currentFavorites.length = 0

          await favInteraction.reply({
            content: `✅ Cleared all favorite ${label.toLowerCase()}.`,
            flags: MessageFlags.Ephemeral,
          })

          await interaction.editReply(await buildFavoritesMenu())
          await refreshEmbed()
        }
      } else if (
        favInteraction.isStringSelectMenu() &&
        favInteraction.customId.startsWith('fav:remove-select:')
      ) {
        const favToRemove = favInteraction.values[0]
        const displayName = await formatFavorite(favToRemove)
        const updatedFavorites = currentFavorites.filter(f => f !== favToRemove)

        await setSetting(userId, settingKey, updatedFavorites)

        // Update local array
        const idx = currentFavorites.indexOf(favToRemove)
        if (idx > -1) currentFavorites.splice(idx, 1)

        await favInteraction.reply({
          content: `✅ Removed ${displayName} from your favorites.`,
          flags: MessageFlags.Ephemeral,
        })

        await interaction.editReply(await buildFavoritesMenu())
        await refreshEmbed()
      }
    } catch (error) {
      console.error('Error handling favorites interaction:', error)
      try {
        if (!favInteraction.replied && !favInteraction.deferred) {
          await favInteraction.reply({
            content: '❌ An error occurred. Please try again.',
            flags: MessageFlags.Ephemeral,
          })
        }
      } catch {
        // Already replied or deferred
      }
    }
  })
}
