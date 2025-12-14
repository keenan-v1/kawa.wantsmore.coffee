import {
  createClient,
  registerCommands,
  setupEventHandlers,
  startBot,
  syncCommandsIfChanged,
} from './client.js'
import { commands } from './commands/index.js'
import logger from './utils/logger.js'

async function main(): Promise<void> {
  logger.info({ commandCount: commands.length }, 'Starting Kawakawa Discord Bot')

  // Sync slash commands with Discord (only deploys if changed)
  const synced = await syncCommandsIfChanged(commands)
  if (synced) {
    logger.info('Commands synced with Discord')
  } else {
    logger.info('Commands already up to date')
  }

  const client = createClient()

  // Register all commands with the client
  registerCommands(client, commands)

  // Set up event handlers
  setupEventHandlers(client)

  // Connect to Discord
  await startBot(client)
}

main().catch(error => {
  logger.fatal({ error }, 'Failed to start bot')
  process.exit(1)
})
