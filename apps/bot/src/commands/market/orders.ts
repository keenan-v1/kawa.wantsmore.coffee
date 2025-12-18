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
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import type { MessageVisibility } from '@kawakawa/types'
import { db, sellOrders, buyOrders, users, userDiscordProfiles } from '@kawakawa/db'
import { eq, and, desc } from 'drizzle-orm'
import { searchCommodities, searchLocations, searchUsers } from '../../autocomplete/index.js'
import {
  resolveCommodity,
  resolveLocation,
  formatCommodity,
  formatLocation,
} from '../../services/display.js'
import { getDisplaySettings, getFioUsernames } from '../../services/userSettings.js'
import {
  getChannelConfig,
  resolveEffectiveValue,
  resolveMessageVisibility,
} from '../../services/channelConfig.js'
import { enrichSellOrdersWithQuantities, getOrderDisplayPrice } from '@kawakawa/services/market'
import {
  formatGroupedOrdersMulti,
  buildFilterDescription,
  type MultiResolvedFilters,
} from '../../services/orderFormatter.js'
import { isValidCurrency, VALID_CURRENCIES, type ValidCurrency } from '../../utils/validation.js'
import { replyError } from '../../utils/replies.js'
import logger from '../../utils/logger.js'

const ORDERS_PER_PAGE = 10
const COMPONENT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export const orders: Command = {
  data: new SlashCommandBuilder()
    .setName('orders')
    .setDescription('View market orders with filters')
    .addStringOption(option =>
      option.setName('commodity').setDescription('Filter by commodity ticker').setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('location').setDescription('Filter by location').setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('user').setDescription('Filter by user').setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Filter by order type (default sell)')
        .addChoices(
          { name: 'All Orders', value: 'all' },
          { name: 'Sell Orders', value: 'sell' },
          { name: 'Buy Orders', value: 'buy' }
        )
    )
    .addStringOption(option =>
      option
        .setName('visibility')
        .setDescription('Filter by visibility (default internal)')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Internal (members)', value: 'internal' },
          { name: 'Partner (trade partners)', value: 'partner' }
        )
    )
    .addStringOption(option =>
      option
        .setName('reply')
        .setDescription('Reply visibility (default: your preference)')
        .addChoices(
          { name: 'Private (only you)', value: 'ephemeral' },
          { name: 'Public (everyone)', value: 'public' }
        )
    ) as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true)
    const query = focusedOption.value
    const discordId = interaction.user.id

    if (!query.trim()) {
      await interaction.respond([])
      return
    }

    let choices: { name: string; value: string }[] = []

    if (focusedOption.name === 'commodity') {
      const commodities = await searchCommodities(query, 25, discordId)
      choices = commodities.map(c => ({
        name: `${c.ticker} - ${c.name}`,
        value: c.ticker,
      }))
    } else if (focusedOption.name === 'location') {
      const locations = await searchLocations(query, 25, discordId)
      choices = locations.map(l => ({
        name: `${l.naturalId} - ${l.name}`,
        value: l.naturalId,
      }))
    } else if (focusedOption.name === 'user') {
      const users = await searchUsers(query, 25)
      choices = users.map(u => ({
        name: u.displayName !== u.username ? `${u.displayName} (${u.username})` : u.username,
        value: u.username,
      }))
    }

    await interaction.respond(choices.slice(0, 25))
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const commodityInput = interaction.options.getString('commodity')
    const locationInput = interaction.options.getString('location')
    const userInput = interaction.options.getString('user')
    const orderType =
      (interaction.options.getString('type') as 'all' | 'sell' | 'buy' | null) || 'all'
    const visibilityOption = interaction.options.getString('visibility') as
      | 'all'
      | 'internal'
      | 'partner'
      | null
    const replyOption = interaction.options.getString('reply') as MessageVisibility | null

    // Get user's display preferences
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Get channel defaults (if configured)
    const channelId = interaction.channelId
    const channelSettings = await getChannelConfig(channelId)

    // Resolve message visibility (command > channel > user > system default)
    const { isEphemeral } = resolveMessageVisibility(
      replyOption,
      channelSettings,
      displaySettings.messageVisibility
    )

    // Determine visibility using channel defaults
    // For view commands, 'all' means no filter, so we use it as the system default
    const visibility: 'all' | 'internal' | 'partner' = resolveEffectiveValue(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false,
      'all' as const,
      'all' as const
    )

    // Check if user has a linked account (for default behavior and manage button)
    const discordProfile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, interaction.user.id),
    })
    const currentUserId = discordProfile?.userId ?? null

    // Resolve inputs
    let resolvedCommodity: { ticker: string; name: string } | null = null
    let resolvedLocation: { naturalId: string; name: string; type: string } | null = null
    let resolvedUserId: number | null = null
    let resolvedDisplayName: string | null = null
    let isDefaultingToSelf = false

    if (commodityInput) {
      resolvedCommodity = await resolveCommodity(commodityInput)
      if (!resolvedCommodity) {
        await interaction.reply({
          content: `❌ Commodity "${commodityInput}" not found.`,
          flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
        })
        return
      }
    }

    if (locationInput) {
      resolvedLocation = await resolveLocation(locationInput)
      if (!resolvedLocation) {
        await interaction.reply({
          content: `❌ Location "${locationInput}" not found.`,
          flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
        })
        return
      }
    }

    if (userInput) {
      const userResults = await searchUsers(userInput, 1)
      if (userResults.length === 0) {
        await interaction.reply({
          content: `❌ User "${userInput}" not found.`,
          flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
        })
        return
      }
      const foundUser = await db.query.users.findFirst({
        where: eq(users.username, userResults[0].username),
      })
      if (foundUser) {
        resolvedUserId = foundUser.id
        resolvedDisplayName = userResults[0].displayName
      }
    } else if (!commodityInput && !locationInput && currentUserId) {
      // Default to showing current user's orders when no filters are provided
      resolvedUserId = currentUserId
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, currentUserId),
      })
      resolvedDisplayName = currentUser?.displayName ?? 'You'
      isDefaultingToSelf = true
    }

    // Build filter description for embed
    const filterDesc = buildFilterDescription(
      resolvedCommodity ? [formatCommodity(resolvedCommodity.ticker)] : [],
      resolvedLocation
        ? [await formatLocation(resolvedLocation.naturalId, displaySettings.locationDisplayMode)]
        : [],
      resolvedDisplayName ? [resolvedDisplayName] : [],
      orderType,
      visibility,
      { visibilityEnforced: channelSettings?.visibilityEnforced ?? false }
    )

    // Fetch sell orders
    const sellOrdersData =
      orderType === 'buy'
        ? []
        : await db.query.sellOrders.findMany({
            where: and(
              resolvedCommodity
                ? eq(sellOrders.commodityTicker, resolvedCommodity.ticker)
                : undefined,
              resolvedLocation ? eq(sellOrders.locationId, resolvedLocation.naturalId) : undefined,
              resolvedUserId ? eq(sellOrders.userId, resolvedUserId) : undefined,
              visibility && visibility !== 'all' ? eq(sellOrders.orderType, visibility) : undefined
            ),
            with: {
              user: true,
              commodity: true,
              location: true,
            },
            orderBy: [desc(sellOrders.updatedAt)],
          })

    // Fetch buy orders
    const buyOrdersData =
      orderType === 'sell'
        ? []
        : await db.query.buyOrders.findMany({
            where: and(
              resolvedCommodity
                ? eq(buyOrders.commodityTicker, resolvedCommodity.ticker)
                : undefined,
              resolvedLocation ? eq(buyOrders.locationId, resolvedLocation.naturalId) : undefined,
              resolvedUserId ? eq(buyOrders.userId, resolvedUserId) : undefined,
              visibility && visibility !== 'all' ? eq(buyOrders.orderType, visibility) : undefined
            ),
            with: {
              user: true,
              commodity: true,
              location: true,
            },
            orderBy: [desc(buyOrders.updatedAt)],
          })

    // Check if any orders found
    const hasOrders = sellOrdersData.length > 0 || buyOrdersData.length > 0

    if (!hasOrders) {
      await interaction.reply({
        content: `📭 No orders found matching your filters.\n\n*${filterDesc}*`,
        flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
      })
      return
    }

    // Collect all user IDs and fetch FIO usernames
    const allUserIds = [...sellOrdersData.map(o => o.userId), ...buyOrdersData.map(o => o.userId)]
    const fioUsernameMap = await getFioUsernames(allUserIds)

    // Merge FIO usernames into order data
    const enrichedSellOrders = sellOrdersData.map(o => ({
      ...o,
      user: {
        ...o.user,
        fioUsername: fioUsernameMap.get(o.userId),
      },
    }))
    const enrichedBuyOrders = buyOrdersData.map(o => ({
      ...o,
      user: {
        ...o.user,
        fioUsername: fioUsernameMap.get(o.userId),
      },
    }))

    // Enrich sell orders with inventory and reservation quantities
    const sellQuantities = await enrichSellOrdersWithQuantities(
      sellOrdersData.map(o => ({
        id: o.id,
        userId: o.userId,
        commodityTicker: o.commodityTicker,
        locationId: o.locationId,
        limitMode: o.limitMode,
        limitQuantity: o.limitQuantity,
      }))
    )

    // Build resolved filters for grouping logic (wrap single values in arrays for multi formatter)
    const resolvedFilters: MultiResolvedFilters = {
      commodities: resolvedCommodity ? [resolvedCommodity] : [],
      locations: resolvedLocation ? [resolvedLocation] : [],
      userIds: resolvedUserId ? [resolvedUserId] : [],
      displayNames: resolvedDisplayName ? [resolvedDisplayName] : [],
    }

    // Format orders as grouped paginated items
    const allItems = await formatGroupedOrdersMulti(
      enrichedSellOrders,
      enrichedBuyOrders,
      sellQuantities,
      resolvedFilters,
      displaySettings.locationDisplayMode,
      orderType,
      visibility
    )

    // Build base embed with dynamic title
    const embedTitle = isDefaultingToSelf ? '📦 Your Orders' : '📦 Market Orders'
    const baseEmbed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setColor(0x5865f2)
      .setDescription(filterDesc)
      .setTimestamp()

    // Custom pagination with Manage button
    await sendOrdersWithManage(interaction, baseEmbed, allItems, currentUserId, isEphemeral)
  },
}

