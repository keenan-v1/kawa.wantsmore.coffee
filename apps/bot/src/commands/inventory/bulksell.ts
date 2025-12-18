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
import { db, sellOrders } from '@kawakawa/db'
import { resolveCommodity, resolveLocation, formatCommodity } from '../../services/display.js'
import { getMarketSettings } from '../../services/userSettings.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { awaitModal } from '../../utils/interactions.js'
import { isValidCurrency, type ValidCurrency } from '../../utils/validation.js'

type Currency = ValidCurrency
type Visibility = 'internal' | 'partner'
type LimitMode = 'none' | 'max_sell' | 'reserve'

interface ParsedSellOrder {
  ticker: string
  location: string
  limitMode: LimitMode
  limitQuantity: number | null
  price: number | null // null = auto-pricing
  currency: Currency | null // null = use default
  lineNumber: number
}

interface ParseError {
  lineNumber: number
  line: string
  error: string
}

export const bulksell: Command = {
  data: new SlashCommandBuilder()
    .setName('bulksell')
    .setDescription('Create multiple sell orders from multi-line input')
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
    const modalId = `bulksell-modal:${Date.now()}`
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Bulk Sell Orders (${visibility})`)

    const ordersInput = new TextInputBuilder()
      .setCustomId('orders')
      .setLabel('TICKER LOCATION [max|r QTY] [PRICE] [CUR]')
      .setPlaceholder('COF BEN\nRAT BEN max 100\nDW MOR 150 ICA')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000)

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(ordersInput))

    await interaction.showModal(modal)

    const modalSubmit = await awaitModal(interaction, modalId)
    if (!modalSubmit) return

    await handleBulkSellSubmit(modalSubmit, userId, visibility, defaultCurrency, defaultPriceList)
  },
}

/**
 * Parse bulk sell order input
 * Format: TICKER LOCATION [max|reserve QUANTITY] [PRICE] [CURRENCY]
 */
function parseBulkSellOrders(
  input: string,
  defaultCurrency: Currency
): { orders: ParsedSellOrder[]; errors: ParseError[] } {
  const orders: ParsedSellOrder[] = []
  const errors: ParseError[] = []

  const lines = input.split('\n').filter(line => line.trim())

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNumber = i + 1

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue

    const parts = line.split(/\s+/)
    if (parts.length < 2) {
      errors.push({ lineNumber, line, error: 'Expected at least: TICKER LOCATION' })
      continue
    }

    const [ticker, location, ...rest] = parts

    // Parse optional fields: [max|reserve QUANTITY] [PRICE] [CURRENCY]
    let limitMode: LimitMode = 'none'
    let limitQuantity: number | null = null
    let price: number | null = null
    let currency: Currency | null = null

    let idx = 0
    while (idx < rest.length) {
      const token = rest[idx].toLowerCase()

      // Check for limit mode
      if (token === 'max' || token === 'm') {
        limitMode = 'max_sell'
        idx++
        if (idx < rest.length) {
          const qty = parseInt(rest[idx], 10)
          if (!isNaN(qty) && qty >= 0) {
            // qty=0 means no limit (sell all)
            limitQuantity = qty > 0 ? qty : null
            if (qty === 0) limitMode = 'none' // 0 = no limit
            idx++
          } else {
            errors.push({ lineNumber, line, error: `Invalid max quantity "${rest[idx]}"` })
            break
          }
        } else {
          errors.push({ lineNumber, line, error: 'Expected quantity after "max"' })
          break
        }
      } else if (token === 'reserve' || token === 'r') {
        limitMode = 'reserve'
        idx++
        if (idx < rest.length) {
          const qty = parseInt(rest[idx], 10)
          if (!isNaN(qty) && qty >= 0) {
            // qty=0 means no reserve (sell all)
            limitQuantity = qty > 0 ? qty : null
            if (qty === 0) limitMode = 'none' // 0 = no limit
            idx++
          } else {
            errors.push({ lineNumber, line, error: `Invalid reserve quantity "${rest[idx]}"` })
            break
          }
        } else {
          errors.push({ lineNumber, line, error: 'Expected quantity after "reserve"' })
          break
        }
      }
      // Check for price (number) - 0 means auto-pricing
      else if (!isNaN(parseFloat(rest[idx]))) {
        const priceVal = parseFloat(rest[idx])
        if (priceVal < 0) {
          errors.push({ lineNumber, line, error: `Invalid price "${rest[idx]}"` })
          break
        }
        // 0 = auto-pricing (null), >0 = fixed price
        price = priceVal > 0 ? priceVal : null
        idx++
      }
      // Check for currency
      else if (isValidCurrency(rest[idx].toUpperCase())) {
        currency = rest[idx].toUpperCase() as Currency
        idx++
      } else {
        errors.push({ lineNumber, line, error: `Unknown token "${rest[idx]}"` })
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
      limitMode,
      limitQuantity,
      price,
      currency: currency ?? defaultCurrency,
      lineNumber,
    })
  }

  return { orders, errors }
}

/**
 * Handle bulk sell order modal submission
 */
async function handleBulkSellSubmit(
  interaction: ModalSubmitInteraction,
  userId: number,
  visibility: Visibility,
  defaultCurrency: Currency,
  defaultPriceList: string | null
): Promise<void> {
  const ordersInput = interaction.fields.getTextInputValue('orders').trim()

  // Parse orders
  const { orders, errors } = parseBulkSellOrders(ordersInput, defaultCurrency)

  if (orders.length === 0 && errors.length === 0) {
    await interaction.reply({
      content:
        '❌ No orders found. Please enter orders in the format:\n' +
        '`TICKER LOCATION [max|reserve QTY] [PRICE] [CURRENCY]`',
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
        .insert(sellOrders)
        .values({
          userId,
          commodityTicker: resolvedCommodity.ticker,
          locationId: resolvedLocation.naturalId,
          price: priceValue,
          priceListCode,
          currency: order.currency!,
          orderType: visibility,
          limitMode: order.limitMode,
          limitQuantity: order.limitQuantity,
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
            price: priceValue,
            priceListCode,
            limitMode: order.limitMode,
            limitQuantity: order.limitQuantity,
            updatedAt: new Date(),
          },
        })

      const commodityDisplay = formatCommodity(resolvedCommodity.ticker)
      let orderDesc = `✅ ${commodityDisplay} @ ${resolvedLocation.naturalId}`

      // Add limit info
      if (order.limitMode !== 'none' && order.limitQuantity) {
        orderDesc += ` (${order.limitMode === 'max_sell' ? 'max' : 'reserve'} ${order.limitQuantity})`
      }

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
    response += `**Created ${created.length} sell order(s):**\n${created.join('\n')}\n\n`
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
