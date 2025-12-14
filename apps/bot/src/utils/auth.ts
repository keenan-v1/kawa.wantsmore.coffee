/**
 * Authentication utilities for Discord bot commands
 */
import { MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import { db, userDiscordProfiles } from '@kawakawa/db'
import { eq } from 'drizzle-orm'

/**
 * Message shown when user doesn't have a linked account
 */
export const UNLINKED_ACCOUNT_MESSAGE =
  'You do not have a linked Kawakawa account.\n\n' +
  'Use `/register` to create a new account, or `/link` to connect an existing one.'

/**
 * User profile with linked user data
 */
export interface LinkedUserResult {
  userId: number
  profile: {
    discordId: string
    userId: number
    user: {
      id: number
      username: string
      displayName: string | null
    }
  }
}

/**
 * Require user to have a linked Kawakawa account.
 * If not linked, sends an ephemeral error message and returns null.
 *
 * @param interaction - The Discord command interaction
 * @returns User profile with userId, or null if not linked
 *
 * @example
 * ```typescript
 * const result = await requireLinkedUser(interaction)
 * if (!result) return
 * const { userId, profile } = result
 * ```
 */
export async function requireLinkedUser(
  interaction: ChatInputCommandInteraction
): Promise<LinkedUserResult | null> {
  const profile = await db.query.userDiscordProfiles.findFirst({
    where: eq(userDiscordProfiles.discordId, interaction.user.id),
    with: {
      user: true,
    },
  })

  if (!profile) {
    await interaction.reply({
      content: UNLINKED_ACCOUNT_MESSAGE,
      flags: MessageFlags.Ephemeral,
    })
    return null
  }

  return { userId: profile.user.id, profile }
}
