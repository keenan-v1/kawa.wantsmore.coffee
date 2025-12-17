import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import { replyError, replySuccess, replyInfo, replyWarning, replyEphemeral } from './replies.js'
import type { ChatInputCommandInteraction } from 'discord.js'

describe('replies', () => {
  let mockInteraction: ChatInputCommandInteraction

  beforeEach(() => {
    mockInteraction = {
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction
  })

  describe('replyError', () => {
    it('should send an ephemeral error reply with error emoji', async () => {
      await replyError(mockInteraction, 'Something went wrong')

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Something went wrong',
        flags: MessageFlags.Ephemeral,
      })
    })

    it('should handle empty message', async () => {
      await replyError(mockInteraction, '')

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ ',
        flags: MessageFlags.Ephemeral,
      })
    })
  })

  describe('replySuccess', () => {
    it('should send an ephemeral success reply with checkmark emoji', async () => {
      await replySuccess(mockInteraction, 'Order created successfully!')

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '✅ Order created successfully!',
        flags: MessageFlags.Ephemeral,
      })
    })

    it('should handle messages with special characters', async () => {
      await replySuccess(mockInteraction, 'Reserved 100x COF @ $50.00')

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '✅ Reserved 100x COF @ $50.00',
        flags: MessageFlags.Ephemeral,
      })
    })
  })

  describe('replyInfo', () => {
    it('should send an ephemeral info reply with info emoji', async () => {
      await replyInfo(mockInteraction, 'Your order is pending.')

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'ℹ️ Your order is pending.',
        flags: MessageFlags.Ephemeral,
      })
    })
  })

  describe('replyWarning', () => {
    it('should send an ephemeral warning reply with warning emoji', async () => {
      await replyWarning(mockInteraction, 'Low inventory detected')

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '⚠️ Low inventory detected',
        flags: MessageFlags.Ephemeral,
      })
    })
  })

  describe('replyEphemeral', () => {
    it('should send an ephemeral reply with custom content', async () => {
      await replyEphemeral(mockInteraction, {
        content: 'Custom message',
      })

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Custom message',
        flags: MessageFlags.Ephemeral,
      })
    })

    it('should send an ephemeral reply with embeds', async () => {
      const mockEmbed = { title: 'Test' }
      await replyEphemeral(mockInteraction, {
        embeds: [mockEmbed as never],
      })

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [mockEmbed],
        flags: MessageFlags.Ephemeral,
      })
    })

    it('should send an ephemeral reply with components', async () => {
      const mockComponent = { type: 1, components: [] }
      await replyEphemeral(mockInteraction, {
        components: [mockComponent as never],
      })

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        components: [mockComponent],
        flags: MessageFlags.Ephemeral,
      })
    })

    it('should send an ephemeral reply with multiple options', async () => {
      const mockEmbed = { title: 'Test' }
      await replyEphemeral(mockInteraction, {
        content: 'Message with embed',
        embeds: [mockEmbed as never],
      })

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Message with embed',
        embeds: [mockEmbed],
        flags: MessageFlags.Ephemeral,
      })
    })
  })
})
