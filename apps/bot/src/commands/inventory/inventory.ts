import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles, fioUserStorage, sellOrders, buyOrders } from '@kawakawa/db'
import { eq, desc } from 'drizzle-orm'
import { searchCommodities, searchLocations } from '../../autocomplete/index.js'
import {
  resolveCommodity,
  resolveLocation,
  formatCommodity,
  formatLocation,
} from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import { type PaginatedItem } from '../../components/pagination.js'

const COMPONENT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

interface InventoryItemData {
  commodityTicker: string
  commodityName: string
  locationId: string
  locationName: string
  storageType: string
  quantity: number
}

/**
 * Get storage type icon
 */
function getStorageTypeIcon(type: string): string {
  switch (type) {
    case 'STORE':
      return '🏠' // Base storage
    case 'WAREHOUSE_STORE':
      return '🏭' // Warehouse
    case 'SHIP_STORE':
      return '🚀' // Ship
    case 'STL_FUEL_STORE':
      return '⛽' // STL fuel
    case 'FTL_FUEL_STORE':
      return '🔋' // FTL fuel
    default:
      return '📦' // Unknown
  }
}

const MAX_FIELD_LENGTH = 1024

/**
 * Format inventory items into grouped cards with one-liner code formatting.
 * Cards are displayed inline (2-3 per row).
 */
async function formatInventoryItems(
  items: InventoryItemData[],
  locationDisplayMode: 'names-only' | 'natural-ids-only' | 'both'
): Promise<PaginatedItem[]> {
  if (items.length === 0) return []

  // Group items by location
  const groupedItems = new Map<string, { locationDisplay: string; items: InventoryItemData[] }>()

  for (const item of items) {
    if (!groupedItems.has(item.locationId)) {
      const locationDisplay = await formatLocation(item.locationId, locationDisplayMode)
      groupedItems.set(item.locationId, { locationDisplay, items: [] })
    }
    groupedItems.get(item.locationId)!.items.push(item)
  }

  // Convert to paginated items (inline cards for 2-3 per row)
  const result: PaginatedItem[] = []

  for (const [, group] of groupedItems) {
    // Calculate max widths for this location's items for padding
    let maxQtyLen = 0
    let maxTickerLen = 3

    for (const item of group.items) {
      maxQtyLen = Math.max(maxQtyLen, item.quantity.toLocaleString().length)
      maxTickerLen = Math.max(maxTickerLen, item.commodityTicker.length)
    }

    // Format each item as a one-liner with storage icon and code block
    const lines: string[] = []
    for (const item of group.items) {
      const storageIcon = getStorageTypeIcon(item.storageType)
      const ticker = formatCommodity(item.commodityTicker)
      const qtyStr = item.quantity.toLocaleString()

      const qtyPad = qtyStr.padStart(maxQtyLen)
      const tickerPad = ticker.padEnd(maxTickerLen)

      lines.push(`${storageIcon} \`${qtyPad} ${tickerPad}\``)
    }

    const fullValue = lines.join('\n')

    if (fullValue.length <= MAX_FIELD_LENGTH) {
      result.push({
        name: `📍 ${group.locationDisplay}`,
        value: fullValue,
        inline: true, // Enable inline for card layout (2-3 per row)
      })
    } else {
      // Split into multiple cards if too large
      let currentLines: string[] = []
      let currentLength = 0
      let isFirst = true

      for (const line of lines) {
        const lineWithNewline = currentLines.length > 0 ? '\n' + line : line
        const addedLength = lineWithNewline.length

        if (currentLength + addedLength > MAX_FIELD_LENGTH && currentLines.length > 0) {
          result.push({
            name: isFirst ? `📍 ${group.locationDisplay}` : `↳ ${group.locationDisplay}`,
            value: currentLines.join('\n'),
            inline: true,
          })
          isFirst = false
          currentLines = [line]
          currentLength = line.length
        } else {
          currentLines.push(line)
          currentLength += addedLength
        }
      }

      if (currentLines.length > 0) {
        result.push({
          name: isFirst ? `📍 ${group.locationDisplay}` : `↳ ${group.locationDisplay}`,
          value: currentLines.join('\n'),
          inline: true,
        })
      }
    }
  }

  return result
}

