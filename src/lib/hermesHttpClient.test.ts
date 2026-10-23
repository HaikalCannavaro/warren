import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHermesModels, fetchHermesSkills, fetchHermesToolsets, postHermesStop, queryHermesStatus } from './hermesHttpClient';
import * as native from './native';

vi.mock('./native', () => ({
  hermesHttp: vi.fn(),
  nativeAvailable: () => true,
}));

describe('hermesHttpClient', () => {
  const url = 'https://hermes.example/v1';
  const token = 'test-token';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('queryHermesStatus', () => {
    it('returns healthy status with latency and models count when endpoints respond', async () => {
      vi.mocked(native.hermesHttp)
        .mockResolvedValueOnce(JSON.stringify({ status: 'ok', features: ['Custom Tools'] }))
        .mockResolvedValueOnce(JSON.stringify({ data: [{ id: 'hermes-3' }, { id: 'qwen-2.5' }] }));

      const res = await queryHermesStatus(url, token);
      expect(res.healthy).toBe(true);
      expect(res.latencyMs).toBeGreaterThanOrEqual(1);
      expect(res.modelsCount).toBe(2);
      expect(res.features).toContain('Custom Tools');
      expect(res.features).toContain('OpenAI REST API');
      expect(native.hermesHttp).toHaveBeenCalledWith(url, token, 'health', 'GET');
    });

    it('falls back to models probe when health endpoint is not available', async () => {
      vi.mocked(native.hermesHttp)
        .mockRejectedValueOnce(new Error('HTTP 404'))
        .mockResolvedValueOnce(JSON.stringify({ data: [{ id: 'hermes-3' }] }));

      const res = await queryHermesStatus(url, token);
      expect(res.healthy).toBe(true);
      expect(res.modelsCount).toBe(1);
      expect(res.features).toContain('Models API');
    });

    it('throws when server is completely offline / unreachable', async () => {
      vi.mocked(native.hermesHttp).mockRejectedValue(new Error('Connection refused'));
      await expect(queryHermesStatus(url, token)).rejects.toThrow('Connection refused');
    });
  });

  describe('fetchHermesModels', () => {
    it('parses standard OpenAI format with data array', async () => {
      vi.mocked(native.hermesHttp).mockResolvedValueOnce(JSON.stringify({
        data: [
          { id: 'hermes-3-llama-3.1-8b', name: 'Hermes 3 8B' },
          { id: 'qwen-2.5-coder-32b' },
        ],
      }));

      const models = await fetchHermesModels(url, token);
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('hermes-3-llama-3.1-8b');
      expect(models[0].name).toBe('Hermes 3 8B');
      expect(models[1].id).toBe('qwen-2.5-coder-32b');
    });

    it('handles empty models list or malformed json safely', async () => {
      vi.mocked(native.hermesHttp).mockResolvedValueOnce('invalid json');
      const models = await fetchHermesModels(url, token);
      expect(models).toEqual([]);
    });
  });

  describe('fetchHermesSkills', () => {
    it('parses skills list with description and category', async () => {
      vi.mocked(native.hermesHttp).mockResolvedValueOnce(JSON.stringify({
        data: [
          { name: 'frontend-craftsmanship', description: 'Polished responsive UI', category: 'custom' },
          { name: 'github', description: 'GitHub operations' },
        ],
      }));

      const skills = await fetchHermesSkills(url, token);
      expect(skills).toHaveLength(2);
      expect(skills[0].name).toBe('frontend-craftsmanship');
      expect(skills[0].category).toBe('custom');
      expect(skills[1].name).toBe('github');
    });
  });

  describe('fetchHermesToolsets', () => {
    it('parses toolsets list and tool arrays', async () => {
      vi.mocked(native.hermesHttp).mockResolvedValueOnce(JSON.stringify({
        toolsets: [
          { name: 'terminal', description: 'Terminal tools', tools: ['exec', 'read'] },
        ],
      }));

      const toolsets = await fetchHermesToolsets(url, token);
      expect(toolsets).toHaveLength(1);
      expect(toolsets[0].name).toBe('terminal');
      expect(toolsets[0].tools).toEqual(['exec', 'read']);
    });
  });

  describe('postHermesStop', () => {
    it('posts to the run stop endpoint', async () => {
      vi.mocked(native.hermesHttp).mockResolvedValueOnce('{}');
      await postHermesStop(url, token, 'run-123');
      expect(native.hermesHttp).toHaveBeenCalledWith(url, token, 'runs/run-123/stop', 'POST', '{}');
    });
  });
});
