import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, sellOrders, buyOrders, users } from '@kawakawa/db'
import { eq, and, desc } from 'drizzle-orm'
import { searchCommodities, searchLocations, searchUsers } from '../../autocomplete/index.js'
import {
  resolveCommodity,
  resolveLocation,
  formatCommodity,
  formatLocation,
} from '../../services/display.js'
import { getDisplaySettings, getFioUsernames } from '../../services/userSettings.js'
import { sendPaginatedResponse } from '../../components/pagination.js'
import { enrichSellOrdersWithQuantities } from '@kawakawa/services/market'
import {
  formatGroupedOrdersMulti,
  buildFilterDescription,
  type MultiResolvedFilters,
} from '../../services/orderFormatter.js'

const ORDERS_PER_PAGE = 10

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
      (interaction.options.getString('type') as 'all' | 'sell' | 'buy' | null) || 'sell'
    const visibility =
      (interaction.options.getString('visibility') as 'all' | 'internal' | 'partner' | null) ||
      'internal'

    // Get user's display preferences
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Resolve inputs
    let resolvedCommodity: { ticker: string; name: string } | null = null
    let resolvedLocation: { naturalId: string; name: string; type: string } | null = null
    let resolvedUserId: number | null = null
    let resolvedDisplayName: string | null = null

    if (commodityInput) {
      resolvedCommodity = await resolveCommodity(commodityInput)
      if (!resolvedCommodity) {
        await interaction.reply({
          content: `❌ Commodity "${commodityInput}" not found.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    }

    if (locationInput) {
      resolvedLocation = await resolveLocation(locationInput)
      if (!resolvedLocation) {
        await interaction.reply({
          content: `❌ Location "${locationInput}" not found.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    }

    if (userInput) {
      const userResults = await searchUsers(userInput, 1)
      if (userResults.length === 0) {
        await interaction.reply({
          content: `❌ User "${userInput}" not found.`,
          flags: MessageFlags.Ephemeral,
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
    }

    // Build filter description for embed
    const filterDesc = buildFilterDescription(
      resolvedCommodity ? [formatCommodity(resolvedCommodity.ticker)] : [],
      resolvedLocation
        ? [await formatLocation(resolvedLocation.naturalId, displaySettings.locationDisplayMode)]
        : [],
      resolvedDisplayName ? [resolvedDisplayName] : [],
      orderType,
      visibility
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
        flags: MessageFlags.Ephemeral,
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

    // Build base embed
    const embed = new EmbedBuilder()
      .setTitle('📦 Market Orders')
      .setColor(0x5865f2)
      .setDescription(filterDesc)
      .setTimestamp()

    // Send paginated response
    await sendPaginatedResponse(interaction, embed, allItems, {
      pageSize: ORDERS_PER_PAGE,
      allowShare: true,
      footerText: 'Use 📢 Share to post publicly',
    })
  },
}
