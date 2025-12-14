/**
 * /reservations command - View and manage your reservations
 * Shows reservations where user is either the order owner or the counterparty
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { getDisplaySettings } from '../../services/userSettings.js'
import { formatLocation } from '../../services/display.js'
import type { LocationDisplayMode, Currency } from '@kawakawa/types'
import {
  getReservationsForUser,
  updateReservationStatus,
  getStatusEmoji,
  type ReservationWithDetails,
  type ReservationStatus,
} from '../../services/reservationService.js'
import { getOrderDisplayPrice } from '@kawakawa/services/market'

const COMPONENT_TIMEOUT = 5 * 60 * 1000 // 5 minutes
const RESERVATIONS_PER_PAGE = 5

export const reservations: Command = {
  data: new SlashCommandBuilder()
    .setName('reservations')
    .setDescription('View and manage your reservations')
    .addStringOption(option =>
      option
        .setName('status')
        .setDescription('Filter by status')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Pending', value: 'pending' },
          { name: 'Confirmed', value: 'confirmed' },
          { name: 'Fulfilled', value: 'fulfilled' },
          { name: 'Cancelled', value: 'cancelled' },
          { name: 'Rejected', value: 'rejected' }
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id
    const statusFilter =
      (interaction.options.getString('status') as ReservationStatus | 'all' | null) || 'all'

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

    // Get reservations
    const allReservations = await getReservationsForUser(userId, statusFilter)

    if (allReservations.length === 0) {
      const statusText = statusFilter === 'all' ? '' : ` with status "${statusFilter}"`
      await interaction.reply({
        content: `📭 No reservations found${statusText}.\n\nUse \`/reserve\` to reserve from a sell order or \`/fill\` to offer to fill a buy order.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Paginate and display
    await sendReservationsWithPagination(
      interaction,
      allReservations,
      userId,
      displaySettings.locationDisplayMode,
      statusFilter
    )
  },
}

/**
 * Send reservations with pagination and action buttons
 */
