import {
  createClient,
  registerCommands,
  setupEventHandlers,
  startBot,
  syncCommandsIfChanged,
} from './client.js'
import { commands } from './commands/index.js'

async function main(): Promise<void> {
  console.log('Starting Kawakawa Discord Bot...')

  // Sync slash commands with Discord (only deploys if changed)
  await syncCommandsIfChanged(commands)

  const client = createClient()

  // Register all commands with the client
  registerCommands(client, commands)

  // Set up event handlers
  setupEventHandlers(client)

  // Connect to Discord
  await startBot(client)
}

main().catch(error => {
  console.error('Failed to start bot:', error)
  process.exit(1)
})
