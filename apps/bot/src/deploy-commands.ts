import { deployCommands } from './client.js'
import { commands } from './commands/index.js'

async function main(): Promise<void> {
  console.log('Deploying slash commands to Discord...')

  await deployCommands(commands)

  console.log('Done!')
  process.exit(0)
}

main().catch(error => {
  console.error('Failed to deploy commands:', error)
  process.exit(1)
})
