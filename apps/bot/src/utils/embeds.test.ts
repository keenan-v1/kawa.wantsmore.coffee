import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed, COLORS } from './embeds.js'

// Mock discord.js EmbedBuilder
vi.mock('discord.js', () => {
  class MockEmbedBuilder {
    private data: Record<string, unknown> = {}

    setTitle(title: string) {
      this.data.title = title
      return this
    }

    setColor(color: number) {
      this.data.color = color
      return this
    }

    setDescription(description: string) {
      this.data.description = description
      return this
    }

    setTimestamp() {
      this.data.timestamp = true
      return this
    }

    setFooter(footer: { text: string }) {
      this.data.footer = footer
      return this
    }

    addFields(...fields: unknown[]) {
      this.data.fields = fields
      return this
    }

    getData() {
      return this.data
    }
  }

  return {
    EmbedBuilder: MockEmbedBuilder,
  }
})

describe('embeds', () => {
  describe('COLORS', () => {
    it('should export color constants', () => {
      expect(COLORS.SUCCESS).toBe(0x57f287)
      expect(COLORS.ERROR).toBe(0xed4245)
      expect(COLORS.WARNING).toBe(0xfee75c)
      expect(COLORS.INFO).toBe(0x5865f2)
      expect(COLORS.DEFAULT).toBe(0x9b59b6)
    })
  })

  describe('createSuccessEmbed', () => {
    it('should create a success embed with required fields', () => {
      const embed = createSuccessEmbed({
        title: 'Order Created',
        description: 'Your order has been placed.',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.title).toBe('Order Created')
      expect(data.description).toBe('Your order has been placed.')
      expect(data.color).toBe(COLORS.SUCCESS)
      expect(data.timestamp).toBe(true)
    })

    it('should add footer when provided', () => {
      const embed = createSuccessEmbed({
        title: 'Success',
        description: 'Done.',
        footer: 'Order #123',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.footer).toEqual({ text: 'Order #123' })
    })

    it('should add notes field when provided', () => {
      const embed = createSuccessEmbed({
        title: 'Reservation Created',
        description: 'Reserved 50x COF.',
        notes: 'Please deliver by Friday',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.fields).toEqual([{ name: 'Your Notes', value: 'Please deliver by Friday', inline: false }])
    })

    it('should add both footer and notes', () => {
      const embed = createSuccessEmbed({
        title: 'Complete',
        description: 'All done.',
        footer: 'ID: 456',
        notes: 'Important note',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.footer).toEqual({ text: 'ID: 456' })
      expect(data.fields).toBeDefined()
    })
  })

  describe('createErrorEmbed', () => {
    it('should create an error embed with required fields', () => {
      const embed = createErrorEmbed({
        title: 'Error',
        description: 'Something went wrong.',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.title).toBe('Error')
      expect(data.description).toBe('Something went wrong.')
      expect(data.color).toBe(COLORS.ERROR)
      expect(data.timestamp).toBe(true)
    })

    it('should add footer when provided', () => {
      const embed = createErrorEmbed({
        title: 'Failed',
        description: 'Operation failed.',
        footer: 'Error Code: 500',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.footer).toEqual({ text: 'Error Code: 500' })
    })

    it('should not add footer when not provided', () => {
      const embed = createErrorEmbed({
        title: 'Error',
        description: 'No footer.',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.footer).toBeUndefined()
    })
  })

  describe('createInfoEmbed', () => {
    it('should create an info embed with required fields', () => {
      const embed = createInfoEmbed({
        title: 'Information',
        description: 'Here is some info.',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.title).toBe('Information')
      expect(data.description).toBe('Here is some info.')
      expect(data.color).toBe(COLORS.INFO)
      expect(data.timestamp).toBe(true)
    })

    it('should add footer when provided', () => {
      const embed = createInfoEmbed({
        title: 'Status',
        description: 'Current status.',
        footer: 'Last updated',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.footer).toEqual({ text: 'Last updated' })
    })

    it('should add fields when provided', () => {
      const embed = createInfoEmbed({
        title: 'Order Details',
        description: 'Details below:',
        fields: [
          { name: 'Quantity', value: '100', inline: true },
          { name: 'Price', value: '$50.00', inline: true },
        ],
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.fields).toEqual([
        [
          { name: 'Quantity', value: '100', inline: true },
          { name: 'Price', value: '$50.00', inline: true },
        ],
      ])
    })

    it('should add both footer and fields', () => {
      const embed = createInfoEmbed({
        title: 'Complete Info',
        description: 'Full details.',
        footer: 'Footer text',
        fields: [{ name: 'Field', value: 'Value' }],
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.footer).toEqual({ text: 'Footer text' })
      expect(data.fields).toBeDefined()
    })

    it('should not add fields when not provided', () => {
      const embed = createInfoEmbed({
        title: 'Simple',
        description: 'No fields.',
      })

      const data = (embed as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.fields).toBeUndefined()
    })
  })
})