async function sendReservationsWithPagination(
  interaction: ChatInputCommandInteraction,
  allReservations: ReservationWithDetails[],
  userId: number,
  locationDisplayMode: string,
  statusFilter: ReservationStatus | 'all'
): Promise<void> {
  const idPrefix = `reservations:${Date.now()}`
  let currentPage = 0
  const totalPages = Math.ceil(allReservations.length / RESERVATIONS_PER_PAGE)

  const buildEmbed = async (page: number): Promise<EmbedBuilder> => {
    const start = page * RESERVATIONS_PER_PAGE
    const pageReservations = allReservations.slice(start, start + RESERVATIONS_PER_PAGE)

    const embed = new EmbedBuilder()
      .setTitle('📋 Your Reservations')
      .setColor(0x5865f2)
      .setTimestamp()

    if (statusFilter !== 'all') {
      embed.setDescription(`Showing: ${statusFilter}`)
    }

    // Add reservation fields
    for (const reservation of pageReservations) {
      const field = await formatReservationField(reservation, userId, locationDisplayMode)
      embed.addFields(field)
    }

    embed.setFooter({ text: `Page ${page + 1}/${totalPages} | Use Manage to take actions` })

    return embed
  }

  const buildButtons = (page: number): ActionRowBuilder<ButtonBuilder> => {
    const row = new ActionRowBuilder<ButtonBuilder>()

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:prev`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:info`)
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:next`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:manage`)
        .setLabel('🔧 Manage')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:refresh`)
        .setLabel('🔄')
        .setStyle(ButtonStyle.Secondary)
    )

    return row
  }

  const response = await interaction.reply({
    embeds: [await buildEmbed(0)],
    components: [buildButtons(0)],
    flags: MessageFlags.Ephemeral,
  })

  const collector = response.createMessageComponentCollector({
    time: COMPONENT_TIMEOUT,
    filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
  })

  collector.on(
    'collect',
    async (btnInteraction: ButtonInteraction | StringSelectMenuInteraction) => {
      if (btnInteraction.isButton()) {
        const action = btnInteraction.customId.split(':')[2]

        switch (action) {
          case 'prev':
            if (currentPage > 0) currentPage--
            await btnInteraction.update({
              embeds: [await buildEmbed(currentPage)],
              components: [buildButtons(currentPage)],
            })
            break

          case 'next':
            if (currentPage < totalPages - 1) currentPage++
            await btnInteraction.update({
              embeds: [await buildEmbed(currentPage)],
              components: [buildButtons(currentPage)],
            })
            break

          case 'refresh': {
            // Refresh the reservations
            const refreshed = await getReservationsForUser(userId, statusFilter)
            if (refreshed.length === 0) {
              await btnInteraction.update({
                content: '📭 No reservations found.',
                embeds: [],
                components: [],
              })
              return
            }
            allReservations.length = 0
            allReservations.push(...refreshed)
            currentPage = Math.min(
              currentPage,
              Math.ceil(allReservations.length / RESERVATIONS_PER_PAGE) - 1
            )
            await btnInteraction.update({
              embeds: [await buildEmbed(currentPage)],
              components: [buildButtons(currentPage)],
            })
            break
          }

          case 'manage': {
            // Show select menu to pick a reservation to manage
            if (allReservations.length === 0) {
              await btnInteraction.reply({
                content: '📭 No reservations to manage.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            const options: { label: string; value: string; description: string }[] = []
            for (const res of allReservations.slice(0, 25)) {
              const statusEmoji = getStatusEmoji(res.status)
              const typeLabel = res.type === 'sell' ? 'Buy from' : 'Sell to'
              const isOwner = res.ownerId === userId
              const otherParty = isOwner
                ? res.counterpartyFioUsername ?? res.counterpartyDisplayName ?? res.counterpartyUsername
                : res.ownerFioUsername ?? res.ownerDisplayName ?? res.ownerUsername

              options.push({
                label: `#${res.id} ${statusEmoji} ${res.commodityTicker} (${res.quantity})`,
                value: `${res.id}`,
                description: `${typeLabel} ${otherParty} @ ${res.locationId}`,
              })
            }

            const selectMenuId = `${idPrefix}:select`
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(selectMenuId)
              .setPlaceholder('Select a reservation to manage')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(options)

            const selectRow =
              new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

            const manageReply = await btnInteraction.reply({
              content: '**Select a reservation to manage:**',
              components: [selectRow],
              flags: MessageFlags.Ephemeral,
              withResponse: true,
            })

            // Wait for selection
            try {
              const selectInteraction =
                await manageReply.resource?.message?.awaitMessageComponent({
                  filter: i => i.customId === selectMenuId && i.user.id === interaction.user.id,
                  time: 60000,
                })

              if (selectInteraction?.isStringSelectMenu()) {
                const selectedId = parseInt(selectInteraction.values[0], 10)
                const selectedReservation = allReservations.find(r => r.id === selectedId)

                if (!selectedReservation) {
                  await selectInteraction.update({
                    content: '❌ Reservation not found. Please try again.',
                    components: [],
                  })
                  return
                }

                await showReservationActions(
                  selectInteraction,
                  selectedReservation,
                  userId,
                  locationDisplayMode,
                  interaction
                )
              }
            } catch {
              // Selection timed out
            }
            break
          }
        }
      }
    }
  )

  collector.on('end', async () => {
    try {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:expired`)
          .setLabel('Session expired - run /reservations again')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
      await interaction.editReply({ components: [disabledRow] })
    } catch {
      // Interaction may have been deleted
    }
  })
}

/**
 * Show action buttons for a specific reservation
 */
async function showReservationActions(
  selectInteraction: StringSelectMenuInteraction,
  reservation: ReservationWithDetails,
  userId: number,
  locationDisplayMode: string,
  originalInteraction: ChatInputCommandInteraction
): Promise<void> {
  const isOwner = reservation.ownerId === userId
  const location = await formatLocation(reservation.locationId, locationDisplayMode as LocationDisplayMode)
  const statusEmoji = getStatusEmoji(reservation.status)

  const ownerName =
    reservation.ownerFioUsername ?? reservation.ownerDisplayName ?? reservation.ownerUsername
  const counterpartyName =
    reservation.counterpartyFioUsername ??
    reservation.counterpartyDisplayName ??
    reservation.counterpartyUsername

  // Resolve price from price list if needed
  const priceInfo = await getOrderDisplayPrice({
    price: reservation.price,
    currency: reservation.currency as Currency,
    priceListCode: reservation.priceListCode,
    commodityTicker: reservation.commodityTicker,
    locationId: reservation.locationId,
  })

  const displayPrice = priceInfo ? priceInfo.price.toFixed(2) : reservation.price
  const displayCurrency = priceInfo ? priceInfo.currency : reservation.currency
  const total = priceInfo
    ? (priceInfo.price * reservation.quantity).toFixed(2)
    : (parseFloat(reservation.price) * reservation.quantity).toFixed(2)

  // Build description
  let description = ''
  if (reservation.type === 'sell') {
    description = `📤 **SELL** ${reservation.quantity}x **${reservation.commodityTicker}** @ **${location}**\n`
    description += `Seller: **${ownerName}**\n`
    description += `Buyer: **${counterpartyName}**\n`
  } else {
    description = `📥 **BUY** ${reservation.quantity}x **${reservation.commodityTicker}** @ **${location}**\n`
    description += `Buyer: **${ownerName}**\n`
    description += `Seller: **${counterpartyName}**\n`
  }

  description += `\nPrice: **${displayPrice} ${displayCurrency}**/unit\n`
  description += `Total: **${total} ${displayCurrency}**\n`
  description += `\nStatus: ${statusEmoji} **${reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1)}**\n`

  if (reservation.notes) {
    description += `\nNotes: *${reservation.notes}*`
  }

  description += `\n\n*You are the ${isOwner ? 'order owner' : 'counterparty'}*`

  const embed = new EmbedBuilder()
    .setTitle(`Reservation #${reservation.id}`)
    .setColor(0x5865f2)
    .setDescription(description)
    .setTimestamp()

  // Build action buttons based on role and status
  const actionButtons = getActionButtons(reservation, isOwner)

  if (actionButtons.length === 0) {
    await selectInteraction.update({
      content: '',
      embeds: [embed],
      components: [],
    })
    return
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...actionButtons)

  const actionReply = await selectInteraction.update({
    content: '',
    embeds: [embed],
    components: [buttonRow],
  })

  // Wait for action
  try {
    const actionInteraction = await actionReply.awaitMessageComponent({
      filter: i =>
        i.customId.startsWith('res-action:') && i.user.id === originalInteraction.user.id,
      time: 60000,
    })

    if (actionInteraction?.isButton()) {
      const [, action] = actionInteraction.customId.split(':')
      await handleReservationAction(
        actionInteraction,
        reservation.id,
        userId,
        action as ReservationStatus,
        isOwner
      )
    }
  } catch {
    // Action timed out
  }
}

/**
 * Get available action buttons based on reservation state and user role
 */
function getActionButtons(
  reservation: ReservationWithDetails,
  isOwner: boolean
): ButtonBuilder[] {
  const buttons: ButtonBuilder[] = []
  const status = reservation.status

  if (isOwner) {
    // Order owner actions
    switch (status) {
      case 'pending':
        buttons.push(
          new ButtonBuilder()
            .setCustomId('res-action:confirmed')
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('res-action:rejected')
            .setLabel('❌ Reject')
            .setStyle(ButtonStyle.Danger)
        )
        break
      case 'confirmed':
        buttons.push(
          new ButtonBuilder()
            .setCustomId('res-action:fulfilled')
            .setLabel('🎉 Mark Fulfilled')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('res-action:cancelled')
            .setLabel('🚫 Cancel')
            .setStyle(ButtonStyle.Danger)
        )
        break
    }
  } else {
    // Counterparty actions
    switch (status) {
      case 'pending':
        buttons.push(
          new ButtonBuilder()
            .setCustomId('res-action:cancelled')
            .setLabel('🚫 Cancel')
            .setStyle(ButtonStyle.Danger)
        )
        break
      case 'confirmed':
        buttons.push(
          new ButtonBuilder()
            .setCustomId('res-action:fulfilled')
            .setLabel('🎉 Mark Fulfilled')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('res-action:cancelled')
            .setLabel('🚫 Cancel')
            .setStyle(ButtonStyle.Danger)
        )
        break
      case 'cancelled':
        buttons.push(
          new ButtonBuilder()
            .setCustomId('res-action:pending')
            .setLabel('🔄 Reopen')
            .setStyle(ButtonStyle.Secondary)
        )
        break
    }
  }

  return buttons
}

/**
 * Handle reservation action (status update)
 */
async function handleReservationAction(
  btnInteraction: ButtonInteraction,
  reservationId: number,
  userId: number,
  newStatus: ReservationStatus,
  isOwner: boolean
): Promise<void> {
  const result = await updateReservationStatus(reservationId, userId, newStatus, isOwner)

  if (!result.success) {
    await btnInteraction.update({
      content: `❌ ${result.error}`,
      embeds: [],
      components: [],
    })
    return
  }

  const statusEmoji = getStatusEmoji(newStatus)
  const statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1)

  await btnInteraction.update({
    content: `${statusEmoji} Reservation updated to **${statusText}**.\n\nRun \`/reservations\` to see the updated list.`,
    embeds: [],
    components: [],
  })
}

