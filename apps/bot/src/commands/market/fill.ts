/**
 * /fill command - Offer to fill someone's buy order
 * User selects a buy order and specifies quantity they can provide
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ModalSubmitInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { searchCommodities, searchLocations } from '../../autocomplete/index.js'
import { resolveCommodity, resolveLocation, formatCommodity } from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import {
  getAvailableBuyOrders,
  formatOrderForSelect,
  createReservation,
} from '../../services/reservationService.js'
import { getOrderDisplayPrice } from '@kawakawa/services/market'
import type { Currency } from '@kawakawa/types'

const COMPONENT_TIMEOUT = 60000 // 1 minute
const MODAL_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export const fill: Command = {
  data: new SlashCommandBuilder()
    .setName('fill')
    .setDescription('Offer to fill a buy order')
    .addStringOption(option =>
      option
        .setName('commodity')
        .setDescription('Commodity ticker to fill')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Filter by location (optional)')
        .setRequired(false)
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

    // Get user's display settings
    const displaySettings = await getDisplaySettings(discordId)

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

    // Validate location if provided
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

    // Get available buy orders (excluding user's own)
    const availableOrders = await getAvailableBuyOrders(
      resolvedCommodity.ticker,
      resolvedLocation?.naturalId ?? null,
      userId
    )

    if (availableOrders.length === 0) {
      let msg = `📭 No buy orders found for **${formatCommodity(resolvedCommodity.ticker)}**`
      if (resolvedLocation) {
        msg += ` at **${resolvedLocation.naturalId}**`
      }
      msg += '.\n\nTry a different commodity or location.'
      await interaction.reply({
        content: msg,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Build select menu options (max 25)
    const options: { label: string; value: string; description: string }[] = []
    for (const order of availableOrders.slice(0, 25)) {
      const formatted = await formatOrderForSelect(order, displaySettings.locationDisplayMode)
      options.push(formatted)
    }

    const selectMenuId = `fill-select:${Date.now()}`
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(selectMenuId)
      .setPlaceholder('Select an order to fill')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

    const selectReply = await interaction.reply({
      content: `**Select a buy order for ${formatCommodity(resolvedCommodity.ticker)}:**`,
      components: [selectRow],
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    })

    // Wait for selection
    try {
      const selectInteraction = await selectReply.resource?.message?.awaitMessageComponent({
        filter: i => i.customId === selectMenuId && i.user.id === interaction.user.id,
        time: COMPONENT_TIMEOUT,
      })

      if (!selectInteraction?.isStringSelectMenu()) return

      const selectedValue = selectInteraction.values[0]
      const [, orderIdStr] = selectedValue.split(':')
      const orderId = parseInt(orderIdStr, 10)

      // Find the selected order
      const selectedOrder = availableOrders.find(o => o.id === orderId)
      if (!selectedOrder) {
        await selectInteraction.update({
          content: '❌ Order not found. Please try again.',
          components: [],
        })
        return
      }

      // Show modal for quantity and notes
      const modalId = `fill-modal:${Date.now()}`
      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle(`Fill ${selectedOrder.commodityTicker}`)

      const quantityInput = new TextInputBuilder()
        .setCustomId('quantity')
        .setLabel(`Quantity (max ${selectedOrder.quantity} wanted)`)
        .setPlaceholder(selectedOrder.quantity.toString())
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)

      const notesInput = new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notes (optional)')
        .setPlaceholder('Any message for the buyer')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput)
      )

      await selectInteraction.showModal(modal)

      // Wait for modal submit
      const modalSubmit = await selectInteraction
        .awaitModalSubmit({
          time: MODAL_TIMEOUT,
          filter: (i: ModalSubmitInteraction) =>
            i.customId === modalId && i.user.id === interaction.user.id,
        })
        .catch(() => null)

      if (!modalSubmit) {
        return // Modal cancelled or timed out
      }

      await handleFillModalSubmit(modalSubmit, userId, selectedOrder)
    } catch {
      // Selection timed out
      try {
        await interaction.editReply({
          content: '⏰ Selection timed out. Please run `/fill` again.',
          components: [],
        })
      } catch {
        // Ignore if we can't edit
      }
    }
  },
}

/**
 * Handle fill modal submission
 */
async function handleFillModalSubmit(
  interaction: ModalSubmitInteraction,
  userId: number,
  order: {
    id: number
    commodityTicker: string
    locationId: string
    price: string
    currency: string
    priceListCode: string | null
    quantity: number
    ownerUsername: string
    ownerDisplayName: string | null
    ownerFioUsername: string | null
  }
): Promise<void> {
  const quantityStr = interaction.fields.getTextInputValue('quantity').trim()
  const notes = interaction.fields.getTextInputValue('notes').trim()

  // Validate quantity
  const quantity = parseInt(quantityStr, 10)
  if (isNaN(quantity) || quantity <= 0) {
    await interaction.reply({
      content: '❌ Invalid quantity. Please enter a positive number.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (quantity > order.quantity) {
    await interaction.reply({
      content: `❌ Quantity exceeds requested amount. Maximum: ${order.quantity}`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    // Create the reservation
    const reservation = await createReservation('buy', order.id, userId, quantity, notes || undefined)

    const ownerName = order.ownerFioUsername ?? order.ownerDisplayName ?? order.ownerUsername

    // Resolve price from price list if needed
    const priceInfo = await getOrderDisplayPrice({
      price: order.price,
      currency: order.currency as Currency,
      priceListCode: order.priceListCode,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
    })

    const displayPrice = priceInfo ? priceInfo.price.toFixed(2) : order.price
    const displayCurrency = priceInfo ? priceInfo.currency : order.currency
    const totalValue = priceInfo
      ? (priceInfo.price * quantity).toFixed(2)
      : (parseFloat(order.price) * quantity).toFixed(2)

    const embed = new EmbedBuilder()
      .setTitle('📝 Fill Offer Created')
      .setColor(0x57f287)
      .setDescription(
        `You have offered to fill **${quantity}x ${formatCommodity(order.commodityTicker)}** ` +
          `for **${ownerName}** at **${order.locationId}**.\n\n` +
          `**Price:** ${displayPrice} ${displayCurrency}/unit\n` +
          `**Total:** ${totalValue} ${displayCurrency}\n\n` +
          `The buyer will be notified and can confirm or reject your offer.\n` +
          `Use \`/reservations\` to track your reservations.`
      )
      .setFooter({ text: `Reservation #${reservation.id}` })
      .setTimestamp()

    if (notes) {
      embed.addFields({ name: 'Your Notes', value: notes, inline: false })
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Failed to create reservation:', error)
    await interaction.reply({
      content: '❌ Failed to create reservation. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
