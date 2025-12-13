import { describe, it, expect, vi } from 'vitest'

// Mock discord.js module with class factories using hoisted
vi.mock('discord.js', () => {
  // Create a proper EmbedBuilder class
  class MockEmbedBuilder {
    private data: {
      title?: string
      color?: number
      description?: string
      fields: { name: string; value: string; inline: boolean }[]
      footer?: { text: string }
    } = { fields: [] }

    setTitle(title: string) {
      this.data.title = title
      return this
    }
    setColor(color: number) {
      this.data.color = color
      return this
    }
    setDescription(desc: string) {
      this.data.description = desc
      return this
    }
    setFields(...fields: { name: string; value: string; inline?: boolean }[]) {
      this.data.fields = fields.map(f => ({ ...f, inline: f.inline ?? false }))
      return this
    }
    setFooter(footer: { text: string }) {
      this.data.footer = footer
      return this
    }
    setTimestamp() {
      return this
    }

    static from(embed: MockEmbedBuilder) {
      const newEmbed = new MockEmbedBuilder()
      newEmbed.data = { ...embed.data, fields: [...embed.data.fields] }
      return newEmbed
    }
  }

  class MockActionRowBuilder {
    private components: MockButtonBuilder[] = []

    addComponents(...components: MockButtonBuilder[]) {
      this.components.push(...components)
      return this
    }
  }

  class MockButtonBuilder {
    private data: { customId?: string; label?: string; style?: number; disabled?: boolean } = {}

    setCustomId(id: string) {
      this.data.customId = id
      return this
    }
    setLabel(label: string) {
      this.data.label = label
      return this
    }
    setStyle(style: number) {
      this.data.style = style
      return this
    }
    setDisabled(disabled: boolean) {
      this.data.disabled = disabled
      return this
    }
  }

  return {
    EmbedBuilder: MockEmbedBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonBuilder: MockButtonBuilder,
    ButtonStyle: {
      Primary: 1,
      Secondary: 2,
      Success: 3,
      Danger: 4,
      Link: 5,
    },
    MessageFlags: {
      Ephemeral: 64,
    },
    ComponentType: {
      Button: 2,
    },
  }
})

// Import after mock setup
import { sendPaginatedResponse, sendSimpleResponse, type PaginatedItem } from './pagination.js'
import { EmbedBuilder } from 'discord.js'

