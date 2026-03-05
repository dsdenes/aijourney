import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

describe('WorkersController', () => {
  let controller: WorkersController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      getDefinitions: vi.fn(),
      getDefinition: vi.fn(),
      getAllQueueStats: vi.fn(),
      getQueueStats: vi.fn(),
      getJobs: vi.fn(),
      getJobLogs: vi.fn(),
      addJob: vi.fn(),
      pauseQueue: vi.fn(),
      resumeQueue: vi.fn(),
      cleanQueue: vi.fn(),
      retryFailedJobs: vi.fn(),
      getKbBuilderStatus: vi.fn(),
      getKbBuilderProgress: vi.fn(),
      getKbBuilderArticles: vi.fn(),
      getKbBuilderSources: vi.fn(),
      addKbBuilderSource: vi.fn(),
      updateKbBuilderSource: vi.fn(),
      deleteKbBuilderSource: vi.fn(),
      proxyKbBuilderSSE: vi.fn(),
      getKbBuilderLogs: vi.fn(),
      clearKbBuilderLogs: vi.fn(),
      triggerKbBuilderPipeline: vi.fn(),
      getKbBuilderPipelineProgress: vi.fn(),
      getKbBuilderSummaries: vi.fn(),
      triggerKbBuilder: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkersController],
      providers: [{ provide: WorkersService, useValue: service }],
    })
      .overrideGuard('jwt')
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkersController>(WorkersController);
  });

  describe('listWorkers', () => {
    it('should return worker definitions with stats', async () => {
      service.getDefinitions.mockReturnValue([{ name: 'Summarization', slug: 'summarization' }]);
      service.getAllQueueStats.mockResolvedValue([
        { slug: 'summarization', waiting: 0, active: 1 },
      ]);

      const result = await controller.listWorkers();

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        name: 'Summarization',
        slug: 'summarization',
        stats: { slug: 'summarization', waiting: 0, active: 1 },
      });
    });

    it('should return null stats for workers without queue stats', async () => {
      service.getDefinitions.mockReturnValue([{ name: 'KB Builder', slug: 'kb-builder' }]);
      service.getAllQueueStats.mockResolvedValue([]);

      const result = await controller.listWorkers();

      expect(result.data[0].stats).toBeNull();
    });
  });

  describe('getAllStats', () => {
    it('should return queue statistics', async () => {
      service.getAllQueueStats.mockResolvedValue([
        { slug: 'summarization', waiting: 2, active: 0 },
      ]);

      const result = await controller.getAllStats();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getWorker', () => {
    it('should return worker definition for BullMQ worker', async () => {
      service.getDefinition.mockReturnValue({
        name: 'Summarization',
        slug: 'summarization',
      });
      service.getQueueStats.mockResolvedValue({ waiting: 0 });

      const result = await controller.getWorker('summarization');

      expect(result.data).toMatchObject({
        name: 'Summarization',
        stats: { waiting: 0 },
      });
    });

    it('should return KB Builder status for kb-builder slug', async () => {
      service.getDefinition.mockReturnValue({
        name: 'KB Builder',
        slug: 'kb-builder',
      });
      service.getKbBuilderStatus.mockResolvedValue({
        status: 'ok',
        totalArticles: 82,
      });

      const result = await controller.getWorker('kb-builder');

      expect(result.data).toMatchObject({
        name: 'KB Builder',
        kbBuilderStatus: { status: 'ok', totalArticles: 82 },
        stats: null,
      });
    });

    it('should return error for unknown worker slug', async () => {
      service.getDefinition.mockReturnValue(undefined);

      const result = await controller.getWorker('unknown');

      expect(result).toEqual({
        error: { code: 'NOT_FOUND', message: 'Worker unknown not found' },
      });
    });
  });

  describe('getJobs', () => {
    it('should return jobs for a queue', async () => {
      service.getJobs.mockResolvedValue([{ id: '1', name: 'job', status: 'completed' }]);

      const result = await controller.getJobs('summarization', 'completed');

      expect(result.data).toHaveLength(1);
      expect(service.getJobs).toHaveBeenCalledWith('summarization', 'completed', 0, 49);
    });

    it('should parse start/end query params', async () => {
      service.getJobs.mockResolvedValue([]);

      await controller.getJobs('summarization', 'waiting', '10', '20');

      expect(service.getJobs).toHaveBeenCalledWith('summarization', 'waiting', 10, 20);
    });
  });

  describe('triggerJob', () => {
    it('should trigger kb-builder via HTTP proxy', async () => {
      service.triggerKbBuilder.mockResolvedValue({ status: 'ok' });

      const result = await controller.triggerJob('kb-builder', {});

      expect(result.data).toEqual({ status: 'ok' });
      expect(service.triggerKbBuilder).toHaveBeenCalled();
    });

    it('should add BullMQ job for regular workers', async () => {
      service.addJob.mockResolvedValue({ jobId: 'j-1' });

      const result = await controller.triggerJob('summarization', {
        articleId: 'a1',
      });

      expect(result.data).toEqual({ jobId: 'j-1' });
      expect(service.addJob).toHaveBeenCalledWith('summarization', {
        articleId: 'a1',
      });
    });

    it('should return error if queue not found', async () => {
      service.addJob.mockResolvedValue(null);

      const result = await controller.triggerJob('nonexistent', {});

      expect(result).toEqual({
        error: { code: 'NOT_FOUND', message: 'Queue nonexistent not found' },
      });
    });
  });

  describe('pauseQueue / resumeQueue', () => {
    it('should pause a queue', async () => {
      service.pauseQueue.mockResolvedValue(true);

      const result = await controller.pauseQueue('summarization');
      expect(result.data).toEqual({ paused: true });
    });

    it('should resume a queue', async () => {
      service.resumeQueue.mockResolvedValue(true);

      const result = await controller.resumeQueue('summarization');
      expect(result.data).toEqual({ resumed: true });
    });
  });

  describe('cleanQueue', () => {
    it('should clean completed jobs', async () => {
      service.cleanQueue.mockResolvedValue(5);

      const result = await controller.cleanQueue('summarization', 'completed');
      expect(result.data).toEqual({ removed: 5 });
    });
  });

  describe('retryFailed', () => {
    it('should retry failed jobs', async () => {
      service.retryFailedJobs.mockResolvedValue(3);

      const result = await controller.retryFailed('summarization');
      expect(result.data).toEqual({ retried: 3 });
    });
  });

  describe('KB Builder proxy endpoints', () => {
    it('should proxy progress', async () => {
      service.getKbBuilderProgress.mockResolvedValue({ status: 'idle' });
      const result = await controller.kbBuilderProgress();
      expect(result).toEqual({ status: 'idle' });
    });

    it('should proxy articles', async () => {
      service.getKbBuilderArticles.mockResolvedValue({ data: [] });
      const result = await controller.kbBuilderArticles();
      expect(result).toEqual({ data: [] });
    });

    it('should proxy sources GET', async () => {
      service.getKbBuilderSources.mockResolvedValue({ data: [{ id: 's1' }] });
      const result = await controller.kbBuilderSources();
      expect(result).toEqual({ data: [{ id: 's1' }] });
    });

    it('should proxy source creation', async () => {
      service.addKbBuilderSource.mockResolvedValue({ data: { id: 'new' } });
      const result = await controller.addKbBuilderSource({ url: 'https://test.com' });
      expect(result).toEqual({ data: { id: 'new' } });
    });

    it('should proxy source update', async () => {
      service.updateKbBuilderSource.mockResolvedValue({ data: { id: 's1' } });
      const result = await controller.updateKbBuilderSource('s1', { enabled: false });
      expect(result).toEqual({ data: { id: 's1' } });
    });

    it('should proxy source deletion', async () => {
      service.deleteKbBuilderSource.mockResolvedValue({ data: { deleted: true } });
      const result = await controller.deleteKbBuilderSource('s1');
      expect(result).toEqual({ data: { deleted: true } });
    });

    it('should proxy logs', async () => {
      service.getKbBuilderLogs.mockResolvedValue({ data: [] });
      const result = await controller.kbBuilderLogs();
      expect(result).toEqual({ data: [] });
    });

    it('should proxy log clearing', async () => {
      service.clearKbBuilderLogs.mockResolvedValue({ data: { cleared: true } });
      const result = await controller.clearKbBuilderLogs();
      expect(result).toEqual({ data: { cleared: true } });
    });

    it('should proxy pipeline trigger', async () => {
      service.triggerKbBuilderPipeline.mockResolvedValue({ status: 'started' });
      const result = await controller.triggerKbPipeline();
      expect(result).toEqual({ status: 'started' });
    });

    it('should proxy pipeline progress', async () => {
      service.getKbBuilderPipelineProgress.mockResolvedValue({ status: 'running' });
      const result = await controller.kbBuilderPipelineProgress();
      expect(result).toEqual({ status: 'running' });
    });

    it('should proxy summaries', async () => {
      service.getKbBuilderSummaries.mockResolvedValue({ data: [{ id: 'sm1' }] });
      const result = await controller.kbBuilderSummaries();
      expect(result).toEqual({ data: [{ id: 'sm1' }] });
    });

    it('should proxy full status', async () => {
      service.getKbBuilderStatus.mockResolvedValue({ status: 'ok' });
      const result = await controller.kbBuilderFullStatus();
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
