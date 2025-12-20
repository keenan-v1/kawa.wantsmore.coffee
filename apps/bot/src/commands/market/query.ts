import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import type { MessageVisibility } from '@kawakawa/types'
import { parseXitJson, type XitMaterials } from '@kawakawa/types/xit'
import { db, sellOrders, buyOrders, users } from '@kawakawa/db'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { searchUsers } from '../../autocomplete/index.js'
import {
  resolveCommodity,
  resolveLocation,
  formatCommodity,
  formatLocation,
} from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import {
  getChannelConfig,
  resolveEffectiveValue,
  resolveMessageVisibility,
} from '../../services/channelConfig.js'
import { sendPaginatedResponse } from '../../components/pagination.js'
import { enrichSellOrdersWithQuantities } from '@kawakawa/services/market'
import {
  formatGroupedOrdersMulti,
  buildFilterDescription,
  type MultiResolvedFilters,
} from '../../services/orderFormatter.js'

const ORDERS_PER_PAGE = 10

/**
 * Parse a single token and resolve it to a commodity, location, or user.
 * Supports prefixed format (commodity:COF) and bare values (COF).
 */
async function parseToken(token: string): Promise<{
  type: 'commodity' | 'location' | 'user' | null
  commodity?: { ticker: string; name: string }
  location?: { naturalId: string; name: string; type: string }
  userId?: number
  username?: string
  displayName?: string
}> {
  // Check for prefix
  if (token.startsWith('commodity:')) {
    const ticker = token.slice('commodity:'.length)
    const commodity = await resolveCommodity(ticker)
    return commodity ? { type: 'commodity', commodity } : { type: null }
  }

  if (token.startsWith('location:')) {
    const locationId = token.slice('location:'.length)
    const location = await resolveLocation(locationId)
    return location ? { type: 'location', location } : { type: null }
  }

  if (token.startsWith('user:')) {
    const userQuery = token.slice('user:'.length)
    // Use fuzzy search (matches username, displayName, or FIO username)
    const userResults = await searchUsers(userQuery, 1)
    if (userResults.length > 0) {
      const foundUser = await db.query.users.findFirst({
        where: eq(users.username, userResults[0].username),
      })
      if (foundUser) {
        return {
          type: 'user',
          userId: foundUser.id,
          username: userResults[0].username,
          displayName: userResults[0].displayName,
        }
      }
    }
    return { type: null }
  }

  // No prefix - auto-detect: commodity → location → user
  const commodity = await resolveCommodity(token)
  if (commodity) {
    return { type: 'commodity', commodity }
  }

  const location = await resolveLocation(token)
  if (location) {
    return { type: 'location', location }
  }

  // Try fuzzy user search
  const userResults = await searchUsers(token, 1)
  if (userResults.length > 0) {
    const foundUser = await db.query.users.findFirst({
      where: eq(users.username, userResults[0].username),
    })
    if (foundUser) {
      return {
        type: 'user',
        userId: foundUser.id,
        username: userResults[0].username,
        displayName: userResults[0].displayName,
      }
    }
  }

  return { type: null }
}