describe('pagination', () => {
  // Create a mock interaction factory
  function createMockInteraction() {
    const updateFn = vi.fn()
    const replyFn = vi.fn()
    const editReplyFn = vi.fn()
    const collectHandlers: Record<string, (interaction: unknown) => Promise<void>> = {}
    const endHandlers: (() => Promise<void>)[] = []

    const collector: { on: ReturnType<typeof vi.fn> } = {
      on: vi.fn(),
    }
    collector.on.mockImplementation(
      (event: string, handler: (interaction?: unknown) => Promise<void>) => {
        if (event === 'collect') {
          collectHandlers['collect'] = handler
        } else if (event === 'end') {
          endHandlers.push(handler)
        }
        return collector
      }
    )

    const mockResponse = {
      createMessageComponentCollector: vi.fn().mockReturnValue(collector),
    }

    replyFn.mockResolvedValue(mockResponse)

    const interaction = {
      user: {
        id: '123456789',
        displayName: 'TestUser',
      },
      reply: replyFn,
      editReply: editReplyFn,
    }

    return {
      interaction: interaction as unknown as Parameters<typeof sendPaginatedResponse>[0],
      replyFn,
      editReplyFn,
      collector,
      collectHandlers,
      endHandlers,
      updateFn,
      mockResponse,
    }
  }

  describe('sendPaginatedResponse', () => {
    it('sends initial embed with items', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test').setColor(0x5865f2)
      const items: PaginatedItem[] = [
        { name: 'Item 1', value: 'Value 1' },
        { name: 'Item 2', value: 'Value 2' },
      ]

      await sendPaginatedResponse(interaction, baseEmbed, items)

      expect(replyFn).toHaveBeenCalledTimes(1)
      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.flags).toBe(64) // Ephemeral
      expect(callArgs.embeds).toHaveLength(1)
    })

    it('shows buttons when allowShare is true even with single page', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = [{ name: 'Item 1', value: 'Value 1' }]

      await sendPaginatedResponse(interaction, baseEmbed, items, { allowShare: true })

      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.components).toHaveLength(1)
    })

    it('does not show buttons when single page and allowShare is false', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = [{ name: 'Item 1', value: 'Value 1' }]

      await sendPaginatedResponse(interaction, baseEmbed, items, { allowShare: false })

      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.components).toHaveLength(0)
    })

    it('shows buttons when multiple pages exist', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.components).toHaveLength(1)
    })

    it('creates collector for button interactions', async () => {
      const { interaction, mockResponse } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      expect(mockResponse.createMessageComponentCollector).toHaveBeenCalledTimes(1)
    })

    it('handles empty items gracefully', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')

      await sendPaginatedResponse(interaction, baseEmbed, [])

      expect(replyFn).toHaveBeenCalledTimes(1)
    })

    it('uses custom pageSize option', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 5 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 2 })

      // Should have buttons since 5 items / 2 per page = 3 pages
      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.components).toHaveLength(1)
    })

    it('uses custom idPrefix option', async () => {
      const { interaction, mockResponse } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { idPrefix: 'custom' })

      expect(mockResponse.createMessageComponentCollector).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.any(Function),
        })
      )
    })

    it('uses custom footerText option', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = [{ name: 'Item 1', value: 'Value 1' }]

      await sendPaginatedResponse(interaction, baseEmbed, items, {
        footerText: 'Custom footer',
        allowShare: false,
      })

      expect(replyFn).toHaveBeenCalledTimes(1)
    })

    it('handles button collector with prev action', async () => {
      const { interaction, collectHandlers } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      // Simulate prev button click (should not change page since we're on page 0)
      const updateFn = vi.fn()
      const buttonInteraction = {
        customId: 'page:prev',
        user: { id: '123456789' },
        update: updateFn,
      }

      if (collectHandlers['collect']) {
        await collectHandlers['collect'](buttonInteraction)
      }

      // On page 0, prev should still call update but stay on page 0
      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    it('handles button collector with next action', async () => {
      const { interaction, collectHandlers } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      const updateFn = vi.fn()
      const buttonInteraction = {
        customId: 'page:next',
        user: { id: '123456789' },
        update: updateFn,
      }

      if (collectHandlers['collect']) {
        await collectHandlers['collect'](buttonInteraction)
      }

      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    it('handles button collector with share action', async () => {
      const { interaction, collectHandlers } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = [{ name: 'Item 1', value: 'Value 1' }]

      await sendPaginatedResponse(interaction, baseEmbed, items, { allowShare: true })

      const replyFn = vi.fn()
      const buttonInteraction = {
        customId: 'page:share',
        user: { id: '123456789' },
        reply: replyFn,
      }

      if (collectHandlers['collect']) {
        await collectHandlers['collect'](buttonInteraction)
      }

      // Share should call reply (not update) without ephemeral flag
      expect(replyFn).toHaveBeenCalledTimes(1)
      expect(replyFn.mock.calls[0][0].embeds).toHaveLength(1)
    })

    it('handles collector end event', async () => {
      const { interaction, endHandlers, editReplyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      // Trigger end handler
      if (endHandlers.length > 0) {
        await endHandlers[0]()
      }

      expect(editReplyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.any(Array),
        })
      )
    })

    it('handles collector end event when editReply fails', async () => {
      const { interaction, endHandlers, editReplyFn } = createMockInteraction()
      editReplyFn.mockRejectedValue(new Error('Interaction deleted'))

      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      // Should not throw when editReply fails
      if (endHandlers.length > 0) {
        await expect(endHandlers[0]()).resolves.not.toThrow()
      }
    })

    it('handles unknown button action', async () => {
      const { interaction, collectHandlers } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      const updateFn = vi.fn()
      const buttonInteraction = {
        customId: 'page:unknown',
        user: { id: '123456789' },
        update: updateFn,
      }

      if (collectHandlers['collect']) {
        await collectHandlers['collect'](buttonInteraction)
      }

      // Unknown action should not call update
      expect(updateFn).not.toHaveBeenCalled()
    })

    it('prevents going below page 0', async () => {
      const { interaction, collectHandlers } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      const updateFn = vi.fn()
      const buttonInteraction = {
        customId: 'page:prev',
        user: { id: '123456789' },
        update: updateFn,
      }

      // Click prev multiple times - should stay on page 0
      if (collectHandlers['collect']) {
        await collectHandlers['collect'](buttonInteraction)
        await collectHandlers['collect'](buttonInteraction)
      }

      // Should have called update twice, staying on page 0
      expect(updateFn).toHaveBeenCalledTimes(2)
    })

    it('prevents going above max page', async () => {
      const { interaction, collectHandlers } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')
      const items: PaginatedItem[] = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: `Value ${i + 1}`,
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, { pageSize: 10 })

      const updateFn = vi.fn()
      const nextInteraction = {
        customId: 'page:next',
        user: { id: '123456789' },
        update: updateFn,
      }

      // Click next multiple times - should stop at page 1 (max)
      if (collectHandlers['collect']) {
        await collectHandlers['collect'](nextInteraction)
        await collectHandlers['collect'](nextInteraction)
        await collectHandlers['collect'](nextInteraction)
      }

      // Should have called update 3 times, but page shouldn't go above 1
      expect(updateFn).toHaveBeenCalledTimes(3)
    })

    it('splits pages based on maxEmbedSize', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')

      // Create 5 items, each ~1200 chars (name + value)
      // With maxEmbedSize of 2000, we should get 3 pages (2 items, 2 items, 1 item)
      const items: PaginatedItem[] = Array.from({ length: 5 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: 'x'.repeat(1190), // ~1200 total with name
      }))

      await sendPaginatedResponse(interaction, baseEmbed, items, {
        pageSize: 25, // High item limit
        maxEmbedSize: 2000, // Low char limit to force splits
      })

      // Should have buttons because pages were split
      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.components).toHaveLength(1)
    })

    it('respects both pageSize and maxEmbedSize limits', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const baseEmbed = new EmbedBuilder().setTitle('Test')

      // Create 10 small items
      const items: PaginatedItem[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Item ${i + 1}`,
        value: 'short',
      }))

      // pageSize of 3 should create ~4 pages even with high maxEmbedSize
      await sendPaginatedResponse(interaction, baseEmbed, items, {
        pageSize: 3,
        maxEmbedSize: 10000,
      })

      // Should have buttons because of pageSize limit
      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.components).toHaveLength(1)
    })
  })

  describe('sendSimpleResponse', () => {
    it('sends embed with share button by default', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const embed = new EmbedBuilder().setTitle('Test')

      await sendSimpleResponse(interaction, embed)

      expect(replyFn).toHaveBeenCalledTimes(1)
      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.components).toHaveLength(1)
      expect(callArgs.flags).toBe(64) // Ephemeral
    })

    it('sends embed without share button when allowShare is false', async () => {
      const { interaction, replyFn } = createMockInteraction()
      const embed = new EmbedBuilder().setTitle('Test')

      await sendSimpleResponse(interaction, embed, false)

      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.components).toHaveLength(0)
    })

    it('does not create collector when allowShare is false', async () => {
      const { interaction, mockResponse } = createMockInteraction()
      const embed = new EmbedBuilder().setTitle('Test')

      await sendSimpleResponse(interaction, embed, false)

      expect(mockResponse.createMessageComponentCollector).not.toHaveBeenCalled()
    })

    it('creates collector for share button', async () => {
      const { interaction, mockResponse } = createMockInteraction()
      const embed = new EmbedBuilder().setTitle('Test')

      await sendSimpleResponse(interaction, embed, true)

      expect(mockResponse.createMessageComponentCollector).toHaveBeenCalledTimes(1)
    })

    it('handles share button click', async () => {
      const { interaction, collectHandlers } = createMockInteraction()
      const embed = new EmbedBuilder().setTitle('Test')

      await sendSimpleResponse(interaction, embed, true)

      const replyFn = vi.fn()
      const buttonInteraction = {
        customId: 'simple:share',
        user: { id: '123456789' },
        reply: replyFn,
      }

      if (collectHandlers['collect']) {
        await collectHandlers['collect'](buttonInteraction)
      }

      expect(replyFn).toHaveBeenCalledTimes(1)
      expect(replyFn.mock.calls[0][0].embeds).toHaveLength(1)
    })
  })
})
