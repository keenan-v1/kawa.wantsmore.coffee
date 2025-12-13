import {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  REST,
  Routes,
  MessageFlags,
} from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import { getConfig } from './config.js'

export interface Command {
  data: {
    name: string
    description: string
    toJSON(): unknown
  }
  execute(interaction: ChatInputCommandInteraction): Promise<void>
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>
}

export interface BotClient extends Client {
  commands: Collection<string, Command>
}

/**
 * Create and configure the Discord client.
 */
export function createClient(): BotClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
  }) as BotClient

  client.commands = new Collection()

  return client
}

/**
 * Register commands with a client instance.
 */
export function registerCommands(client: BotClient, commands: Command[]): void {
  for (const command of commands) {
    client.commands.set(command.data.name, command)
  }
}

/**
 * Set up event handlers for the client.
 */
export function setupEventHandlers(client: BotClient): void {
  client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`)
  })

  client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName)

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`)
        return
      }

      try {
        await command.execute(interaction)
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error)

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error executing this command.',
            flags: MessageFlags.Ephemeral,
          })
        } else {
          await interaction.reply({
            content: 'There was an error executing this command.',
            flags: MessageFlags.Ephemeral,
          })
        }
      }
    } else if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName)

      if (!command?.autocomplete) {
        return
      }

      try {
        await command.autocomplete(interaction)
      } catch (error) {
        console.error(`Error in autocomplete for ${interaction.commandName}:`, error)
      }
    }
  })
}

/**
 * Normalize command data for comparison.
 * Removes fields that Discord adds/modifies and sorts for consistent comparison.
 */
function normalizeCommandData(data: Record<string, unknown>): Record<string, unknown> {
  // Fields to keep for comparison (Discord-managed fields are excluded)
  const { name, description, options, default_member_permissions, dm_permission } = data
  const normalized: Record<string, unknown> = { name, description }

  if (options && Array.isArray(options) && options.length > 0) {
    normalized.options = (options as Record<string, unknown>[]).map(opt => normalizeOption(opt))
  }
  // Only include default_member_permissions if it's not null/undefined
  if (default_member_permissions !== undefined && default_member_permissions !== null) {
    normalized.default_member_permissions = default_member_permissions
  }
  if (dm_permission !== undefined && dm_permission !== null) {
    normalized.dm_permission = dm_permission
  }

  return normalized
}

/**
 * Normalize a command option for comparison.
 */
function normalizeOption(opt: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    name: opt.name,
    description: opt.description,
    type: opt.type,
  }

  // Discord omits required when false, so only include when true
  if (opt.required === true) normalized.required = true
  if (opt.autocomplete !== undefined) normalized.autocomplete = opt.autocomplete
  if (opt.choices && Array.isArray(opt.choices) && opt.choices.length > 0) {
    normalized.choices = opt.choices
  }
  if (opt.options && Array.isArray(opt.options) && opt.options.length > 0) {
    normalized.options = (opt.options as Record<string, unknown>[]).map(o => normalizeOption(o))
  }
  if (opt.min_value !== undefined) normalized.min_value = opt.min_value
  if (opt.max_value !== undefined) normalized.max_value = opt.max_value
  if (opt.min_length !== undefined) normalized.min_length = opt.min_length
  if (opt.max_length !== undefined) normalized.max_length = opt.max_length
  if (opt.channel_types && Array.isArray(opt.channel_types) && opt.channel_types.length > 0) {
    normalized.channel_types = opt.channel_types
  }

  return normalized
}

/**
 * Check if two command definitions are equal.
 */
function commandsEqual(
  local: Record<string, unknown>[],
  remote: Record<string, unknown>[]
): boolean {
  if (local.length !== remote.length) {
    console.log(`Command count differs: local=${local.length}, remote=${remote.length}`)
    return false
  }

  const localNormalized = local.map(normalizeCommandData)
  const remoteNormalized = remote.map(normalizeCommandData)

  // Sort by name for consistent comparison
  localNormalized.sort((a, b) => (a.name as string).localeCompare(b.name as string))
  remoteNormalized.sort((a, b) => (a.name as string).localeCompare(b.name as string))

  const localJson = JSON.stringify(localNormalized)
  const remoteJson = JSON.stringify(remoteNormalized)

  if (localJson !== remoteJson) {
    // Find which commands differ
    for (let i = 0; i < localNormalized.length; i++) {
      const localCmd = JSON.stringify(localNormalized[i])
      const remoteCmd = JSON.stringify(remoteNormalized[i])
      if (localCmd !== remoteCmd) {
        console.log(`Command "${localNormalized[i].name}" differs:`)
        console.log('  Local:', localCmd)
        console.log('  Remote:', remoteCmd)
      }
    }
    return false
  }

  return true
}

/**
 * Sync slash commands to Discord only if they have changed.
 * Returns true if commands were updated, false if no changes were needed.
 */
export async function syncCommandsIfChanged(commands: Command[]): Promise<boolean> {
  const config = await getConfig()
  const rest = new REST().setToken(config.token)

  const localCommandData = commands.map(cmd => cmd.data.toJSON() as Record<string, unknown>)

  // Fetch currently registered commands from Discord
  let remoteCommands: Record<string, unknown>[]
  try {
    if (config.guildId) {
      remoteCommands = (await rest.get(
        Routes.applicationGuildCommands(config.clientId, config.guildId)
      )) as Record<string, unknown>[]
    } else {
      remoteCommands = (await rest.get(
        Routes.applicationCommands(config.clientId)
      )) as Record<string, unknown>[]
    }
  } catch (_error) {
    console.log('Could not fetch remote commands, deploying all commands...')
    await deployCommands(commands)
    return true
  }

  // Compare local and remote commands
  if (commandsEqual(localCommandData, remoteCommands)) {
    console.log(`Commands are up to date (${commands.length} commands registered)`)
    return false
  }

  // Commands differ, deploy the new ones
  console.log('Commands have changed, syncing with Discord...')
  await deployCommands(commands)
  return true
}

/**
 * Deploy slash commands to Discord.
 * If guildId is provided, commands are deployed to that guild (instant).
 * If guildId is null, commands are deployed globally (takes up to 1 hour).
 */
export async function deployCommands(commands: Command[]): Promise<void> {
  const config = await getConfig()
  const rest = new REST().setToken(config.token)

  const commandData = commands.map(cmd => cmd.data.toJSON())

  console.log(`Deploying ${commandData.length} application (/) commands...`)

  if (config.guildId) {
    // Guild commands - instant update
    const data = (await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: commandData,
    })) as unknown[]

    console.log(`Successfully deployed ${data.length} guild commands.`)
  } else {
    // Global commands - takes up to 1 hour to propagate
    const data = (await rest.put(Routes.applicationCommands(config.clientId), {
      body: commandData,
    })) as unknown[]

    console.log(`Successfully deployed ${data.length} global commands.`)
  }
}

/**
 * Start the bot by connecting to Discord.
 */
export async function startBot(client: BotClient): Promise<void> {
  const config = await getConfig()
  await client.login(config.token)
}