export const query: Command = {
  data: new SlashCommandBuilder()
    .setName('query')
    .setDescription('Flexible search by commodity, location, or user (supports multiple filters)')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('Search terms (e.g., "COF BEN" or "commodity:COF location:BEN")')
        .setRequired(true)
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

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const queryInput = interaction.options.getString('query')
    let orderType: 'all' | 'sell' | 'buy' =
      (interaction.options.getString('type') as 'all' | 'sell' | 'buy' | null) || 'sell'

    // Check for XIT JSON input
    let xitQuantities: XitMaterials | undefined
    let xitName: string | undefined
    let xitCommodities: string[] = []

    if (queryInput?.trim().startsWith('{')) {
      const xitResult = parseXitJson(queryInput)
      if (xitResult.success) {
        xitQuantities = xitResult.materials
        xitName = xitResult.name
        xitCommodities = Object.keys(xitResult.materials)
        // Force sell orders when using XIT (XIT is always a buying context)
        orderType = 'sell'
      }
    }
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
    // For query, 'internal' is the system default
    const visibility: 'all' | 'internal' | 'partner' = resolveEffectiveValue(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false,
      'internal' as const,
      'internal' as const
    )

    // Parse all tokens from query input - collect multiple values for each type
    const resolvedCommodities: { ticker: string; name: string }[] = []
    const resolvedLocations: { naturalId: string; name: string; type: string }[] = []
    const resolvedUserIds: number[] = []
    const resolvedDisplayNames: string[] = []

    // If XIT JSON was parsed, resolve XIT commodities instead of normal tokens
    if (xitCommodities.length > 0) {
      for (const ticker of xitCommodities) {
        const commodity = await resolveCommodity(ticker)
        if (commodity) {
          resolvedCommodities.push(commodity)
        }
      }
    } else if (queryInput) {
      // Normal token parsing
      // Split by comma or whitespace, filter empty tokens
      const tokens = queryInput.split(/[,\s]+/).filter(Boolean)
      const unresolvedTokens: string[] = []

      for (const token of tokens) {
        const result = await parseToken(token)

        if (result.type === 'commodity' && result.commodity) {
          // Only add if not already present (by ticker)
          if (!resolvedCommodities.some(c => c.ticker === result.commodity!.ticker)) {
            resolvedCommodities.push(result.commodity)
          }
        } else if (result.type === 'location' && result.location) {
          // Only add if not already present (by naturalId)
          if (!resolvedLocations.some(l => l.naturalId === result.location!.naturalId)) {
            resolvedLocations.push(result.location)
          }
        } else if (result.type === 'user' && result.userId) {
          // Only add if not already present (by userId)
          if (!resolvedUserIds.includes(result.userId)) {
            resolvedUserIds.push(result.userId)
            resolvedDisplayNames.push(result.displayName || result.username || '')
          }
        } else if (result.type === null) {
          unresolvedTokens.push(token)
        }
      }

      // If we have unresolved tokens and nothing was resolved, show error
      if (
        unresolvedTokens.length > 0 &&
        resolvedCommodities.length === 0 &&
        resolvedLocations.length === 0 &&
        resolvedUserIds.length === 0
      ) {
        await interaction.reply({
          content:
            `❌ Could not resolve: ${unresolvedTokens.map(t => `"${t}"`).join(', ')}\n\n` +
            'Use the autocomplete suggestions to find valid commodities, locations, or users.',
          flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
        })
        return
      }
    }

    // Build filter description for embed
    const locationDisplayStrings = await Promise.all(
      resolvedLocations.map(l => formatLocation(l.naturalId, displaySettings.locationDisplayMode))
    )
    let filterDesc = buildFilterDescription(
      resolvedCommodities.map(c => formatCommodity(c.ticker)),
      locationDisplayStrings,
      resolvedDisplayNames.filter(Boolean),
      orderType,
      visibility,
      { visibilityEnforced: channelSettings?.visibilityEnforced ?? false }
    )

    // Add XIT indicator to description if active
    if (xitQuantities) {
      const xitLabel = xitName ? `XIT: ${xitName}` : 'XIT Mode'
      filterDesc = `🧊 ${xitLabel}\n${filterDesc}`
    }

    // Fetch sell orders (no limit - we paginate client-side)
    const sellOrdersData =
      orderType === 'buy'
        ? []
        : await db.query.sellOrders.findMany({
            where: and(
              resolvedCommodities.length > 0
                ? inArray(
                    sellOrders.commodityTicker,
                    resolvedCommodities.map(c => c.ticker)
                  )
                : undefined,
              resolvedLocations.length > 0
                ? inArray(
                    sellOrders.locationId,
                    resolvedLocations.map(l => l.naturalId)
                  )
                : undefined,
              resolvedUserIds.length > 0 ? inArray(sellOrders.userId, resolvedUserIds) : undefined,
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
              resolvedCommodities.length > 0
                ? inArray(
                    buyOrders.commodityTicker,
                    resolvedCommodities.map(c => c.ticker)
                  )
                : undefined,
              resolvedLocations.length > 0
                ? inArray(
                    buyOrders.locationId,
                    resolvedLocations.map(l => l.naturalId)
                  )
                : undefined,
              resolvedUserIds.length > 0 ? inArray(buyOrders.userId, resolvedUserIds) : undefined,
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

    // Build resolved filters for grouping logic
    const resolvedFilters: MultiResolvedFilters = {
      commodities: resolvedCommodities,
      locations: resolvedLocations,
      userIds: resolvedUserIds,
      displayNames: resolvedDisplayNames,
    }

    // Format orders as grouped paginated items
    const allItems = await formatGroupedOrdersMulti(
      sellOrdersData,
      buyOrdersData,
      sellQuantities,
      resolvedFilters,
      displaySettings.locationDisplayMode,
      orderType,
      visibility,
      xitQuantities
    )

    // Build base embed
    const embed = new EmbedBuilder()
      .setTitle('📦 Market Orders')
      .setColor(0x5865f2)
      .setDescription(filterDesc)
      .setTimestamp()

    // Send announcement to configured channel if enabled
    // Pick the announce channel based on effective visibility
    const announceChannelId =
      visibility === 'internal'
        ? channelSettings?.announceInternal
        : visibility === 'partner'
          ? channelSettings?.announcePartner
          : null // 'all' visibility doesn't trigger announcements

    if (announceChannelId && (resolvedCommodities.length > 0 || resolvedLocations.length > 0)) {
      const parts: string[] = []

      if (resolvedCommodities.length > 0) {
        const commodityList = resolvedCommodities.map(c => `**${formatCommodity(c.ticker)}**`)
        parts.push(commodityList.join(', '))
      }

      if (resolvedLocations.length > 0) {
        const locationList = await Promise.all(
          resolvedLocations.map(l =>
            formatLocation(l.naturalId, displaySettings.locationDisplayMode)
          )
        )
        parts.push(`at ${locationList.map(l => `**${l}**`).join(', ')}`)
      }

      // Get the member's server display name (nickname or fallback to username)
      const member = interaction.member
      const memberName =
        member && 'displayName' in member ? member.displayName : interaction.user.displayName

      const announcement = `👀 **${memberName}** is interested in ${parts.join(' ')}`

      // Send to the configured announce channel (different from current channel)
      try {
        const announceChannel = await interaction.client.channels.fetch(announceChannelId)
        if (announceChannel && 'send' in announceChannel) {
          await announceChannel.send(announcement)
        }
      } catch {
        // Silently ignore if announce channel is inaccessible
      }
    }

    // Send paginated response after announcement is delivered
    await sendPaginatedResponse(interaction, embed, allItems, {
      pageSize: ORDERS_PER_PAGE,
      allowShare: true,
      footerText: isEphemeral ? 'Use 📢 Share to post publicly' : undefined,
      ephemeral: isEphemeral,
    })
  },
}
