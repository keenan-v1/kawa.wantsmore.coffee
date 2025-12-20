import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

interface HelpCommand {
  /** Command name without prefix (e.g., 'register') */
  name: string
  description: string
  details?: string
}

interface HelpSection {
  title: string
  emoji: string
  commands: HelpCommand[]
}

/** Command sections with command names (without prefix) */
const COMMANDS: Record<string, HelpSection> = {
  getting_started: {
    title: 'Getting Started',
    emoji: '🚀',
    commands: [
      {
        name: 'register',
        description: 'Create a new Kawakawa account linked to your Discord',
      },
      {
        name: 'link',
        description: 'Link your Discord to an existing Kawakawa account',
      },
      {
        name: 'whoami',
        description: 'View your linked account info and FIO status',
      },
      {
        name: 'unlink',
        description: 'Unlink your Discord from your Kawakawa account',
      },
    ],
  },
  inventory: {
    title: 'Inventory',
    emoji: '📦',
    commands: [
      {
        name: 'inventory',
        description: 'View your synced FIO inventory with filtering options',
        details: 'Filter by commodity or location. Use the Share button to post publicly.',
      },
      {
        name: 'sync',
        description: 'Sync your inventory from FIO (requires FIO credentials)',
      },
    ],
  },
  orders: {
    title: 'Creating Orders',
    emoji: '💰',
    commands: [
      {
        name: 'sell',
        description: 'Create a single sell order for a commodity at a location',
      },
      {
        name: 'buy',
        description: 'Create a single buy request for a commodity at a location',
      },
      {
        name: 'bulksell',
        description: 'Create multiple sell orders at once using multi-line input',
        details:
          'Format: `TICKER LOCATION [limit] PRICE [CURRENCY]`\n' +
          'Examples:\n' +
          '`COF UV-351a 150`\n' +
          '`RAT BEN max:500 125.50 ICA`\n' +
          '`DW MOR reserve:100 75`',
      },
      {
        name: 'bulkbuy',
        description: 'Create multiple buy requests at once using multi-line input',
        details:
          'Format: `TICKER LOCATION QUANTITY PRICE [CURRENCY]`\n' +
          'Examples:\n' +
          '`COF UV-351a 1000 150`\n' +
          '`RAT BEN 500 125.50 ICA`',
      },
    ],
  },
  market: {
    title: 'Market',
    emoji: '📊',
    commands: [
      {
        name: 'orders',
        description: 'View and manage your orders (defaults to your own)',
        details:
          'Shows your orders by default. Add filters to search the market.\n' +
          'Use the Manage button to edit or delete your orders.',
      },
      {
        name: 'query',
        description: 'Search the market for commodities or browse by location',
        details: 'Find what others are selling or buying.',
      },
    ],
  },
  reservations: {
    title: 'Reservations',
    emoji: '📝',
    commands: [
      {
        name: 'reserve',
        description: 'Reserve items from a sell order',
        details:
          'Browse available sell orders for a commodity, then reserve a quantity.\n' +
          'The seller will be notified and can confirm or reject.',
      },
      {
        name: 'fill',
        description: 'Offer to fill a buy order',
        details:
          'Browse open buy orders for a commodity, then offer to supply.\n' +
          'The buyer will be notified and can confirm or reject.',
      },
      {
        name: 'reservations',
        description: 'View and manage your reservations',
        details:
          'See reservations where you are the order owner or counterparty.\n' +
          'Confirm, reject, fulfill, or cancel reservations.',
      },
    ],
  },
  settings: {
    title: 'Settings',
    emoji: '⚙️',
    commands: [
      {
        name: 'settings',
        description: 'View and manage your personal settings',
        details:
          '- Location/commodity display modes\n' +
          '- Preferred currency\n' +
          '- Default price list for auto-pricing\n' +
          '- Favorite locations and commodities',
      },
    ],
  },
}

/** Format a command name with the appropriate prefix */
function cmd(name: string, prefix: string): string {
  return `${prefix}${name}`
}

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to use the Kawakawa Exchange bot')
    .addStringOption(option =>
      option
        .setName('topic')
        .setDescription('Get help on a specific topic')
        .setRequired(false)
        .addChoices(
          { name: 'Getting Started', value: 'getting_started' },
          { name: 'Inventory', value: 'inventory' },
          { name: 'Creating Orders', value: 'orders' },
          { name: 'Market', value: 'market' },
          { name: 'Reservations', value: 'reservations' },
          { name: 'Settings', value: 'settings' }
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const topic = interaction.options.getString('topic')
    const prefix = getCommandPrefix(interaction)

    if (topic && topic in COMMANDS) {
      // Show specific topic
      const section = COMMANDS[topic]
      const embed = new EmbedBuilder()
        .setTitle(`${section.emoji} ${section.title}`)
        .setColor(0x5865f2)

      for (const command of section.commands) {
        let value = command.description
        if (command.details) {
          value += `\n\n${command.details}`
        }
        embed.addFields({ name: cmd(command.name, prefix), value, inline: false })
      }

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Show overview
    const embed = new EmbedBuilder()
      .setTitle('Kawakawa Exchange Bot')
      .setColor(0x5865f2)
      .setDescription(
        'Welcome to the Kawakawa internal commodity exchange!\n\n' +
          'This bot helps you manage inventory, create buy/sell orders, and trade with other members.\n\n' +
          `Use \`${cmd('help', prefix)} topic:\` to learn more about a specific area.`
      )

    // Add sections overview
    for (const section of Object.values(COMMANDS)) {
      const commandList = section.commands.map(c => `\`${cmd(c.name, prefix)}\``).join(', ')
      embed.addFields({
        name: `${section.emoji} ${section.title}`,
        value: commandList,
        inline: false,
      })
    }

    // Quick start guide
    embed.addFields({
      name: '📋 Quick Start',
      value:
        `1. \`${cmd('register', prefix)}\` - Create your account\n` +
        `2. \`${cmd('settings', prefix)}\` - Set up your FIO credentials\n` +
        `3. \`${cmd('sync', prefix)}\` - Import your inventory from FIO\n` +
        `4. \`${cmd('bulksell', prefix)}\` - List items for sale\n` +
        `5. \`${cmd('query', prefix)}\` - Browse the market`,
      inline: false,
    })

    embed.setFooter({
      text: 'Tip: Most commands are ephemeral (only you see them). Use Share buttons to post publicly.',
    })

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })
  },
}
