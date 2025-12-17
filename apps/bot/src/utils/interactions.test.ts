import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  awaitModal,
  awaitComponent,
  awaitSelectMenu,
  awaitButton,
  MODAL_TIMEOUT,
  COMPONENT_TIMEOUT,
} from './interactions.js'
import type {
  ChatInputCommandInteraction,
  Message,
  ModalSubmitInteraction,
  MessageComponentInteraction,
  StringSelectMenuInteraction,
  ButtonInteraction,
} from 'discord.js'

describe('interactions', () => {
  describe('constants', () => {
    it('should export MODAL_TIMEOUT as 5 minutes', () => {
      expect(MODAL_TIMEOUT).toBe(5 * 60 * 1000)
    })

    it('should export COMPONENT_TIMEOUT as 1 minute', () => {
      expect(COMPONENT_TIMEOUT).toBe(60 * 1000)
    })
  })

  describe('awaitModal', () => {
    let mockInteraction: ChatInputCommandInteraction

    beforeEach(() => {
      mockInteraction = {
        user: { id: 'user-123' },
        awaitModalSubmit: vi.fn(),
      } as unknown as ChatInputCommandInteraction
    })

    it('should return modal submission when successful', async () => {
      const mockModalSubmit = { customId: 'modal-123' } as ModalSubmitInteraction
      vi.mocked(mockInteraction.awaitModalSubmit).mockResolvedValue(mockModalSubmit)

      const result = await awaitModal(mockInteraction, 'modal-123')

      expect(result).toBe(mockModalSubmit)
      expect(mockInteraction.awaitModalSubmit).toHaveBeenCalledWith({
        time: MODAL_TIMEOUT,
        filter: expect.any(Function),
      })
    })

    it('should return null when modal times out', async () => {
      vi.mocked(mockInteraction.awaitModalSubmit).mockRejectedValue(new Error('Timeout'))

      const result = await awaitModal(mockInteraction, 'modal-123')

      expect(result).toBeNull()
    })

    it('should use custom timeout when provided', async () => {
      vi.mocked(mockInteraction.awaitModalSubmit).mockResolvedValue({} as ModalSubmitInteraction)

      await awaitModal(mockInteraction, 'modal-123', 30000)

      expect(mockInteraction.awaitModalSubmit).toHaveBeenCalledWith({
        time: 30000,
        filter: expect.any(Function),
      })
    })

    it('should filter by modal customId and user id', async () => {
      let capturedFilter: (i: ModalSubmitInteraction) => boolean = () => false
      vi.mocked(mockInteraction.awaitModalSubmit).mockImplementation(async (options) => {
        capturedFilter = (options as { filter: typeof capturedFilter }).filter
        return {} as ModalSubmitInteraction
      })

      await awaitModal(mockInteraction, 'target-modal')

      // Test filter function
      expect(
        capturedFilter({ customId: 'target-modal', user: { id: 'user-123' } } as ModalSubmitInteraction)
      ).toBe(true)
      expect(
        capturedFilter({ customId: 'wrong-modal', user: { id: 'user-123' } } as ModalSubmitInteraction)
      ).toBe(false)
      expect(
        capturedFilter({ customId: 'target-modal', user: { id: 'wrong-user' } } as ModalSubmitInteraction)
      ).toBe(false)
    })
  })

  describe('awaitComponent', () => {
    let mockMessage: Message

    beforeEach(() => {
      mockMessage = {
        awaitMessageComponent: vi.fn(),
      } as unknown as Message
    })

    it('should return component interaction when successful', async () => {
      const mockComponent = { customId: 'button-123' } as MessageComponentInteraction
      vi.mocked(mockMessage.awaitMessageComponent).mockResolvedValue(mockComponent)

      const result = await awaitComponent(mockMessage, 'button-123', 'user-456')

      expect(result).toBe(mockComponent)
      expect(mockMessage.awaitMessageComponent).toHaveBeenCalledWith({
        filter: expect.any(Function),
        time: COMPONENT_TIMEOUT,
      })
    })

    it('should return null when component times out', async () => {
      vi.mocked(mockMessage.awaitMessageComponent).mockRejectedValue(new Error('Timeout'))

      const result = await awaitComponent(mockMessage, 'button-123', 'user-456')

      expect(result).toBeNull()
    })

    it('should use custom timeout when provided', async () => {
      vi.mocked(mockMessage.awaitMessageComponent).mockResolvedValue({} as MessageComponentInteraction)

      await awaitComponent(mockMessage, 'button-123', 'user-456', 5000)

      expect(mockMessage.awaitMessageComponent).toHaveBeenCalledWith({
        filter: expect.any(Function),
        time: 5000,
      })
    })

    it('should filter by customId and userId', async () => {
      let capturedFilter: (i: MessageComponentInteraction) => boolean = () => false
      vi.mocked(mockMessage.awaitMessageComponent).mockImplementation(async (options) => {
        capturedFilter = (options as { filter: typeof capturedFilter }).filter
        return {} as MessageComponentInteraction
      })

      await awaitComponent(mockMessage, 'target-button', 'user-789')

      expect(
        capturedFilter({ customId: 'target-button', user: { id: 'user-789' } } as MessageComponentInteraction)
      ).toBe(true)
      expect(
        capturedFilter({ customId: 'wrong-button', user: { id: 'user-789' } } as MessageComponentInteraction)
      ).toBe(false)
      expect(
        capturedFilter({ customId: 'target-button', user: { id: 'wrong-user' } } as MessageComponentInteraction)
      ).toBe(false)
    })
  })

  describe('awaitSelectMenu', () => {
    let mockMessage: Message

    beforeEach(() => {
      mockMessage = {
        awaitMessageComponent: vi.fn(),
      } as unknown as Message
    })

    it('should return select menu interaction when successful', async () => {
      const mockSelectMenu = {
        customId: 'select-123',
        isStringSelectMenu: vi.fn().mockReturnValue(true),
      } as unknown as StringSelectMenuInteraction
      vi.mocked(mockMessage.awaitMessageComponent).mockResolvedValue(
        mockSelectMenu as unknown as MessageComponentInteraction
      )

      const result = await awaitSelectMenu(mockMessage, 'select-123', 'user-456')

      expect(result).toBe(mockSelectMenu)
    })

    it('should return null when interaction is not a select menu', async () => {
      const mockButton = {
        customId: 'button-123',
        isStringSelectMenu: vi.fn().mockReturnValue(false),
      } as unknown as MessageComponentInteraction
      vi.mocked(mockMessage.awaitMessageComponent).mockResolvedValue(mockButton)

      const result = await awaitSelectMenu(mockMessage, 'select-123', 'user-456')

      expect(result).toBeNull()
    })

    it('should return null when component times out', async () => {
      vi.mocked(mockMessage.awaitMessageComponent).mockRejectedValue(new Error('Timeout'))

      const result = await awaitSelectMenu(mockMessage, 'select-123', 'user-456')

      expect(result).toBeNull()
    })

    it('should use custom timeout', async () => {
      const mockSelectMenu = {
        isStringSelectMenu: vi.fn().mockReturnValue(true),
      } as unknown as StringSelectMenuInteraction
      vi.mocked(mockMessage.awaitMessageComponent).mockResolvedValue(
        mockSelectMenu as unknown as MessageComponentInteraction
      )

      await awaitSelectMenu(mockMessage, 'select-123', 'user-456', 10000)

      expect(mockMessage.awaitMessageComponent).toHaveBeenCalledWith({
        filter: expect.any(Function),
        time: 10000,
      })
    })
  })

  describe('awaitButton', () => {
    let mockMessage: Message

    beforeEach(() => {
      mockMessage = {
        awaitMessageComponent: vi.fn(),
      } as unknown as Message
    })

    it('should return button interaction when successful', async () => {
      const mockButton = {
        customId: 'button-123',
        isButton: vi.fn().mockReturnValue(true),
      } as unknown as ButtonInteraction
      vi.mocked(mockMessage.awaitMessageComponent).mockResolvedValue(
        mockButton as unknown as MessageComponentInteraction
      )

      const result = await awaitButton(mockMessage, 'button-123', 'user-456')

      expect(result).toBe(mockButton)
    })

    it('should return null when interaction is not a button', async () => {
      const mockSelectMenu = {
        customId: 'select-123',
        isButton: vi.fn().mockReturnValue(false),
      } as unknown as MessageComponentInteraction
      vi.mocked(mockMessage.awaitMessageComponent).mockResolvedValue(mockSelectMenu)

      const result = await awaitButton(mockMessage, 'button-123', 'user-456')

      expect(result).toBeNull()
    })

    it('should return null when component times out', async () => {
      vi.mocked(mockMessage.awaitMessageComponent).mockRejectedValue(new Error('Timeout'))

      const result = await awaitButton(mockMessage, 'button-123', 'user-456')

      expect(result).toBeNull()
    })

    it('should use custom timeout', async () => {
      const mockButton = {
        isButton: vi.fn().mockReturnValue(true),
      } as unknown as ButtonInteraction
      vi.mocked(mockMessage.awaitMessageComponent).mockResolvedValue(
        mockButton as unknown as MessageComponentInteraction
      )

      await awaitButton(mockMessage, 'button-123', 'user-456', 15000)

      expect(mockMessage.awaitMessageComponent).toHaveBeenCalledWith({
        filter: expect.any(Function),
        time: 15000,
      })
    })
  })
})
