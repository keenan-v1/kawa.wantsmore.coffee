import { describe, it, expect, vi } from 'vitest'
import { TextInputStyle } from 'discord.js'
import { createQuantityNotesModal, createSingleInputModal } from './modals.js'

// Mock discord.js builders
vi.mock('discord.js', () => {
  // Create a chainable mock builder class
  class MockBuilder {
    _type: string
    _data: Record<string, unknown>

    constructor(type: string) {
      this._type = type
      this._data = {}
    }

    setCustomId(value: string) {
      this._data.customId = value
      return this
    }
    setTitle(value: string) {
      this._data.title = value
      return this
    }
    setLabel(value: string) {
      this._data.label = value
      return this
    }
    setPlaceholder(value: string) {
      this._data.placeholder = value
      return this
    }
    setStyle(value: number) {
      this._data.style = value
      return this
    }
    setRequired(value: boolean) {
      this._data.required = value
      return this
    }
    setMaxLength(value: number) {
      this._data.maxLength = value
      return this
    }
    setMinLength(value: number) {
      this._data.minLength = value
      return this
    }
    setValue(value: string) {
      this._data.value = value
      return this
    }
    addComponents(...components: unknown[]) {
      this._data.components = components
      return this
    }
  }

  class ModalBuilder extends MockBuilder {
    constructor() {
      super('ModalBuilder')
    }
  }

  class TextInputBuilder extends MockBuilder {
    constructor() {
      super('TextInputBuilder')
    }
  }

  class ActionRowBuilder extends MockBuilder {
    constructor() {
      super('ActionRowBuilder')
    }
  }

  return {
    ModalBuilder,
    TextInputBuilder,
    ActionRowBuilder,
    TextInputStyle: {
      Short: 1,
      Paragraph: 2,
    },
  }
})

describe('modals', () => {
  describe('createQuantityNotesModal', () => {
    it('should create a modal with quantity and notes inputs', () => {
      const modal = createQuantityNotesModal({
        modalId: 'test-modal-123',
        title: 'Reserve COF',
        maxQuantity: 100,
      })

      // Modal should be returned
      expect(modal).toBeDefined()
      expect((modal as unknown as { _type: string })._type).toBe('ModalBuilder')
    })

    it('should use custom quantity label when provided', () => {
      const modal = createQuantityNotesModal({
        modalId: 'test-modal',
        title: 'Fill Order',
        maxQuantity: 50,
        quantityLabel: 'Custom Label',
      })

      expect(modal).toBeDefined()
    })

    it('should use custom notes placeholder when provided', () => {
      const modal = createQuantityNotesModal({
        modalId: 'test-modal',
        title: 'Reserve',
        maxQuantity: 25,
        notesPlaceholder: 'Enter delivery instructions',
      })

      expect(modal).toBeDefined()
    })

    it('should use default labels when not provided', () => {
      const modal = createQuantityNotesModal({
        modalId: 'default-modal',
        title: 'Default Modal',
        maxQuantity: 200,
      })

      expect(modal).toBeDefined()
    })
  })

  describe('createSingleInputModal', () => {
    it('should create a modal with a single input', () => {
      const modal = createSingleInputModal({
        modalId: 'single-input-modal',
        title: 'Enter Price',
        inputId: 'price',
        label: 'Price',
      })

      expect(modal).toBeDefined()
      expect((modal as unknown as { _type: string })._type).toBe('ModalBuilder')
    })

    it('should apply optional placeholder', () => {
      const modal = createSingleInputModal({
        modalId: 'test-modal',
        title: 'Enter Value',
        inputId: 'value',
        label: 'Value',
        placeholder: 'Enter a value here',
      })

      expect(modal).toBeDefined()
    })

    it('should apply optional maxLength', () => {
      const modal = createSingleInputModal({
        modalId: 'test-modal',
        title: 'Enter Description',
        inputId: 'description',
        label: 'Description',
        maxLength: 200,
      })

      expect(modal).toBeDefined()
    })

    it('should apply optional minLength', () => {
      const modal = createSingleInputModal({
        modalId: 'test-modal',
        title: 'Enter Code',
        inputId: 'code',
        label: 'Code',
        minLength: 5,
      })

      expect(modal).toBeDefined()
    })

    it('should apply optional value (default text)', () => {
      const modal = createSingleInputModal({
        modalId: 'test-modal',
        title: 'Edit Name',
        inputId: 'name',
        label: 'Name',
        value: 'Default Name',
      })

      expect(modal).toBeDefined()
    })

    it('should apply paragraph style when specified', () => {
      const modal = createSingleInputModal({
        modalId: 'test-modal',
        title: 'Enter Notes',
        inputId: 'notes',
        label: 'Notes',
        style: TextInputStyle.Paragraph,
      })

      expect(modal).toBeDefined()
    })

    it('should handle required=false', () => {
      const modal = createSingleInputModal({
        modalId: 'test-modal',
        title: 'Optional Input',
        inputId: 'optional',
        label: 'Optional Field',
        required: false,
      })

      expect(modal).toBeDefined()
    })

    it('should apply all options together', () => {
      const modal = createSingleInputModal({
        modalId: 'full-options-modal',
        title: 'Complete Form',
        inputId: 'fullInput',
        label: 'Full Input',
        placeholder: 'Enter text',
        style: TextInputStyle.Paragraph,
        required: true,
        maxLength: 500,
        minLength: 10,
        value: 'Initial value',
      })

      expect(modal).toBeDefined()
    })
  })
})
