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
import { db, userDiscordProfiles, buyOrders } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { searchCommodities, searchLocations } from '../../autocomplete/index.js'
import { resolveCommodity, resolveLocation, formatCommodity } from '../../services/display.js'

const MODAL_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export const buy: Command = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Create a buy order')
    .addStringOption(option =>
      option
        .setName('commodity')
        .setDescription('Commodity ticker to buy')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Location for the buy order')
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
    const discordId = interaction.user.id
    const commodityInput = interaction.options.getString('commodity', true)
    const locationInput = interaction.options.getString('location', true)

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

    // Validate commodity
    const resolvedCommodity = await resolveCommodity(commodityInput)
    if (!resolvedCommodity) {
      await interaction.reply({
        content:
          `❌ Commodity ticker "${commodityInput.toUpperCase()}" not found.\n\n` +
          'Use the autocomplete suggestions to find valid tickers.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Validate location
    const resolvedLocation = await resolveLocation(locationInput)
    if (!resolvedLocation) {
      await interaction.reply({
        content:
          `❌ Location "${locationInput}" not found.\n\n` +
          'Use the autocomplete suggestions to find valid locations.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Show modal for price and quantity input
    const modalId = `buy-modal:${Date.now()}`
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Buy ${resolvedCommodity.ticker} @ ${resolvedLocation.naturalId}`)

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

    await interaction.showModal(modal)

    try {
      const modalSubmit = await interaction
        .awaitModalSubmit({
          time: MODAL_TIMEOUT,
          filter: (i: ModalSubmitInteraction) =>
            i.customId === modalId && i.user.id === interaction.user.id,
        })
        .catch(() => null)

      if (!modalSubmit) {
        return // Modal cancelled or timed out
      }

      await handleBuyModalSubmit(
        modalSubmit,
        userId,
        resolvedCommodity.ticker,
        resolvedLocation.naturalId
      )
    } catch (error) {
      console.error('Buy modal error:', error)
    }
  },
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
        `✅ Buy order created/updated!\n\n` +
        `**${commodityDisplay}** @ **${locationId}**\n` +
        `Quantity: **${quantity.toLocaleString()}**\n` +
        `Price: **${price.toFixed(2)} ${currency}**\n` +
        `Visibility: **${orderType}**`,
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Failed to create buy order:', error)
    await interaction.reply({
      content: '❌ Failed to create buy order. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
