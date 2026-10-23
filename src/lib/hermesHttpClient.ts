import * as native from './native';

export interface HermesStatusResult {
  healthy: boolean;
  latencyMs: number;
  modelsCount?: number;
  features: string[];
}

export interface HermesModelItem {
  id: string;
  name?: string;
  description?: string;
}

export interface HermesSkillItem {
  name: string;
  description?: string;
  category?: string;
}

export interface HermesToolsetItem {
  name: string;
  description?: string;
  tools?: string[];
}

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Query Hermes server status and measure connection latency (ms).
 * Queries /health or /v1/capabilities or /v1/models via native HTTP.
 */
export async function queryHermesStatus(url: string, token: string): Promise<HermesStatusResult> {
  const start = performance.now();
  let modelsCount: number | undefined;
  const features: string[] = ['OpenAI REST API', 'Chat Streaming'];

  // Try /health first; if it succeeds, also probe models count
  let healthy = false;
  try {
    const raw = await native.hermesHttp(url, token, 'health', 'GET');
    healthy = true;
    const parsed = parseJsonSafe<any>(raw, {});
    if (parsed.features && Array.isArray(parsed.features)) {
      features.push(...parsed.features);
    }
  } catch {
    // If /health is not explicitly mounted, try /v1/models as health probe
    try {
      const raw = await native.hermesHttp(url, token, 'models', 'GET');
      healthy = true;
      const parsed = parseJsonSafe<any>(raw, {});
      if (Array.isArray(parsed?.data)) {
        modelsCount = parsed.data.length;
        features.push('Models API');
      }
    } catch (err) {
      throw err;
    }
  }

  // If modelsCount wasn't populated yet, try a quick models query if healthy
  if (healthy && modelsCount === undefined) {
    try {
      const raw = await native.hermesHttp(url, token, 'models', 'GET');
      const parsed = parseJsonSafe<any>(raw, {});
      if (Array.isArray(parsed?.data)) {
        modelsCount = parsed.data.length;
        if (!features.includes('Models API')) features.push('Models API');
      }
    } catch {
      // Non-fatal if health passed
    }
  }

  const latencyMs = Math.max(1, Math.round(performance.now() - start));
  return { healthy, latencyMs, modelsCount, features };
}

/**
 * Query GET /v1/models from Hermes API server.
 */
export async function fetchHermesModels(url: string, token: string): Promise<HermesModelItem[]> {
  const raw = await native.hermesHttp(url, token, 'models', 'GET');
  const parsed = parseJsonSafe<any>(raw, {});
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
  return list.map((item: any) => ({
    id: typeof item === 'string' ? item : (item?.id || 'unknown'),
    name: typeof item === 'object' ? item?.name : undefined,
    description: typeof item === 'object' ? item?.description : undefined,
  }));
}

/**
 * Query GET /v1/skills from Hermes API server.
 */
export async function fetchHermesSkills(url: string, token: string): Promise<HermesSkillItem[]> {
  const raw = await native.hermesHttp(url, token, 'skills', 'GET');
  const parsed = parseJsonSafe<any>(raw, {});
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.data)
      ? parsed.data
      : Array.isArray(parsed?.skills)
        ? parsed.skills
        : [];
  return list.map((item: any) => ({
    name: typeof item === 'string' ? item : (item?.name || item?.id || 'unnamed-skill'),
    description: typeof item === 'object' ? item?.description : undefined,
    category: typeof item === 'object' ? item?.category : undefined,
  }));
}

/**
 * Query GET /v1/toolsets from Hermes API server.
 */
export async function fetchHermesToolsets(url: string, token: string): Promise<HermesToolsetItem[]> {
  let raw: string;
  try {
    raw = await native.hermesHttp(url, token, 'toolsets', 'GET');
  } catch {
    // Fallback to /v1/tools
    raw = await native.hermesHttp(url, token, 'tools', 'GET');
  }
  const parsed = parseJsonSafe<any>(raw, {});
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.data)
      ? parsed.data
      : Array.isArray(parsed?.toolsets)
        ? parsed.toolsets
        : Array.isArray(parsed?.tools)
          ? parsed.tools
          : [];
  return list.map((item: any) => ({
    name: typeof item === 'string' ? item : (item?.name || item?.id || 'unnamed-toolset'),
    description: typeof item === 'object' ? item?.description : undefined,
    tools: Array.isArray(item?.tools) ? item.tools : undefined,
  }));
}

/**
 * When actively streaming, post stop to /v1/runs/{id}/stop.
 */
export async function postHermesStop(url: string, token: string, runId: string): Promise<void> {
  await native.hermesHttp(url, token, `runs/${encodeURIComponent(runId)}/stop`, 'POST', JSON.stringify({}));
}
