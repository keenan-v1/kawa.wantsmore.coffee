import { deployCommands } from './client.js'
import { commands } from './commands/index.js'
import logger from './utils/logger.js'

async function main(): Promise<void> {
  logger.info('Deploying slash commands to Discord...')

  await deployCommands(commands)

  logger.info('Done!')
  process.exit(0)
}

main().catch(error => {
  logger.error({ error }, 'Failed to deploy commands')
  process.exit(1)
})