export const inventory: Command = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your FIO inventory')
    .addStringOption(option =>
      option.setName('commodity').setDescription('Filter by commodity ticker').setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('location').setDescription('Filter by location').setAutocomplete(true)
    ) as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true)
    const query = focusedOption.value
    const discordId = interaction.user.id

    let choices: { name: string; value: string }[] = []

    switch (focusedOption.name) {
      case 'commodity': {
        const commodities = await searchCommodities(query, 25, discordId)
        choices = commodities.map(c => ({
          name: `${c.ticker} - ${c.name}`,
          value: c.ticker,
        }))
        break
      }
      case 'location': {
        const locations = await searchLocations(query, 25, discordId)
        choices = locations.map(l => ({
          name: `${l.naturalId} - ${l.name}`,
          value: l.naturalId,
        }))
        break
      }
    }

    await interaction.respond(choices)
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id
    const commodityInput = interaction.options.getString('commodity')
    const locationInput = interaction.options.getString('location')

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

    // Get user's display preferences
    const displaySettings = await getDisplaySettings(discordId)

    // Validate commodity filter (exact ticker match only)
    let resolvedCommodity: { ticker: string; name: string } | null = null
    if (commodityInput) {
      resolvedCommodity = await resolveCommodity(commodityInput)
      if (!resolvedCommodity) {
        await interaction.reply({
          content:
            `❌ Commodity ticker "${commodityInput.toUpperCase()}" not found.\n\n` +
            'Use the autocomplete suggestions to find valid tickers.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    }

    // Validate location filter (exact ID or name match only)
    let resolvedLocation: { naturalId: string; name: string; type: string } | null = null
    if (locationInput) {
      resolvedLocation = await resolveLocation(locationInput)
      if (!resolvedLocation) {
        await interaction.reply({
          content:
            `❌ Location "${locationInput}" not found.\n\n` +
            'Use the autocomplete suggestions to find valid locations.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    }

    // Fetch user storage locations with inventory
    const storageLocations = await db.query.fioUserStorage.findMany({
      where: eq(fioUserStorage.userId, userId),
      with: {
        location: true,
        fioInventory: {
          with: {
            commodity: true,
          },
        },
      },
      orderBy: [desc(fioUserStorage.lastSyncedAt)],
    })

    if (storageLocations.length === 0) {
      await interaction.reply({
        content:
          '📭 No inventory data found.\n\n' +
          'Use `/sync` to check your FIO sync status and configure your FIO credentials.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Collect all inventory items for formatting
    const flatInventory: InventoryItemData[] = []

    for (const storage of storageLocations) {
      // Apply location filter
      if (resolvedLocation && storage.locationId !== resolvedLocation.naturalId) {
        continue
      }

      // Filter inventory items
      const filteredInventory = storage.fioInventory.filter(
        inv => !resolvedCommodity || inv.commodityTicker === resolvedCommodity.ticker
      )

      if (filteredInventory.length === 0) {
        continue
      }

      // Collect items (only if we have a valid locationId)
      if (storage.locationId) {
        for (const inv of filteredInventory) {
          flatInventory.push({
            commodityTicker: inv.commodityTicker,
            commodityName: inv.commodity?.name ?? inv.commodityTicker,
            locationId: storage.locationId,
            locationName: storage.location?.name ?? storage.storageId,
            storageType: storage.type,
            quantity: inv.quantity,
          })
        }
      }
    }

    // Format inventory into one-liner groups
    const allItems = await formatInventoryItems(flatInventory, displaySettings.locationDisplayMode)

    if (allItems.length === 0) {
      await interaction.reply({
        content: '📭 No inventory items match your filters.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Build filter description
    const filters: string[] = []
    if (resolvedCommodity) {
      filters.push(`Commodity: ${formatCommodity(resolvedCommodity.ticker)}`)
    }
    if (resolvedLocation) {
      filters.push(
        `Location: ${await formatLocation(resolvedLocation.naturalId, displaySettings.locationDisplayMode)}`
      )
    }
    const filterDesc = filters.length > 0 ? filters.join(' | ') : 'All Locations'

    // Get sync timestamp
    const mostRecentSync = storageLocations.reduce(
      (latest, storage) => (storage.lastSyncedAt > latest ? storage.lastSyncedAt : latest),
      new Date(0)
    )

    // Send interactive inventory response with action buttons
    await sendInteractiveInventory(
      interaction,
      profile.user.displayName,
      userId,
      allItems,
      flatInventory,
      filterDesc,
      mostRecentSync,
      displaySettings.locationDisplayMode
    )
  },
}

/**
 * Send interactive inventory with pagination and action buttons
 */
async function sendInteractiveInventory(
  interaction: ChatInputCommandInteraction,
  displayName: string,
  userId: number,
  allItems: PaginatedItem[],
  flatInventory: InventoryItemData[],
  filterDesc: string,
  lastSyncDate: Date,
  locationDisplayMode: string
): Promise<void> {
  const idPrefix = 'inv'
  const pageSize = 6
  const totalPages = Math.ceil(allItems.length / pageSize)
  let currentPage = 0

  const getPageItems = (page: number): PaginatedItem[] => {
    const start = page * pageSize
    return allItems.slice(start, start + pageSize)
  }

  const buildEmbed = (page: number): EmbedBuilder => {
    const embed = new EmbedBuilder()
      .setTitle(`📦 ${displayName}'s Inventory`)
      .setColor(0x57f287)
      .setDescription(filterDesc)
      .setTimestamp()
      .setFields(getPageItems(page).map(item => ({ ...item, inline: item.inline ?? true })))

    const footerParts = [`Last synced: ${lastSyncDate.toLocaleDateString()}`]
    if (totalPages > 1) {
      footerParts.push(`Page ${page + 1}/${totalPages}`)
    }
    embed.setFooter({ text: footerParts.join(' • ') })

    return embed
  }

  const buildComponents = (page: number): ActionRowBuilder<ButtonBuilder>[] => {
    const rows: ActionRowBuilder<ButtonBuilder>[] = []

    // Action buttons row
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:sell`)
        .setLabel('📤 Sell')
        .setStyle(ButtonStyle.Success)
        .setDisabled(flatInventory.length === 0),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:buy`)
        .setLabel('📥 Buy Request')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(flatInventory.length === 0),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:share`)
        .setLabel('📢 Share')
        .setStyle(ButtonStyle.Secondary)
    )
    rows.push(actionRow)

    // Pagination row (if multiple pages)
    if (totalPages > 1) {
      const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:prev`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:info`)
          .setLabel(`${page + 1} / ${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:next`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1)
      )
      rows.push(navRow)
    }

    return rows
  }

  const response = await interaction.reply({
    embeds: [buildEmbed(0)],
    components: buildComponents(0),
    flags: MessageFlags.Ephemeral,
  })

  // Create collector for button interactions
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COMPONENT_TIMEOUT,
    filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
  })

  collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
    const action = buttonInteraction.customId.split(':')[1]

    switch (action) {
      case 'prev':
        if (currentPage > 0) {
          currentPage--
          await buttonInteraction.update({
            embeds: [buildEmbed(currentPage)],
            components: buildComponents(currentPage),
          })
        }
        break

      case 'next':
        if (currentPage < totalPages - 1) {
          currentPage++
          await buttonInteraction.update({
            embeds: [buildEmbed(currentPage)],
            components: buildComponents(currentPage),
          })
        }
        break

      case 'share': {
        // Build a shareable embed for the current page (no buttons)
        const shareEmbed = new EmbedBuilder()
          .setTitle(`📦 ${displayName}'s Inventory`)
          .setColor(0x57f287)
          .setDescription(filterDesc)
          .setTimestamp()
          .setFields(getPageItems(currentPage).map(item => ({ ...item, inline: item.inline ?? true })))

        const footerParts = [`Last synced: ${lastSyncDate.toLocaleDateString()}`]
        if (totalPages > 1) {
          footerParts.push(`Page ${currentPage + 1}/${totalPages}`)
        }
        shareEmbed.setFooter({ text: footerParts.join(' • ') })

        // Post publicly to the channel
        await buttonInteraction.reply({
          embeds: [shareEmbed],
        })
        break
      }

      case 'sell':
      case 'buy': {
        // Allow orders from base (STORE) and warehouse (WAREHOUSE_STORE), but not ships
        const orderableItems = flatInventory.filter(
          item => item.storageType === 'STORE' || item.storageType === 'WAREHOUSE_STORE'
        )

        if (orderableItems.length === 0) {
          await buttonInteraction.reply({
            content:
              '❌ No items available for orders.\n\n' +
              'Orders can only be created from **base** (🏠) or **warehouse** (🏭) storage. ' +
              'Ship inventory (🚀) cannot be used for orders.',
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        // Show select menu to pick item
        const selectRow = createItemSelectMenu(
          orderableItems,
          action,
          idPrefix,
          locationDisplayMode
        )
        const selectResponse = await buttonInteraction.reply({
          content: `Select an item to ${action === 'sell' ? 'create a sell order for' : 'request'}:`,
          components: [selectRow],
          flags: MessageFlags.Ephemeral,
        })

        // Collector for select menu
        const selectCollector = selectResponse.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: COMPONENT_TIMEOUT,
          max: 1,
        })

        selectCollector.on('collect', async (selectInteraction: StringSelectMenuInteraction) => {
          const [commodityTicker, locationId] = selectInteraction.values[0].split(':')

          // Generate unique modal ID to avoid conflicts
          const modalId = `${idPrefix}:${action}-modal:${Date.now()}`
          const modal =
            action === 'sell'
              ? createSellModal(commodityTicker, locationId, modalId)
              : createBuyModal(commodityTicker, locationId, modalId)

          await selectInteraction.showModal(modal)

          try {
            // Await modal submit using the selectInteraction
            const modalSubmit = await selectInteraction
              .awaitModalSubmit({
                time: COMPONENT_TIMEOUT,
                filter: (i: ModalSubmitInteraction) =>
                  i.customId === modalId && i.user.id === selectInteraction.user.id,
              })
              .catch(() => null)

            if (!modalSubmit) {
              // Modal was cancelled or timed out
              return
            }

            if (action === 'sell') {
              await handleSellModalSubmit(modalSubmit, userId, commodityTicker, locationId)
            } else {
              await handleBuyModalSubmit(modalSubmit, userId, commodityTicker, locationId)
            }
          } catch (error) {
            console.error('Modal submission error:', error)
            // Try to inform user if possible
            try {
              await selectInteraction.followUp({
                content: '❌ An error occurred while processing your request.',
                flags: MessageFlags.Ephemeral,
              })
            } catch {
              // Interaction may no longer be valid
            }
          }
        })
        break
      }
    }
  })

  collector.on('end', async () => {
    try {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:expired`)
          .setLabel('Session expired - run /inventory again')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
      await interaction.editReply({ components: [disabledRow] })
    } catch {
      // Interaction may have been deleted
    }
  })
}

/**
 * Create a select menu for choosing an inventory item
 */
function createItemSelectMenu(
  items: InventoryItemData[],
  action: 'sell' | 'buy',
  idPrefix: string,
  locationDisplayMode: string
): ActionRowBuilder<StringSelectMenuBuilder> {
  // Dedupe by commodity+location+storageType and limit to 25 items (Discord limit)
  const uniqueItems = new Map<string, InventoryItemData>()
  for (const item of items) {
    const key = `${item.commodityTicker}:${item.locationId}:${item.storageType}`
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, item)
    }
  }

  const limitedItems = Array.from(uniqueItems.values()).slice(0, 25)

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${idPrefix}:select-${action}`)
    .setPlaceholder(`Select item to ${action === 'sell' ? 'sell' : 'request'}`)
    .addOptions(
      limitedItems.map(item => {
        let locationDisplay: string
        switch (locationDisplayMode) {
          case 'natural-ids-only':
            locationDisplay = item.locationId
            break
          case 'names-only':
            locationDisplay = item.locationName
            break
          default:
            locationDisplay = `${item.locationName} (${item.locationId})`
        }

        const storageIcon = getStorageTypeIcon(item.storageType)

        return {
          label: `${storageIcon} ${item.commodityTicker} @ ${item.locationId}`,
          description:
            action === 'sell'
              ? `${item.quantity.toLocaleString()} in ${item.storageType.toLowerCase().replace('_', ' ')}`
              : `Request at ${locationDisplay}`,
          value: `${item.commodityTicker}:${item.locationId}`,
        }
      })
    )

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
}

/**
 * Create sell order modal
 */
function createSellModal(
  commodityTicker: string,
  locationId: string,
  modalId: string
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(`Sell ${commodityTicker} @ ${locationId}`)

  const priceInput = new TextInputBuilder()
    .setCustomId('price')
    .setLabel('Price per unit')
    .setPlaceholder('e.g., 150.50')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(12)

  const currencyInput = new TextInputBuilder()
    .setCustomId('currency')
    .setLabel('Currency (CIS, ICA, AIC, NCC)')
    .setPlaceholder('CIS')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue('CIS')
    .setMaxLength(3)

  const orderTypeInput = new TextInputBuilder()
    .setCustomId('orderType')
    .setLabel('Visibility (internal or partner)')
    .setPlaceholder('internal')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue('internal')
    .setMaxLength(10)

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(currencyInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(orderTypeInput)
  )

  return modal
}

/**
 * Create buy order modal
 */
function createBuyModal(
  commodityTicker: string,
  locationId: string,
  modalId: string
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(`Buy Request: ${commodityTicker} @ ${locationId}`)

  const quantityInput = new TextInputBuilder()
    .setCustomId('quantity')
    .setLabel('Quantity needed')
    .setPlaceholder('e.g., 100')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10)

  const priceInput = new TextInputBuilder()
    .setCustomId('price')
    .setLabel('Price per unit')
    .setPlaceholder('e.g., 150.50')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(12)

  const currencyInput = new TextInputBuilder()
    .setCustomId('currency')
    .setLabel('Currency (CIS, ICA, AIC, NCC)')
    .setPlaceholder('CIS')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue('CIS')
    .setMaxLength(3)

  const orderTypeInput = new TextInputBuilder()
    .setCustomId('orderType')
    .setLabel('Visibility (internal or partner)')
    .setPlaceholder('internal')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue('internal')
    .setMaxLength(10)

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(currencyInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(orderTypeInput)
  )

  return modal
}

/**
 * Handle sell order modal submission
 */
async function handleSellModalSubmit(
  interaction: ModalSubmitInteraction,
  userId: number,
  commodityTicker: string,
  locationId: string
): Promise<void> {
  const priceStr = interaction.fields.getTextInputValue('price').trim()
  const currency = interaction.fields.getTextInputValue('currency').trim().toUpperCase()
  const orderType = interaction.fields.getTextInputValue('orderType').trim().toLowerCase()

  // Validate price
  const price = parseFloat(priceStr)
  if (isNaN(price) || price <= 0) {
    await interaction.reply({
      content: '❌ Invalid price. Please enter a positive number.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Validate currency
  const validCurrencies = ['CIS', 'ICA', 'AIC', 'NCC']
  if (!validCurrencies.includes(currency)) {
    await interaction.reply({
      content: `❌ Invalid currency. Valid options: ${validCurrencies.join(', ')}`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Validate order type
  if (orderType !== 'internal' && orderType !== 'partner') {
    await interaction.reply({
      content: '❌ Invalid visibility. Use "internal" or "partner".',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    // Upsert sell order
    await db
      .insert(sellOrders)
      .values({
        userId,
        commodityTicker,
        locationId,
        price: price.toFixed(2),
        currency: currency as 'CIS' | 'ICA' | 'AIC' | 'NCC',
        orderType: orderType as 'internal' | 'partner',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          sellOrders.userId,
          sellOrders.commodityTicker,
          sellOrders.locationId,
          sellOrders.orderType,
          sellOrders.currency,
        ],
        set: {
          price: price.toFixed(2),
          updatedAt: new Date(),
        },
      })

    const commodityDisplay = formatCommodity(commodityTicker)
    await interaction.reply({
      content:
        `✅ Sell order created/updated!\n\n` +
        `**${commodityDisplay}** @ **${locationId}**\n` +
        `Price: **${price.toFixed(2)} ${currency}**\n` +
        `Visibility: **${orderType}**`,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Failed to create sell order:', error)
    await interaction.reply({
      content: '❌ Failed to create sell order. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
  }
}

/**
 * Handle buy order modal submission
 */
async function handleBuyModalSubmit(
  interaction: ModalSubmitInteraction,
  userId: number,
  commodityTicker: string,
  locationId: string
): Promise<void> {
  const quantityStr = interaction.fields.getTextInputValue('quantity').trim()
  const priceStr = interaction.fields.getTextInputValue('price').trim()
  const currency = interaction.fields.getTextInputValue('currency').trim().toUpperCase()
  const orderType = interaction.fields.getTextInputValue('orderType').trim().toLowerCase()

  // Validate quantity
  const quantity = parseInt(quantityStr, 10)
  if (isNaN(quantity) || quantity <= 0) {
    await interaction.reply({
      content: '❌ Invalid quantity. Please enter a positive whole number.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Validate price
  const price = parseFloat(priceStr)
  if (isNaN(price) || price <= 0) {
    await interaction.reply({
      content: '❌ Invalid price. Please enter a positive number.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Validate currency
  const validCurrencies = ['CIS', 'ICA', 'AIC', 'NCC']
  if (!validCurrencies.includes(currency)) {
    await interaction.reply({
      content: `❌ Invalid currency. Valid options: ${validCurrencies.join(', ')}`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Validate order type
  if (orderType !== 'internal' && orderType !== 'partner') {
    await interaction.reply({
      content: '❌ Invalid visibility. Use "internal" or "partner".',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    // Upsert buy order
    await db
      .insert(buyOrders)
      .values({
        userId,
        commodityTicker,
        locationId,
        quantity,
        price: price.toFixed(2),
        currency: currency as 'CIS' | 'ICA' | 'AIC' | 'NCC',
        orderType: orderType as 'internal' | 'partner',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          buyOrders.userId,
          buyOrders.commodityTicker,
          buyOrders.locationId,
          buyOrders.orderType,
          buyOrders.currency,
        ],
        set: {
          quantity,
          price: price.toFixed(2),
          updatedAt: new Date(),
        },
      })

    const commodityDisplay = formatCommodity(commodityTicker)
    await interaction.reply({
      content:
        `✅ Buy request created/updated!\n\n` +
        `**${commodityDisplay}** @ **${locationId}**\n` +
        `Quantity: **${quantity.toLocaleString()}**\n` +
        `Price: **${price.toFixed(2)} ${currency}**\n` +
        `Visibility: **${orderType}**`,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Failed to create buy order:', error)
    await interaction.reply({
      content: '❌ Failed to create buy request. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