/**
 * Format a reservation for embed field display
 */
async function formatReservationField(
  reservation: ReservationWithDetails,
  viewerId: number,
  locationDisplayMode: string
): Promise<{ name: string; value: string; inline: boolean }> {
  const location = await formatLocation(reservation.locationId, locationDisplayMode as LocationDisplayMode)
  const statusEmoji = getStatusEmoji(reservation.status)
  const isOwner = reservation.ownerId === viewerId

  const ownerName =
    reservation.ownerFioUsername ?? reservation.ownerDisplayName ?? reservation.ownerUsername
  const counterpartyName =
    reservation.counterpartyFioUsername ??
    reservation.counterpartyDisplayName ??
    reservation.counterpartyUsername

  // Resolve price from price list if needed
  const priceInfo = await getOrderDisplayPrice({
    price: reservation.price,
    currency: reservation.currency as Currency,
    priceListCode: reservation.priceListCode,
    commodityTicker: reservation.commodityTicker,
    locationId: reservation.locationId,
  })

  const displayPrice = priceInfo ? priceInfo.price.toFixed(2) : reservation.price
  const displayCurrency = priceInfo ? priceInfo.currency : reservation.currency

  let description = ''
  if (reservation.type === 'sell') {
    description = `📤 ${reservation.quantity}x **${reservation.commodityTicker}** @ ${location}\n`
    if (!isOwner) {
      description += `From: ${ownerName}\n`
    } else {
      description += `To: ${counterpartyName}\n`
    }
  } else {
    description = `📥 ${reservation.quantity}x **${reservation.commodityTicker}** @ ${location}\n`
    if (!isOwner) {
      description += `For: ${ownerName}\n`
    } else {
      description += `From: ${counterpartyName}\n`
    }
  }

  description += `${displayPrice} ${displayCurrency} | ${statusEmoji} ${reservation.status}`

  return {
    name: `#${reservation.id} ${isOwner ? '(owner)' : '(you)'}`,
    value: description,
    inline: false,
  }
}
