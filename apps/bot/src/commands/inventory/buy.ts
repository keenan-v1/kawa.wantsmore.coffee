/**
 * /buy command - Create buy orders with flexible input
 *
 * Supports:
 * - Comma-separated tickers: /buy COF,CAF,H2O Katoa 500
 * - Space-separated input: /buy H Stella 1500
 * - Auto-pricing from user's default price list
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, buyOrders, priceLists } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { searchLocations } from '../../autocomplete/index.js'
import { formatCommodity, formatLocation, resolveLocation } from '../../services/display.js'
import { getMarketSettings, getDisplaySettings } from '../../services/userSettings.js'
import {
  getChannelConfig,
  resolveEffectiveValue,
  wasOverriddenByChannel,
} from '../../services/channelConfig.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { isValidCurrency, VALID_CURRENCIES, type ValidCurrency } from '../../utils/validation.js'
import { parseOrderInput } from '../../utils/orderInputParser.js'
import { calculateEffectivePriceWithFallback } from '@kawakawa/services/market'
import logger from '../../utils/logger.js'

export const buy: Command = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Create buy order(s)')
    .addStringOption(option =>
      option
        .setName('input')
        .setDescription('Ticker(s), location, and quantity (e.g., "COF,CAF Katoa 500")')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Override location')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('quantity')
        .setDescription('Override quantity')
        .setRequired(false)
        .setMinValue(1)
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
    const channelSettings = await getChannelConfig(channelId)

    // Get options
    const input = interaction.options.getString('input', true)
    const locationOverride = interaction.options.getString('location')
    const quantityOverride = interaction.options.getInteger('quantity')
    const priceOverride = interaction.options.getNumber('price')
    const currencyOption = interaction.options.getString('currency') as ValidCurrency | null
    const visibilityOption = interaction.options.getString('visibility') as
      | 'internal'
      | 'partner'
      | null

    // Parse flexible input
    const parsed = await parseOrderInput(input, { forBuy: true })

    // Validate we have at least one ticker
    if (parsed.tickers.length === 0) {
      const errorMsg =
        parsed.unresolvedTokens.length > 0
          ? `Could not find commodities: ${parsed.unresolvedTokens.map(t => `"${t}"`).join(', ')}`
          : 'Please specify at least one commodity ticker.'

      await interaction.reply({
        content: `❌ ${errorMsg}\n\nExample: \`/buy COF,CAF Katoa 500\``,
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
          'Example: `/buy COF Katoa 500` or use the `location` option.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Determine quantity (override takes precedence, required for buy orders)
    const quantity = quantityOverride || parsed.quantity

    if (!quantity || quantity <= 0) {
      await interaction.reply({
        content:
          '❌ Please specify a quantity.\n\n' +
          'Example: `/buy COF Katoa 500` or use the `quantity` option.',
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
      quantity: number
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

        // Upsert the buy order
        await db
          .insert(buyOrders)
          .values({
            userId,
            commodityTicker: ticker,
            locationId,
            quantity,
            price: price.toFixed(2),
            currency,
            priceListCode: orderPriceListCode,
            orderType,
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
              priceListCode: orderPriceListCode,
              updatedAt: new Date(),
            },
          })

        createdOrders.push({
          ticker,
          quantity,
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
            quantity,
            price,
            currency,
            orderType,
            priceListCode: orderPriceListCode,
          },
          'Buy order created/updated'
        )
      } catch (error) {
        logger.error({ error, userId, ticker, locationId }, 'Failed to create buy order')
        errors.push(`${ticker}: failed to create`)
      }
    }

    // Build response
    const locationDisplay = await formatLocation(locationId, displaySettings.locationDisplayMode)

    let response = ''

    if (createdOrders.length === 1) {
      // Single order response
      const order = createdOrders[0]
      const commodityDisplay = formatCommodity(order.ticker)
      const priceDisplay =
        order.price !== null
          ? `${order.price.toFixed(2)} ${order.currency}`
          : `-- ${order.currency}`

      response = `✅ Buy order created/updated!\n\n`
      response += `**${commodityDisplay}** @ **${locationDisplay}**\n`
      response += `Quantity: **${order.quantity.toLocaleString()}**\n`
      response += `Price: **${priceDisplay}**`

      if (order.priceSource === 'pending') {
        response += ` ⚠️ *no price in list*`
      }

      response += `\nVisibility: **${orderType}**`
    } else {
      // Multiple orders response
      response = `✅ Created ${createdOrders.length} buy order(s) at **${locationDisplay}**:\n\n`

      for (const order of createdOrders) {
        const commodityDisplay = formatCommodity(order.ticker)
        const priceDisplay =
          order.price !== null
            ? `${order.price.toFixed(2)} ${order.currency}`
            : `-- ${order.currency}`

        response += `• ${commodityDisplay} - ${order.quantity.toLocaleString()}x @ ${priceDisplay}`

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
