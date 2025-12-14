/**
 * /reserve command - Reserve items from someone's sell order
 * User selects a sell order and specifies quantity to reserve
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ModalSubmitInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import { searchCommodities, searchLocations } from '../../autocomplete/index.js'
import { resolveCommodity, resolveLocation, formatCommodity } from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import {
  getAvailableSellOrders,
  formatOrderForSelect,
  createReservation,
} from '../../services/reservationService.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { awaitModal, COMPONENT_TIMEOUT } from '../../utils/interactions.js'
import { createSelectMenu } from '../../utils/components.js'
import { createQuantityNotesModal } from '../../utils/modals.js'
import { createSuccessEmbed } from '../../utils/embeds.js'
import { replyError } from '../../utils/replies.js'
import { formatOrderPrice, calculateTotal } from '../../utils/priceFormatter.js'
import { getDisplayName } from '../../utils/userDisplay.js'

export const reserve: Command = {
  data: new SlashCommandBuilder()
    .setName('reserve')
    .setDescription('Reserve items from a sell order')
    .addStringOption(option =>
      option
        .setName('commodity')
        .setDescription('Commodity ticker to reserve')
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
    const commodityInput = interaction.options.getString('commodity', true)
    const locationInput = interaction.options.getString('location')

    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Get user's display settings
    const displaySettings = await getDisplaySettings(interaction.user.id)

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

    // Get available sell orders (excluding user's own)
    const availableOrders = await getAvailableSellOrders(
      resolvedCommodity.ticker,
      resolvedLocation?.naturalId ?? null,
      userId
    )

    if (availableOrders.length === 0) {
      let msg = `📭 No sell orders found for **${formatCommodity(resolvedCommodity.ticker)}**`
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

    const selectMenuId = `reserve-select:${Date.now()}`
    const selectRow = createSelectMenu({
      customId: selectMenuId,
      placeholder: 'Select an order to reserve from',
      options,
    })

    const selectReply = await interaction.reply({
      content: `**Select a sell order for ${formatCommodity(resolvedCommodity.ticker)}:**`,
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
      const modalId = `reserve-modal:${Date.now()}`
      const modal = createQuantityNotesModal({
        modalId,
        title: `Reserve ${selectedOrder.commodityTicker}`,
        maxQuantity: selectedOrder.quantity,
        quantityLabel: `Quantity (max ${selectedOrder.quantity} available)`,
        notesPlaceholder: 'Any message for the seller',
      })

      await selectInteraction.showModal(modal)

      // Wait for modal submit
      const modalSubmit = await awaitModal(selectInteraction, modalId)
      if (!modalSubmit) return

      await handleReserveModalSubmit(modalSubmit, userId, selectedOrder)
    } catch {
      // Selection timed out
      try {
        await interaction.editReply({
          content: '⏰ Selection timed out. Please run `/reserve` again.',
          components: [],
        })
      } catch {
        // Ignore if we can't edit
      }
    }
  },
}

/**
 * Handle reserve modal submission
 */
async function handleReserveModalSubmit(
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
    await replyError(interaction, 'Invalid quantity. Please enter a positive number.')
    return
  }

  if (quantity > order.quantity) {
    await replyError(interaction, `Quantity exceeds available amount. Maximum: ${order.quantity}`)
    return
  }

  try {
    // Create the reservation
    const reservation = await createReservation('sell', order.id, userId, quantity, notes || undefined)

    const ownerName = getDisplayName({
      username: order.ownerUsername,
      displayName: order.ownerDisplayName,
      fioUsername: order.ownerFioUsername,
    })

    // Resolve price from price list if needed
    const price = await formatOrderPrice(order)
    const totalCost = calculateTotal(price, quantity)

    const embed = createSuccessEmbed({
      title: '📝 Reservation Created',
      description:
        `You have reserved **${quantity}x ${formatCommodity(order.commodityTicker)}** ` +
        `from **${ownerName}** at **${order.locationId}**.\n\n` +
        `**Price:** ${price.displayPrice} ${price.displayCurrency}/unit\n` +
        `**Total:** ${totalCost} ${price.displayCurrency}\n\n` +
        `The seller will be notified and can confirm or reject your reservation.\n` +
        `Use \`/reservations\` to track your reservations.`,
      footer: `Reservation #${reservation.id}`,
      notes: notes || undefined,
    })

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Failed to create reservation:', error)
    await replyError(interaction, 'Failed to create reservation. Please try again.')
  }
}
