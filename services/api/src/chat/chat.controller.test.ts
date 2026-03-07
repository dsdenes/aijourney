import { Test, type TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GLOBAL_ROLES_KEY } from '../common/decorators/global-roles.decorator';
import { MemoryService } from '../memory/memory.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

const mockMemoryService = {
  enqueueExtraction: vi.fn().mockResolvedValue(undefined),
};

describe('ChatController', () => {
  let controller: ChatController;
  let service: { chat: ReturnType<typeof vi.fn> };
  const reflector = new Reflector();

  beforeEach(async () => {
    service = {
      chat: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: service },
        { provide: MemoryService, useValue: mockMemoryService },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  describe('POST /chat', () => {
    it('should require superadmin global role', () => {
      const roles = reflector.getAllAndOverride<string[]>(GLOBAL_ROLES_KEY, [
        ChatController.prototype.chat,
        ChatController,
      ]);

      expect(roles).toEqual(['superadmin']);
    });

    it('should return chat response wrapped in data envelope', async () => {
      service.chat.mockResolvedValue({
        answer: 'AI helps with productivity.',
        sources: [
          {
            title: 'Article 1',
            url: 'https://example.com',
            relevance: 'tools',
          },
        ],
        tokensUsed: 200,
        model: 'gemini-3.1-flash-lite-preview',
      });

      const result = await controller.chat({
        query: 'Tell me about AI',
        history: [],
      });

      expect(result).toEqual({
        data: {
          answer: 'AI helps with productivity.',
          sources: [
            {
              title: 'Article 1',
              url: 'https://example.com',
              relevance: 'tools',
            },
          ],
          tokensUsed: 200,
          model: 'gemini-3.1-flash-lite-preview',
        },
      });
      expect(service.chat).toHaveBeenCalledWith('Tell me about AI', [], undefined);
    });

    it('should return validation error for empty query', async () => {
      const result = await controller.chat({ query: '' });

      expect(result).toEqual({
        error: { code: 'VALIDATION', message: 'query is required' },
      });
      expect(service.chat).not.toHaveBeenCalled();
    });

    it('should return validation error for whitespace-only query', async () => {
      const result = await controller.chat({ query: '   ' });

      expect(result).toEqual({
        error: { code: 'VALIDATION', message: 'query is required' },
      });
    });

    it('should trim query before passing to service', async () => {
      service.chat.mockResolvedValue({
        answer: 'response',
        sources: [],
        tokensUsed: 50,
        model: 'gemini-3.1-flash-lite-preview',
      });

      await controller.chat({ query: '  hello  ' });

      expect(service.chat).toHaveBeenCalledWith('hello', [], undefined);
    });

    it('should pass conversation history to service', async () => {
      service.chat.mockResolvedValue({
        answer: 'follow-up',
        sources: [],
        tokensUsed: 100,
        model: 'gemini-3.1-flash-lite-preview',
      });

      const history = [
        { role: 'user' as const, content: 'hi' },
        { role: 'assistant' as const, content: 'hello!' },
      ];

      await controller.chat({ query: 'thanks', history });

      expect(service.chat).toHaveBeenCalledWith('thanks', history, undefined);
    });

    it('should catch service errors and return error envelope', async () => {
      service.chat.mockRejectedValue(new Error('OpenAI rate limit'));

      const result = await controller.chat({ query: 'test' });

      expect(result).toEqual({
        error: { code: 'CHAT_ERROR', message: 'OpenAI rate limit' },
      });
    });

    it('should handle non-Error throws gracefully', async () => {
      service.chat.mockRejectedValue('something broke');

      const result = await controller.chat({ query: 'test' });

      expect(result).toEqual({
        error: { code: 'CHAT_ERROR', message: 'Chat failed' },
      });
    });
  });
});
