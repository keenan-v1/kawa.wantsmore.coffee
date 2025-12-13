import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
} from 'discord.js'

/**
 * Interface for a slash command.
 */
export interface SlashCommand {
  /**
   * The command definition using SlashCommandBuilder.
   */
  data: SlashCommandBuilder

  /**
   * Execute the command when invoked.
   */
  execute(interaction: ChatInputCommandInteraction): Promise<void>

  /**
   * Handle autocomplete for this command (optional).
   */
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>
}
