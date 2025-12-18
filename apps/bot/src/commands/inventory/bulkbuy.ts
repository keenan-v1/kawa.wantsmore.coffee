import {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import type { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, buyOrders } from '@kawakawa/db'
import { resolveCommodity, resolveLocation, formatCommodity } from '../../services/display.js'
import { getMarketSettings } from '../../services/userSettings.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { awaitModal } from '../../utils/interactions.js'
import { isValidCurrency, type ValidCurrency } from '../../utils/validation.js'

type Currency = ValidCurrency
type Visibility = 'internal' | 'partner'

interface ParsedBuyOrder {
  ticker: string
  location: string
  quantity: number
  price: number | null // null = auto-pricing
  currency: Currency | null // null = use default
  lineNumber: number
}

interface ParseError {
  lineNumber: number
  line: string
  error: string
}

export const bulkbuy: Command = {
  data: new SlashCommandBuilder()
    .setName('bulkbuy')
    .setDescription('Create multiple buy orders from multi-line input')
    .addStringOption(option =>
      option
        .setName('visibility')
        .setDescription('Order visibility (default: internal)')
        .setRequired(false)
        .addChoices(
          { name: 'Internal (KAWA members only)', value: 'internal' },
          { name: 'Partner (visible to partners)', value: 'partner' }
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const visibilityOption = interaction.options.getString('visibility') as Visibility | null

    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Get user's market settings for defaults
    const marketSettings = await getMarketSettings(userId)
    const defaultCurrency = marketSettings.preferredCurrency as Currency
    const defaultPriceList = marketSettings.defaultPriceList
    const visibility = visibilityOption ?? 'internal'

    // Show modal for bulk input (orders only - everything else parsed from input or defaults)
    const modalId = `bulkbuy-modal:${Date.now()}`
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Bulk Buy Orders (${visibility})`)

    const ordersInput = new TextInputBuilder()
      .setCustomId('orders')
      .setLabel('TICKER LOCATION QTY [PRICE] [CURRENCY]')
      .setPlaceholder('COF BEN 100\nRAT BEN 50 150.50\nDW MOR 200 75 ICA')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000)

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(ordersInput))

    await interaction.showModal(modal)

    const modalSubmit = await awaitModal(interaction, modalId)
    if (!modalSubmit) return

    await handleBulkBuySubmit(modalSubmit, userId, visibility, defaultCurrency, defaultPriceList)
  },
}

/**
 * Parse bulk buy order input
 * Format: TICKER LOCATION QUANTITY [PRICE] [CURRENCY]
 */
function parseBulkBuyOrders(
  input: string,
  defaultCurrency: Currency
): { orders: ParsedBuyOrder[]; errors: ParseError[] } {
  const orders: ParsedBuyOrder[] = []
  const errors: ParseError[] = []

  const lines = input.split('\n').filter(line => line.trim())

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNumber = i + 1

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue

    const parts = line.split(/\s+/)
    if (parts.length < 3) {
      errors.push({ lineNumber, line, error: 'Expected at least: TICKER LOCATION QUANTITY' })
      continue
    }

    const [ticker, location, quantityStr, ...rest] = parts

    // Parse quantity (required)
    const quantity = parseInt(quantityStr, 10)
    if (isNaN(quantity) || quantity <= 0) {
      errors.push({
        lineNumber,
        line,
        error: `Invalid quantity "${quantityStr}". Must be a positive number.`,
      })
      continue
    }

    // Parse optional fields: [PRICE] [CURRENCY]
    let price: number | null = null
    let currency: Currency | null = null

    for (let idx = 0; idx < rest.length; idx++) {
      const token = rest[idx]

      // Check for price (number) - 0 means auto-pricing
      if (!isNaN(parseFloat(token))) {
        const priceVal = parseFloat(token)
        if (priceVal < 0) {
          errors.push({ lineNumber, line, error: `Invalid price "${token}"` })
          break
        }
        // 0 = auto-pricing (null), >0 = fixed price
        price = priceVal > 0 ? priceVal : null
      }
      // Check for currency
      else if (isValidCurrency(token.toUpperCase())) {
        currency = token.toUpperCase() as Currency
      } else {
        errors.push({ lineNumber, line, error: `Unknown token "${token}"` })
        break
      }
    }

    // If we hit an error parsing, skip this order
    if (errors.length > 0 && errors[errors.length - 1].lineNumber === lineNumber) {
      continue
    }

    orders.push({
      ticker: ticker.toUpperCase(),
      location, // Keep location case-sensitive
      quantity,
      price,
      currency: currency ?? defaultCurrency,
      lineNumber,
    })
  }

  return { orders, errors }
}

/**
 * Handle bulk buy order modal submission
 */
async function handleBulkBuySubmit(
  interaction: ModalSubmitInteraction,
  userId: number,
  visibility: Visibility,
  defaultCurrency: Currency,
  defaultPriceList: string | null
): Promise<void> {
  const ordersInput = interaction.fields.getTextInputValue('orders').trim()

  // Parse orders
  const { orders, errors } = parseBulkBuyOrders(ordersInput, defaultCurrency)

  if (orders.length === 0 && errors.length === 0) {
    await interaction.reply({
      content:
        '❌ No orders found. Please enter orders in the format:\n' +
        '`TICKER LOCATION QUANTITY [PRICE] [CURRENCY]`',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Validate and create orders
  const created: string[] = []
  const validationErrors: string[] = []

  for (const order of orders) {
    // Check if auto-pricing is available when needed
    if (order.price === null && !defaultPriceList) {
      validationErrors.push(
        `Line ${order.lineNumber}: Auto-pricing requires a default price list. ` +
          'Either specify a price or configure your default price list in Settings.'
      )
      continue
    }

    // Validate commodity
    const resolvedCommodity = await resolveCommodity(order.ticker)
    if (!resolvedCommodity) {
      validationErrors.push(`Line ${order.lineNumber}: Unknown commodity "${order.ticker}"`)
      continue
    }

    // Validate location
    const resolvedLocation = await resolveLocation(order.location)
    if (!resolvedLocation) {
      validationErrors.push(`Line ${order.lineNumber}: Unknown location "${order.location}"`)
      continue
    }

    try {
      const priceValue = order.price !== null ? order.price.toFixed(2) : '0.00'
      const priceListCode = order.price === null ? defaultPriceList : null

      await db
        .insert(buyOrders)
        .values({
          userId,
          commodityTicker: resolvedCommodity.ticker,
          locationId: resolvedLocation.naturalId,
          quantity: order.quantity,
          price: priceValue,
          priceListCode,
          currency: order.currency!,
          orderType: visibility,
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
            quantity: order.quantity,
            price: priceValue,
            priceListCode,
            updatedAt: new Date(),
          },
        })

      const commodityDisplay = formatCommodity(resolvedCommodity.ticker)
      let orderDesc = `✅ ${order.quantity.toLocaleString()} ${commodityDisplay} @ ${resolvedLocation.naturalId}`

      // Add price info
      if (order.price !== null) {
        orderDesc += ` - ${order.price.toFixed(2)} ${order.currency}`
      } else {
        orderDesc += ' - auto'
      }

      created.push(orderDesc)
    } catch (_err) {
      validationErrors.push(`Line ${order.lineNumber}: Database error creating order`)
    }
  }

  // Add parse errors to validation errors
  for (const err of errors) {
    validationErrors.push(`Line ${err.lineNumber}: ${err.error}`)
  }

  // Build response
  let response = ''

  if (created.length > 0) {
    response += `**Created ${created.length} buy order(s):**\n${created.join('\n')}\n\n`
    response += `Visibility: **${visibility}**\n`
  }

  if (validationErrors.length > 0) {
    response += `\n**Errors (${validationErrors.length}):**\n${validationErrors.join('\n')}`
  }

  if (!response) {
    response = '❌ No orders were created.'
  }

  await interaction.reply({
    content: response,
    flags: MessageFlags.Ephemeral,
  })
}