/**
 * Send orders with pagination and manage functionality.
 */
async function sendOrdersWithManage(
  interaction: ChatInputCommandInteraction,
  baseEmbed: EmbedBuilder,
  allItems: { name: string; value: string; inline?: boolean }[],
  currentUserId: number | null,
  isEphemeral: boolean
): Promise<void> {
  const idPrefix = `orders:${Date.now()}`

  // Calculate pages
  const pages = calculateOrderPages(allItems, ORDERS_PER_PAGE)
  const totalPages = pages.length
  let currentPage = 0

  const buildEmbed = (page: number): EmbedBuilder => {
    const embed = EmbedBuilder.from(baseEmbed)
    const pageItems = pages[page] || []
    embed.setFields(...pageItems.map(item => ({ ...item, inline: item.inline ?? true })))

    const footerLines: string[] = []
    if (isEphemeral) {
      footerLines.push('📢 Share to post publicly')
    }
    if (currentUserId) {
      footerLines.push('🗑️ Manage to edit or delete your orders')
    }
    footerLines.push(`Page ${page + 1}/${totalPages}`)
    embed.setFooter({ text: footerLines.join('\n') })

    return embed
  }

  const buildButtons = (page: number): ActionRowBuilder<ButtonBuilder> => {
    const row = new ActionRowBuilder<ButtonBuilder>()

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:prev`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:info`)
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:next`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    )

    // Add share button only if ephemeral
    if (isEphemeral) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:share`)
          .setLabel('📢 Share')
          .setStyle(ButtonStyle.Primary)
      )
    }

    // Add manage button if user is linked
    if (currentUserId) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:manage`)
          .setLabel('🗑️ Manage')
          .setStyle(ButtonStyle.Danger)
      )
    }

    return row
  }

  const response = await interaction.reply({
    embeds: [buildEmbed(0)],
    components: [buildButtons(0)],
    flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
  })

  const collector = response.createMessageComponentCollector({
    time: COMPONENT_TIMEOUT,
    filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
  })

  collector.on(
    'collect',
    async (btnInteraction: ButtonInteraction | StringSelectMenuInteraction) => {
      if (btnInteraction.isButton()) {
        const action = btnInteraction.customId.split(':')[2]

        switch (action) {
          case 'prev':
            if (currentPage > 0) currentPage--
            await btnInteraction.update({
              embeds: [buildEmbed(currentPage)],
              components: [buildButtons(currentPage)],
            })
            break

          case 'next':
            if (currentPage < totalPages - 1) currentPage++
            await btnInteraction.update({
              embeds: [buildEmbed(currentPage)],
              components: [buildButtons(currentPage)],
            })
            break

          case 'share': {
            const member = interaction.member
            const sharedByName =
              member && 'displayName' in member ? member.displayName : interaction.user.displayName
            const shareEmbed = buildEmbed(currentPage)
            shareEmbed.setFooter({ text: `Shared by ${sharedByName}` })
            await btnInteraction.reply({ embeds: [shareEmbed] })
            break
          }

          case 'manage': {
            if (!currentUserId) {
              await btnInteraction.reply({
                content: '❌ You need a linked account to manage orders.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            // Fetch user's own orders
            const userSellOrders = await db.query.sellOrders.findMany({
              where: eq(sellOrders.userId, currentUserId),
              with: { commodity: true, location: true },
              orderBy: [desc(sellOrders.updatedAt)],
            })
            const userBuyOrders = await db.query.buyOrders.findMany({
              where: eq(buyOrders.userId, currentUserId),
              with: { commodity: true, location: true },
              orderBy: [desc(buyOrders.updatedAt)],
            })

            if (userSellOrders.length === 0 && userBuyOrders.length === 0) {
              await btnInteraction.reply({
                content: '📭 You have no orders to manage.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            // Build select menu options (single select for edit/delete)
            // Resolve prices from price lists
            const sellOrderOptions = await Promise.all(
              userSellOrders.slice(0, 12).map(async order => {
                const priceInfo = await getOrderDisplayPrice({
                  price: order.price,
                  currency: order.currency,
                  priceListCode: order.priceListCode,
                  commodityTicker: order.commodityTicker,
                  locationId: order.locationId,
                })
                const displayPrice = priceInfo ? priceInfo.price.toFixed(2) : order.price
                const displayCurrency = priceInfo ? priceInfo.currency : order.currency
                return {
                  label: `📤 SELL ${order.commodityTicker} @ ${order.locationId}`,
                  value: `sell:${order.id}`,
                  description: `${displayPrice} ${displayCurrency} (${order.orderType})`,
                }
              })
            )

            const buyOrderOptions = await Promise.all(
              userBuyOrders.slice(0, 12).map(async order => {
                const priceInfo = await getOrderDisplayPrice({
                  price: order.price,
                  currency: order.currency,
                  priceListCode: order.priceListCode,
                  commodityTicker: order.commodityTicker,
                  locationId: order.locationId,
                })
                const displayPrice = priceInfo ? priceInfo.price.toFixed(2) : order.price
                const displayCurrency = priceInfo ? priceInfo.currency : order.currency
                return {
                  label: `📥 BUY ${order.commodityTicker} @ ${order.locationId}`,
                  value: `buy:${order.id}`,
                  description: `${order.quantity}x @ ${displayPrice} ${displayCurrency}`,
                }
              })
            )

            const options = [...sellOrderOptions, ...buyOrderOptions]

            if (options.length === 0) {
              await btnInteraction.reply({
                content: '📭 You have no orders to manage.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            const selectMenuId = `${idPrefix}:order-select`
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(selectMenuId)
              .setPlaceholder('Select an order to edit or delete')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(options.slice(0, 25))

            const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              selectMenu
            )

            const manageReply = await btnInteraction.reply({
              content: '**Select an order to manage:**',
              components: [selectRow],
              flags: MessageFlags.Ephemeral,
              withResponse: true,
            })

            // Wait for order selection on this reply message
            try {
              const selectInteraction = await manageReply.resource?.message?.awaitMessageComponent({
                filter: i => i.customId === selectMenuId && i.user.id === interaction.user.id,
                time: 60000,
              })

              if (selectInteraction?.isStringSelectMenu()) {
                const selected = selectInteraction.values[0]
                const [selectedOrderType, selectedOrderId] = selected.split(':')

                // Show edit/delete buttons for the selected order
                const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`action:edit:${selectedOrderType}:${selectedOrderId}`)
                    .setLabel('✏️ Edit')
                    .setStyle(ButtonStyle.Primary),
                  new ButtonBuilder()
                    .setCustomId(`action:delete:${selectedOrderType}:${selectedOrderId}`)
                    .setLabel('🗑️ Delete')
                    .setStyle(ButtonStyle.Danger)
                )

                const actionReply = await selectInteraction.update({
                  content: `**Selected:** ${selectedOrderType === 'sell' ? '📤 Sell' : '📥 Buy'} order #${selectedOrderId}\n\nWhat would you like to do?`,
                  components: [buttonRow],
                })

                // Wait for edit/delete action
                const actionInteraction = await actionReply.awaitMessageComponent({
                  filter: i =>
                    i.customId.startsWith('action:') && i.user.id === interaction.user.id,
                  time: 60000,
                })

                if (actionInteraction?.isButton()) {
                  const actionParts = actionInteraction.customId.split(':')
                  const actionType = actionParts[1]
                  const orderType = actionParts[2]
                  const orderId = parseInt(actionParts[3], 10)

                  await handleOrderAction(
                    actionInteraction,
                    interaction,
                    actionType,
                    orderType,
                    orderId,
                    currentUserId
                  )
                }
              }
            } catch {
              // Selection timed out
            }
            break
          }
        }
      }
    }
  )

  collector.on('end', async () => {
    try {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:expired`)
          .setLabel('Session expired - run /orders again')
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
 * Calculate pages for orders display.
 */
function calculateOrderPages(
  items: { name: string; value: string; inline?: boolean }[],
  pageSize: number
): { name: string; value: string; inline?: boolean }[][] {
  const pages: { name: string; value: string; inline?: boolean }[][] = []

  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize))
  }

  if (pages.length === 0) {
    pages.push([])
  }

  return pages
}

/**
 * Handle order edit or delete action.
 */
async function handleOrderAction(
  btnInteraction: ButtonInteraction,
  originalInteraction: ChatInputCommandInteraction,
  actionType: string,
  orderType: string,
  orderId: number,
  userId: number
): Promise<void> {
  if (actionType === 'delete') {
    // Delete the order
    if (orderType === 'sell') {
      await db
        .delete(sellOrders)
        .where(and(eq(sellOrders.id, orderId), eq(sellOrders.userId, userId)))
    } else {
      await db.delete(buyOrders).where(and(eq(buyOrders.id, orderId), eq(buyOrders.userId, userId)))
    }

    logger.info({ orderId, orderType, userId }, 'Order deleted')

    await btnInteraction.update({
      content: '✅ Order deleted.',
      components: [],
    })
    return
  }

  // Edit action - show modal
  if (orderType === 'sell') {
    const order = await db.query.sellOrders.findFirst({
      where: and(eq(sellOrders.id, orderId), eq(sellOrders.userId, userId)),
    })
    if (!order) {
      await btnInteraction.reply({
        content: '❌ Order not found or you do not own it.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const modalId = `edit-modal:sell:${orderId}:${Date.now()}`
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Edit Sell Order: ${order.commodityTicker}`)

    const priceInput = new TextInputBuilder()
      .setCustomId('price')
      .setLabel('Price')
      .setStyle(TextInputStyle.Short)
      .setValue(order.price.toString())
      .setRequired(true)

    const currencyInput = new TextInputBuilder()
      .setCustomId('currency')
      .setLabel('Currency (CIS, AIC, ICA, NCC)')
      .setStyle(TextInputStyle.Short)
      .setValue(order.currency)
      .setRequired(true)

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(currencyInput)
    )

    await btnInteraction.showModal(modal)

    try {
      const modalSubmit = await btnInteraction.awaitModalSubmit({
        filter: i => i.customId === modalId && i.user.id === originalInteraction.user.id,
        time: 60000,
      })

      const newPrice = parseFloat(modalSubmit.fields.getTextInputValue('price'))
      const newCurrency = modalSubmit.fields.getTextInputValue('currency').toUpperCase()

      if (isNaN(newPrice) || newPrice <= 0) {
        await modalSubmit.reply({
          content: '❌ Invalid price. Please enter a positive number.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      if (!isValidCurrency(newCurrency)) {
        await replyError(
          modalSubmit,
          `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(', ')}`
        )
        return
      }

      await db
        .update(sellOrders)
        .set({
          price: newPrice.toString(),
          currency: newCurrency as ValidCurrency,
          updatedAt: new Date(),
        })
        .where(and(eq(sellOrders.id, orderId), eq(sellOrders.userId, userId)))

      logger.info({ orderId, orderType: 'sell', userId, newPrice, newCurrency }, 'Order updated')

      await modalSubmit.reply({
        content: `✅ Sell order updated: ${newPrice} ${newCurrency}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch {
      // Modal timed out or was dismissed
    }
  } else {
    const order = await db.query.buyOrders.findFirst({
      where: and(eq(buyOrders.id, orderId), eq(buyOrders.userId, userId)),
    })
    if (!order) {
      await btnInteraction.reply({
        content: '❌ Order not found or you do not own it.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const modalId = `edit-modal:buy:${orderId}:${Date.now()}`
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Edit Buy Order: ${order.commodityTicker}`)

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Quantity')
      .setStyle(TextInputStyle.Short)
      .setValue(order.quantity.toString())
      .setRequired(true)

    const priceInput = new TextInputBuilder()
      .setCustomId('price')
      .setLabel('Price')
      .setStyle(TextInputStyle.Short)
      .setValue(order.price.toString())
      .setRequired(true)

    const currencyInput = new TextInputBuilder()
      .setCustomId('currency')
      .setLabel('Currency (CIS, AIC, ICA, NCC)')
      .setStyle(TextInputStyle.Short)
      .setValue(order.currency)
      .setRequired(true)

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(currencyInput)
    )

    await btnInteraction.showModal(modal)

    try {
      const modalSubmit = await btnInteraction.awaitModalSubmit({
        filter: i => i.customId === modalId && i.user.id === originalInteraction.user.id,
        time: 60000,
      })

      const newQuantity = parseInt(modalSubmit.fields.getTextInputValue('quantity'), 10)
      const newPrice = parseFloat(modalSubmit.fields.getTextInputValue('price'))
      const newCurrency = modalSubmit.fields.getTextInputValue('currency').toUpperCase()

      if (isNaN(newQuantity) || newQuantity <= 0) {
        await modalSubmit.reply({
          content: '❌ Invalid quantity. Please enter a positive integer.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      if (isNaN(newPrice) || newPrice <= 0) {
        await modalSubmit.reply({
          content: '❌ Invalid price. Please enter a positive number.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      if (!isValidCurrency(newCurrency)) {
        await replyError(
          modalSubmit,
          `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(', ')}`
        )
        return
      }

      await db
        .update(buyOrders)
        .set({
          quantity: newQuantity,
          price: newPrice.toString(),
          currency: newCurrency as ValidCurrency,
          updatedAt: new Date(),
        })
        .where(and(eq(buyOrders.id, orderId), eq(buyOrders.userId, userId)))

      logger.info(
        { orderId, orderType: 'buy', userId, newQuantity, newPrice, newCurrency },
        'Order updated'
      )

      await modalSubmit.reply({
        content: `✅ Buy order updated: ${newQuantity}x @ ${newPrice} ${newCurrency}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch {
      // Modal timed out or was dismissed
    }
  }
}
