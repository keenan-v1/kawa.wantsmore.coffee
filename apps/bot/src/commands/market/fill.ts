/**
 * /fill command - Offer to fill someone's buy order
 * User selects a buy order and specifies quantity they can provide
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ModalSubmitInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import type { MessageVisibility } from '@kawakawa/types'
import { searchCommodities, searchLocations } from '../../autocomplete/index.js'
import { resolveCommodity, resolveLocation, formatCommodity } from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import {
  getChannelConfig,
  resolveEffectiveValue,
  resolveMessageVisibility,
} from '../../services/channelConfig.js'
import {
  getAvailableBuyOrders,
  formatOrderForSelect,
  createReservation,
  type PriceListFilter,
} from '../../services/reservationService.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { awaitModal, COMPONENT_TIMEOUT } from '../../utils/interactions.js'
import { createSelectMenu } from '../../utils/components.js'
import { createQuantityNotesModal } from '../../utils/modals.js'
import { createSuccessEmbed } from '../../utils/embeds.js'
import { formatOrderPrice, calculateTotal } from '../../utils/priceFormatter.js'
import { getDisplayName } from '../../utils/userDisplay.js'
import logger from '../../utils/logger.js'

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
    const replyOption = interaction.options.getString('reply') as MessageVisibility | null

    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Get user's display settings
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

    // Determine visibility filter using channel defaults
    const visibilityFilter: 'all' | 'internal' | 'partner' = resolveEffectiveValue(
      null, // No command-level visibility option for fill
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false,
      'all' as const,
      'all' as const
    )

    // Build price list filter
    const priceListFilter: PriceListFilter | null = channelSettings?.priceList
      ? {
          priceList: channelSettings.priceList,
          enforced: channelSettings.priceListEnforced ?? false,
        }
      : null

    // Validate commodity
    const resolvedCommodity = await resolveCommodity(commodityInput)
    if (!resolvedCommodity) {
      await interaction.reply({
        content:
          `❌ Commodity ticker "${commodityInput.toUpperCase()}" not found.\n\n` +
          'Use the autocomplete suggestions to find valid tickers.',
        flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
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
          flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
        })
        return
      }
    }

    // Get available buy orders (excluding user's own)
    const availableOrders = await getAvailableBuyOrders(
      resolvedCommodity.ticker,
      resolvedLocation?.naturalId ?? null,
      userId,
      visibilityFilter,
      priceListFilter
    )

    if (availableOrders.length === 0) {
      let msg = `📭 No buy orders found for **${formatCommodity(resolvedCommodity.ticker)}**`
      if (resolvedLocation) {
        msg += ` at **${resolvedLocation.naturalId}**`
      }
      msg += '.\n\nTry a different commodity or location.'
      await interaction.reply({
        content: msg,
        flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
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
    const selectRow = createSelectMenu({
      customId: selectMenuId,
      placeholder: 'Select an order to fill',
      options,
    })

    const selectReply = await interaction.reply({
      content: `**Select a buy order for ${formatCommodity(resolvedCommodity.ticker)}:**`,
      components: [selectRow],
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
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
      const modal = createQuantityNotesModal({
        modalId,
        title: `Fill ${selectedOrder.commodityTicker}`,
        maxQuantity: selectedOrder.quantity,
        quantityLabel: `Quantity (max ${selectedOrder.quantity} wanted)`,
        notesPlaceholder: 'Any message for the buyer',
      })

      await selectInteraction.showModal(modal)

      // Wait for modal submit
      const modalSubmit = await awaitModal(selectInteraction, modalId)
      if (!modalSubmit) return

      await handleFillModalSubmit(modalSubmit, interaction, userId, selectedOrder)
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
 * Updates the original message instead of creating a new ephemeral reply
 */
async function handleFillModalSubmit(
  modalInteraction: ModalSubmitInteraction,
  originalInteraction: ChatInputCommandInteraction,
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
  const quantityStr = modalInteraction.fields.getTextInputValue('quantity').trim()
  const notes = modalInteraction.fields.getTextInputValue('notes').trim()

  // Validate quantity
  const quantity = parseInt(quantityStr, 10)
  if (isNaN(quantity) || quantity <= 0) {
    await modalInteraction.deferUpdate()
    await originalInteraction.editReply({
      content: '❌ Invalid quantity. Please enter a positive number.\n\nRun `/fill` to try again.',
      components: [],
    })
    return
  }

  if (quantity > order.quantity) {
    await modalInteraction.deferUpdate()
    await originalInteraction.editReply({
      content: `❌ Quantity exceeds requested amount. Maximum: ${order.quantity}\n\nRun \`/fill\` to try again.`,
      components: [],
    })
    return
  }

  try {
    // Create the reservation
    const reservation = await createReservation(
      'buy',
      order.id,
      userId,
      quantity,
      notes || undefined
    )

    logger.info(
      {
        reservationId: reservation.id,
        orderId: order.id,
        userId,
        quantity,
        commodity: order.commodityTicker,
        location: order.locationId,
      },
      'Fill offer created'
    )

    const ownerName = getDisplayName({
      username: order.ownerUsername,
      displayName: order.ownerDisplayName,
      fioUsername: order.ownerFioUsername,
    })

    // Resolve price from price list if needed
    const price = await formatOrderPrice(order)
    const totalValue = calculateTotal(price, quantity)

    const embed = createSuccessEmbed({
      title: '📝 Fill Offer Created',
      description:
        `You have offered to fill **${quantity}x ${formatCommodity(order.commodityTicker)}** ` +
        `for **${ownerName}** at **${order.locationId}**.\n\n` +
        `**Price:** ${price.displayPrice} ${price.displayCurrency}/unit\n` +
        `**Total:** ${totalValue} ${price.displayCurrency}\n\n` +
        `The buyer will be notified and can confirm or reject your offer.\n` +
        `Use \`/reservations\` to track your reservations.`,
      footer: `Reservation #${reservation.id}`,
      notes: notes || undefined,
    })

    // Acknowledge modal and update original message (no new ephemeral message)
    await modalInteraction.deferUpdate()
    await originalInteraction.editReply({
      content: null,
      embeds: [embed],
      components: [],
    })
  } catch (error) {
    logger.error(
      { error, orderId: order.id, userId, quantity },
      'Failed to create fill reservation'
    )
    await modalInteraction.deferUpdate()
    await originalInteraction.editReply({
      content: '❌ Failed to create reservation. Please try again.',
      components: [],
    })
  }
}
