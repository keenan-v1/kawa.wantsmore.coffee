import { describe, it, expect, vi } from 'vitest'
import { ButtonStyle } from 'discord.js'
import { createSelectMenu, createButton, createButtonRow } from './components.js'

// Mock discord.js builders
vi.mock('discord.js', () => {
  class MockBuilder {
    _data: Record<string, unknown> = {}

    setCustomId(value: string) {
      this._data.customId = value
      return this
    }
    setPlaceholder(value: string) {
      this._data.placeholder = value
      return this
    }
    setMinValues(value: number) {
      this._data.minValues = value
      return this
    }
    setMaxValues(value: number) {
      this._data.maxValues = value
      return this
    }
    setDisabled(value: boolean) {
      this._data.disabled = value
      return this
    }
    addOptions(options: unknown[]) {
      this._data.options = options
      return this
    }
    setLabel(value: string) {
      this._data.label = value
      return this
    }
    setStyle(value: number) {
      this._data.style = value
      return this
    }
    setEmoji(value: string) {
      this._data.emoji = value
      return this
    }
    addComponents(...components: unknown[]) {
      this._data.components = [...(this._data.components as unknown[] || []), ...components]
      return this
    }

    getData() {
      return this._data
    }
  }

  class StringSelectMenuBuilder extends MockBuilder {}
  class ActionRowBuilder extends MockBuilder {}
  class ButtonBuilder extends MockBuilder {}

  return {
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle: {
      Primary: 1,
      Secondary: 2,
      Success: 3,
      Danger: 4,
      Link: 5,
    },
  }
})

describe('components', () => {
  describe('createSelectMenu', () => {
    it('should create a select menu with required options', () => {
      const row = createSelectMenu({
        customId: 'test-select',
        placeholder: 'Select an option',
        options: [
          { label: 'Option 1', value: 'opt1' },
          { label: 'Option 2', value: 'opt2' },
        ],
      })

      expect(row).toBeDefined()
      const data = (row as unknown as { getData(): { components: unknown[] } }).getData()
      expect(data.components).toHaveLength(1)
    })

    it('should use default minValues and maxValues', () => {
      const row = createSelectMenu({
        customId: 'test-select',
        placeholder: 'Select',
        options: [{ label: 'Option', value: 'opt' }],
      })

      const selectMenu = (row as unknown as { getData(): { components: { _data: { minValues: number; maxValues: number } }[] } }).getData().components[0]
      expect(selectMenu._data.minValues).toBe(1)
      expect(selectMenu._data.maxValues).toBe(1)
    })

    it('should set custom minValues and maxValues', () => {
      const row = createSelectMenu({
        customId: 'test-select',
        placeholder: 'Select multiple',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
          { label: 'C', value: 'c' },
        ],
        minValues: 1,
        maxValues: 3,
      })

      const selectMenu = (row as unknown as { getData(): { components: { _data: { minValues: number; maxValues: number } }[] } }).getData().components[0]
      expect(selectMenu._data.minValues).toBe(1)
      expect(selectMenu._data.maxValues).toBe(3)
    })

    it('should set disabled when specified', () => {
      const row = createSelectMenu({
        customId: 'test-select',
        placeholder: 'Disabled',
        options: [{ label: 'Option', value: 'opt' }],
        disabled: true,
      })

      const selectMenu = (row as unknown as { getData(): { components: { _data: { disabled: boolean } }[] } }).getData().components[0]
      expect(selectMenu._data.disabled).toBe(true)
    })

    it('should handle options with all properties', () => {
      const row = createSelectMenu({
        customId: 'full-select',
        placeholder: 'Full options',
        options: [
          {
            label: 'Full Option',
            value: 'full',
            description: 'This is a description',
            emoji: '🎉',
            default: true,
          },
        ],
      })

      const selectMenu = (row as unknown as { getData(): { components: { _data: { options: { description: string; emoji: string; default: boolean }[] } }[] } }).getData().components[0]
      expect(selectMenu._data.options[0].description).toBe('This is a description')
      expect(selectMenu._data.options[0].emoji).toBe('🎉')
      expect(selectMenu._data.options[0].default).toBe(true)
    })
  })

  describe('createButton', () => {
    it('should create a button with required options', () => {
      const button = createButton({
        customId: 'test-button',
        label: 'Click me',
      })

      expect(button).toBeDefined()
      const data = (button as unknown as { getData(): { customId: string; label: string; style: number } }).getData()
      expect(data.customId).toBe('test-button')
      expect(data.label).toBe('Click me')
    })

    it('should use Primary style by default', () => {
      const button = createButton({
        customId: 'test-button',
        label: 'Primary',
      })

      const data = (button as unknown as { getData(): { style: number } }).getData()
      expect(data.style).toBe(ButtonStyle.Primary)
    })

    it('should use custom style', () => {
      const button = createButton({
        customId: 'danger-button',
        label: 'Danger',
        style: ButtonStyle.Danger,
      })

      const data = (button as unknown as { getData(): { style: number } }).getData()
      expect(data.style).toBe(ButtonStyle.Danger)
    })

    it('should set emoji when provided', () => {
      const button = createButton({
        customId: 'emoji-button',
        label: 'With Emoji',
        emoji: '✅',
      })

      const data = (button as unknown as { getData(): { emoji: string } }).getData()
      expect(data.emoji).toBe('✅')
    })

    it('should set disabled when specified', () => {
      const button = createButton({
        customId: 'disabled-button',
        label: 'Disabled',
        disabled: true,
      })

      const data = (button as unknown as { getData(): { disabled: boolean } }).getData()
      expect(data.disabled).toBe(true)
    })

    it('should handle all options together', () => {
      const button = createButton({
        customId: 'full-button',
        label: 'Full Button',
        style: ButtonStyle.Success,
        emoji: '🚀',
        disabled: false,
      })

      const data = (button as unknown as { getData(): Record<string, unknown> }).getData()
      expect(data.customId).toBe('full-button')
      expect(data.label).toBe('Full Button')
      expect(data.style).toBe(ButtonStyle.Success)
      expect(data.emoji).toBe('🚀')
    })
  })

  describe('createButtonRow', () => {
    it('should create a row with a single button', () => {
      const row = createButtonRow([
        { customId: 'btn1', label: 'Button 1' },
      ])

      expect(row).toBeDefined()
      const data = (row as unknown as { getData(): { components: unknown[] } }).getData()
      expect(data.components).toHaveLength(1)
    })

    it('should create a row with multiple buttons', () => {
      const row = createButtonRow([
        { customId: 'btn1', label: 'Button 1' },
        { customId: 'btn2', label: 'Button 2' },
        { customId: 'btn3', label: 'Button 3' },
      ])

      const data = (row as unknown as { getData(): { components: unknown[] } }).getData()
      expect(data.components).toHaveLength(3)
    })

    it('should create buttons with different styles', () => {
      const row = createButtonRow([
        { customId: 'primary', label: 'Primary', style: ButtonStyle.Primary },
        { customId: 'secondary', label: 'Secondary', style: ButtonStyle.Secondary },
        { customId: 'success', label: 'Success', style: ButtonStyle.Success },
        { customId: 'danger', label: 'Danger', style: ButtonStyle.Danger },
      ])

      const data = (row as unknown as { getData(): { components: unknown[] } }).getData()
      expect(data.components).toHaveLength(4)
    })

    it('should handle empty buttons array', () => {
      const row = createButtonRow([])

      const data = (row as unknown as { getData(): { components: unknown[] } }).getData()
      expect(data.components || []).toHaveLength(0)
    })
  })
})
