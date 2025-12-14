import {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ModalSubmitInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import { db, sellOrders } from '@kawakawa/db'
import { searchCommodities, searchLocations } from '../../autocomplete/index.js'
import { requireCommodity, requireLocation, formatCommodity } from '../../services/display.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { awaitModal } from '../../utils/interactions.js'
import { isValidCurrency, type ValidCurrency } from '../../utils/validation.js'

export const sell: Command = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Create a sell order')
    .addStringOption(option =>
      option
        .setName('commodity')
        .setDescription('Commodity ticker to sell')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Location for the sell order')
        .setRequired(true)
        .setAutocomplete(true)
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
    const commodityInput = interaction.options.getString('commodity', true)
    const locationInput = interaction.options.getString('location', true)

    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Validate commodity
    const resolvedCommodity = await requireCommodity(interaction, commodityInput)
    if (!resolvedCommodity) return

    // Validate location
    const resolvedLocation = await requireLocation(interaction, locationInput)
    if (!resolvedLocation) return

    // Show modal for price input
    const modalId = `sell-modal:${Date.now()}`
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Sell ${resolvedCommodity.ticker} @ ${resolvedLocation.naturalId}`)

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

    await interaction.showModal(modal)

    const modalSubmit = await awaitModal(interaction, modalId)
    if (!modalSubmit) return

    await handleSellModalSubmit(
      modalSubmit,
      userId,
      resolvedCommodity.ticker,
      resolvedLocation.naturalId
    )
  },
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
  if (!isValidCurrency(currency)) {
    await interaction.reply({
      content: '❌ Invalid currency. Valid options: CIS, ICA, AIC, NCC',
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
        currency: currency as ValidCurrency,
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
