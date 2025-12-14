/**
 * /sell command - Create sell orders with flexible input
 *
 * Supports:
 * - Comma-separated tickers: /sell COF,CAF,H2O Katoa
 * - Space-separated input: /sell H Stella 1500
 * - Limit modifiers: reserve:X, max:X
 * - Auto-pricing from user's default price list
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, sellOrders, priceLists } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { searchLocations } from '../../autocomplete/index.js'
import { formatCommodity, formatLocation, resolveLocation } from '../../services/display.js'
import { getMarketSettings, getDisplaySettings } from '../../services/userSettings.js'
import {
  getChannelDefaults,
  resolveEffectiveValue,
  wasOverriddenByChannel,
} from '../../services/channelDefaults.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { isValidCurrency, VALID_CURRENCIES, type ValidCurrency } from '../../utils/validation.js'
import { parseOrderInput, formatLimitMode, type LimitMode } from '../../utils/orderInputParser.js'
import { calculateEffectivePriceWithFallback } from '@kawakawa/services/market'
import logger from '../../utils/logger.js'

export const sell: Command = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Create sell order(s)')
    .addStringOption(option =>
      option
        .setName('input')
        .setDescription('Ticker(s) and location (e.g., "COF,CAF Katoa reserve:1000")')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Override location')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addNumberOption(option =>
      option
        .setName('price')
        .setDescription('Override price (uses auto-pricing if not set)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('currency')
        .setDescription('Currency (default: your preferred currency)')
        .setRequired(false)
        .addChoices(
          { name: 'CIS', value: 'CIS' },
          { name: 'ICA', value: 'ICA' },
          { name: 'AIC', value: 'AIC' },
          { name: 'NCC', value: 'NCC' }
        )
    )
    .addStringOption(option =>
      option
        .setName('visibility')
        .setDescription('Order visibility (default: internal)')
        .setRequired(false)
        .addChoices(
          { name: 'Internal (members)', value: 'internal' },
          { name: 'Partner (trade partners)', value: 'partner' }
        )
    ) as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true)

    if (focusedOption.name === 'location') {
      const query = focusedOption.value
      const discordId = interaction.user.id
      const locations = await searchLocations(query, 25, discordId)
      const choices = locations.map(l => ({
        name: `${l.naturalId} - ${l.name}`,
        value: l.naturalId,
      }))
      await interaction.respond(choices)
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Get user settings for defaults
    const marketSettings = await getMarketSettings(userId)
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Get channel defaults (if configured)
    const channelId = interaction.channelId
    const channelSettings = await getChannelDefaults(channelId)

    // Get options
    const input = interaction.options.getString('input', true)
    const locationOverride = interaction.options.getString('location')
    const priceOverride = interaction.options.getNumber('price')
    const currencyOption = interaction.options.getString('currency') as ValidCurrency | null
    const visibilityOption = interaction.options.getString('visibility') as
      | 'internal'
      | 'partner'
      | null

    // Parse flexible input
    const parsed = await parseOrderInput(input, { forSell: true })

    // Validate we have at least one ticker
    if (parsed.tickers.length === 0) {
      const errorMsg =
        parsed.unresolvedTokens.length > 0
          ? `Could not find commodities: ${parsed.unresolvedTokens.map(t => `"${t}"`).join(', ')}`
          : 'Please specify at least one commodity ticker.'

      await interaction.reply({
        content: `❌ ${errorMsg}\n\nExample: \`/sell COF,CAF Katoa reserve:1000\``,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Determine location (override takes precedence)
    let locationId = locationOverride || parsed.location

    // If location override provided, validate it
    if (locationOverride) {
      const resolved = await resolveLocation(locationOverride)
      if (!resolved) {
        await interaction.reply({
          content: `❌ Location "${locationOverride}" not found.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
      locationId = resolved.naturalId
    }

    if (!locationId) {
      await interaction.reply({
        content:
          '❌ Please specify a location.\n\n' +
          'Example: `/sell COF Katoa` or use the `location` option.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Determine currency using channel defaults resolution
    const currency: ValidCurrency = resolveEffectiveValue(
      currencyOption,
      channelSettings?.currency,
      channelSettings?.currencyEnforced ?? false,
      marketSettings.preferredCurrency as ValidCurrency,
      'CIS' as ValidCurrency
    )

    if (!isValidCurrency(currency)) {
      await interaction.reply({
        content: `❌ Invalid currency. Valid options: ${VALID_CURRENCIES.join(', ')}`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Track if currency was overridden by channel
    const currencyOverridden = wasOverriddenByChannel(
      currencyOption,
      channelSettings?.currency,
      channelSettings?.currencyEnforced ?? false
    )

    // Determine visibility using channel defaults resolution
    const orderType: 'internal' | 'partner' = resolveEffectiveValue(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false,
      'internal' as const,
      'internal' as const
    )

    // Track if visibility was overridden by channel
    const visibilityOverridden = wasOverriddenByChannel(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false
    )

    // Determine limit mode
    const limitMode: LimitMode = parsed.limitMode
    const limitQuantity = parsed.limitQuantity

    // Determine price list using channel defaults resolution
    const effectivePriceList: string | null = resolveEffectiveValue(
      null, // No command-level price list option yet
      channelSettings?.priceList,
      channelSettings?.priceListEnforced ?? false,
      marketSettings.defaultPriceList,
      null
    )

    // Determine pricing approach
    let useAutoPricing = false
    let priceListCode: string | null = null

    if (priceOverride !== null && priceOverride !== undefined) {
      // User explicitly provided a price - use fixed pricing
      useAutoPricing = false
    } else if (effectivePriceList) {
      // Have a price list (from channel or user settings)
      useAutoPricing = true
      priceListCode = effectivePriceList

      // Verify the price list exists
      const priceList = await db.query.priceLists.findFirst({
        where: eq(priceLists.code, priceListCode),
      })

      if (!priceList) {
        const source = channelSettings?.priceListEnforced
          ? 'Channel default'
          : channelSettings?.priceList === priceListCode
            ? 'Channel default'
            : 'Your default'
        await interaction.reply({
          content:
            `❌ ${source} price list "${priceListCode}" was not found.\n\n` +
            'Please contact an admin or provide a price explicitly.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    } else {
      // No price provided and no price list configured
      await interaction.reply({
        content:
          '❌ Please provide a price or configure auto-pricing.\n\n' +
          'You can:\n' +
          '1. Add `price:` option to this command\n' +
          '2. Configure a default price list in `/settings market`\n' +
          '3. Enable automatic pricing in your settings',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Create orders for each ticker
    const createdOrders: Array<{
      ticker: string
      price: number | null
      currency: string
      priceSource: 'fixed' | 'auto' | 'pending'
    }> = []
    const errors: string[] = []

    for (const ticker of parsed.tickers) {
      try {
        let price: number
        let orderPriceListCode: string | null = null

        if (priceOverride !== null && priceOverride !== undefined) {
          // Fixed price from option
          price = priceOverride
        } else if (useAutoPricing && priceListCode) {
          // Try to get price from price list
          const effectivePrice = await calculateEffectivePriceWithFallback(
            priceListCode,
            ticker,
            locationId,
            currency
          )

          if (effectivePrice) {
            // Found price in list
            price = effectivePrice.finalPrice
            orderPriceListCode = priceListCode
          } else {
            // No price in list - set price=0 and mark as dynamic (will show --)
            price = 0
            orderPriceListCode = priceListCode
          }
        } else {
          // This shouldn't happen, but fallback to 0
          price = 0
        }

        // Upsert the sell order
        await db
          .insert(sellOrders)
          .values({
            userId,
            commodityTicker: ticker,
            locationId,
            price: price.toFixed(2),
            currency,
            priceListCode: orderPriceListCode,
            orderType,
            limitMode,
            limitQuantity,
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
              priceListCode: orderPriceListCode,
              limitMode,
              limitQuantity,
              updatedAt: new Date(),
            },
          })

        createdOrders.push({
          ticker,
          price: price > 0 ? price : null,
          currency,
          priceSource:
            priceOverride !== null && priceOverride !== undefined
              ? 'fixed'
              : price > 0
                ? 'auto'
                : 'pending',
        })

        logger.info(
          {
            userId,
            commodityTicker: ticker,
            locationId,
            price,
            currency,
            orderType,
            limitMode,
            limitQuantity,
            priceListCode: orderPriceListCode,
          },
          'Sell order created/updated'
        )
      } catch (error) {
        logger.error({ error, userId, ticker, locationId }, 'Failed to create sell order')
        errors.push(`${ticker}: failed to create`)
      }
    }

    // Build response
    const locationDisplay = await formatLocation(locationId, displaySettings.locationDisplayMode)
    const limitDisplay = formatLimitMode(limitMode, limitQuantity)

    let response = ''

    if (createdOrders.length === 1) {
      // Single order response
      const order = createdOrders[0]
      const commodityDisplay = formatCommodity(order.ticker)
      const priceDisplay =
        order.price !== null
          ? `${order.price.toFixed(2)} ${order.currency}`
          : `-- ${order.currency}`

      response = `✅ Sell order created/updated!\n\n`
      response += `**${commodityDisplay}** @ **${locationDisplay}**\n`
      response += `Price: **${priceDisplay}**`

      if (order.priceSource === 'pending') {
        response += ` ⚠️ *no price in list*`
      }

      response += '\n'

      if (limitDisplay) {
        response += `Limit: **${limitDisplay}**\n`
      }

      response += `Visibility: **${orderType}**`
    } else {
      // Multiple orders response
      response = `✅ Created ${createdOrders.length} sell order(s) at **${locationDisplay}**:\n\n`

      for (const order of createdOrders) {
        const commodityDisplay = formatCommodity(order.ticker)
        const priceDisplay =
          order.price !== null
            ? `${order.price.toFixed(2)} ${order.currency}`
            : `-- ${order.currency}`

        response += `• ${commodityDisplay} - ${priceDisplay}`

        if (limitDisplay) {
          response += ` (${limitDisplay})`
        }

        if (order.priceSource === 'pending') {
          response += ` ⚠️ *no price*`
        }

        response += '\n'
      }

      response += `\nVisibility: **${orderType}**`
    }

    // Add errors if any
    if (errors.length > 0) {
      response += `\n\n⚠️ Some orders failed:\n${errors.map(e => `• ${e}`).join('\n')}`
    }

    // Add warnings about unresolved tokens
    if (parsed.unresolvedTokens.length > 0) {
      response += `\n\n⚠️ Could not resolve: ${parsed.unresolvedTokens.map(t => `"${t}"`).join(', ')}`
    }

    // Add warnings about channel-enforced overrides
    const overrideWarnings: string[] = []
    if (currencyOverridden) {
      overrideWarnings.push(`currency → ${currency}`)
    }
    if (visibilityOverridden) {
      overrideWarnings.push(`visibility → ${orderType}`)
    }
    if (overrideWarnings.length > 0) {
      response += `\n\n🔒 Channel enforced: ${overrideWarnings.join(', ')}`
    }

    await interaction.reply({
      content: response,
      flags: MessageFlags.Ephemeral,
    })
  },
}
