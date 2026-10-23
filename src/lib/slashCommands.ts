import { translate } from './i18n';
import type { CommandResult, SlashCommand } from '../types';

export function parseSlashCommand(text: string): { name: string; args: string } | null {
  const match = /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), args: match[2] ?? '' } : null;
}

const descriptions: Record<string, readonly [string, string]> = {
  help: ['View commands and their availability.', 'Lihat perintah dan ketersediaannya.'],
  new: ['Start a new conversation.', 'Mulai percakapan baru.'],
  status: ['Check the Agent session status.', 'Periksa status sesi Agent.'],
  usage: ['View session usage.', 'Lihat pemakaian sesi.'],
  model: ['View or change the session model.', 'Lihat atau ubah model sesi.'],
  compact: ['Compact the conversation context.', 'Ringkas konteks percakapan.'],
  stop: ['Ask the Agent to stop its active task.', 'Minta Agent menghentikan pekerjaan aktif.'],
  lastcmd: ['Capture recent lines from the active terminal buffer.', 'Salin baris terbaru dari buffer terminal aktif.'],
  term: ['Alias for /lastcmd. Capture active terminal lines.', 'Alias untuk /lastcmd. Salin baris terminal aktif.'],
  clear: ['Clear conversation messages from view.', 'Bersihkan pesan percakapan dari tampilan.'],
  retry: ['Re-send the last user message in this conversation.', 'Kirim ulang pesan pengguna terakhir dalam percakapan ini.'],
  fork: ['Fork current conversation to a new tab.', 'Cabangkan percakapan saat ini ke tab baru.'],
  export: ['Export conversation transcript as Markdown or JSON.', 'Ekspor riwayat percakapan sebagai Markdown atau JSON.'],
  models: ['Query and list available Hermes models.', 'Lihat daftar model Hermes yang tersedia.'],
  skills: ['Query and list loaded agent skills.', 'Lihat daftar skill agent yang dimuat.'],
  tools: ['Query and list available Hermes toolsets.', 'Lihat daftar toolset Hermes yang tersedia.'],
};

const gatewayReason = ['Requires a compatible Hermes Gateway.', 'Memerlukan Gateway Hermes yang kompatibel.'] as const;
const unadvertisedReason = ['This Gateway does not advertise this command.', 'Perintah belum diiklankan oleh Gateway ini.'] as const;

/** Refresh only Warren's own copy; leave server-provided descriptions untouched. */
export function localizeSlashCommand(command: SlashCommand): SlashCommand {
  const copy = descriptions[command.name.replace(/^\//, '')];
  return {
    ...command,
    description: copy?.includes(command.description) ? translate(...copy) : command.description,
    ...(command.reason && gatewayReason.some(reason => reason === command.reason) ? { reason: translate(...gatewayReason) } : {}),
    ...(command.reason && unadvertisedReason.some(reason => reason === command.reason) ? { reason: translate(...unadvertisedReason) } : {}),
  };
}

export function basicSlashCommands(): SlashCommand[] {
  const reason = translate(...gatewayReason);
  return [
    { name: 'help', description: translate(...descriptions.help), available: true, allowWhileRunning: true },
    { name: 'new', description: translate(...descriptions.new), args: '[name]', available: true },
    { name: 'status', description: translate(...descriptions.status), available: false, reason, allowWhileRunning: true },
    { name: 'usage', description: translate(...descriptions.usage), available: false, reason, allowWhileRunning: true },
    { name: 'model', description: translate(...descriptions.model), args: 'MODEL [--provider PROVIDER]', available: false, reason },
    { name: 'compact', description: translate(...descriptions.compact), args: '[focus]', available: false, reason },
    { name: 'stop', description: translate(...descriptions.stop), available: false, reason, allowWhileRunning: true },
  ];
}

/**
 * Extended slash commands suite with category sectioning, workspace bridge,
 * session lifecycle, and Hermes REST intelligence.
 */
export function extendedSlashCommands(transport: 'openai' | 'gateway' = 'openai'): SlashCommand[] {
  const gwReason = translate(...gatewayReason);
  const isGateway = transport === 'gateway';

  return [
    // WORKSPACE BRIDGE
    {
      name: 'lastcmd',
      description: translate(...descriptions.lastcmd),
      args: '[lines]',
      available: true,
      category: 'workspace',
      aliases: ['term'],
    },
    {
      name: 'term',
      description: translate(...descriptions.term),
      args: '[lines]',
      available: true,
      category: 'workspace',
    },

    // SESSION CONTROL
    {
      name: 'new',
      description: translate(...descriptions.new),
      args: '[name]',
      available: true,
      category: 'session',
    },
    {
      name: 'fork',
      description: translate(...descriptions.fork),
      args: '[name]',
      available: true,
      category: 'session',
    },
    {
      name: 'clear',
      description: translate(...descriptions.clear),
      available: true,
      category: 'session',
    },
    {
      name: 'retry',
      description: translate(...descriptions.retry),
      available: true,
      category: 'session',
    },
    {
      name: 'export',
      description: translate(...descriptions.export),
      args: '[format]',
      available: true,
      category: 'session',
    },
    {
      name: 'stop',
      description: translate(...descriptions.stop),
      available: true,
      allowWhileRunning: true,
      category: 'session',
    },
    {
      name: 'compact',
      description: translate(...descriptions.compact),
      args: '[focus]',
      available: isGateway,
      reason: isGateway ? undefined : gwReason,
      category: 'session',
    },

    // HERMES INTEL
    {
      name: 'models',
      description: translate(...descriptions.models),
      available: true,
      category: 'intel',
    },
    {
      name: 'model',
      description: translate(...descriptions.model),
      args: isGateway ? 'MODEL [--provider PROVIDER]' : '[model-id]',
      available: true,
      category: 'intel',
    },
    {
      name: 'skills',
      description: translate(...descriptions.skills),
      available: true,
      category: 'intel',
    },
    {
      name: 'tools',
      description: translate(...descriptions.tools),
      available: true,
      category: 'intel',
    },

    // SYSTEM
    {
      name: 'status',
      description: translate(...descriptions.status),
      available: true,
      allowWhileRunning: true,
      category: 'system',
    },
    {
      name: 'help',
      description: translate(...descriptions.help),
      available: true,
      allowWhileRunning: true,
      category: 'system',
    },
    {
      name: 'usage',
      description: translate(...descriptions.usage),
      available: isGateway,
      reason: isGateway ? undefined : gwReason,
      allowWhileRunning: true,
      category: 'system',
    },
  ];
}

export function formatCommandHelp(commands: SlashCommand[]): string {
  return commands.map(localizeSlashCommand).map(command => `/${command.name.replace(/^\//, '')}${command.args ? ` ${command.args}` : ''} — ${command.description}${command.available ? '' : `\n  ${translate("Unavailable", "Belum tersedia")}: ${command.reason || translate("This connection does not support this command.", "Koneksi ini belum mendukung perintah tersebut.")}`}`).join('\n\n');
}

const statuses = new Set<CommandResult['status']>(['pending', 'complete', 'error', 'unknown']);
const MAX_RESULTS = 100;
const MAX_CONTENT = 4000;
const MAX_COMMAND = 500;

function isCommandResult(candidate: unknown): candidate is CommandResult {
  if (!candidate || typeof candidate !== 'object') return false;
  const result = candidate as Partial<CommandResult>;
  return typeof result.id === 'string' && !!result.id.trim() &&
    typeof result.command === 'string' && !!result.command.trim() && typeof result.content === 'string' &&
    typeof result.createdAt === 'number' && Number.isFinite(result.createdAt) && result.createdAt >= 0 && Number.isFinite(new Date(result.createdAt).getTime()) &&
    !!result.status && statuses.has(result.status);
}

export function hasUncertainSessionMutation(input: unknown): boolean {
  if (!Array.isArray(input)) return false;
  // Inspect the full saved history before display limits discard older results.
  return input.some(candidate => {
    if (!isCommandResult(candidate) || !['pending', 'unknown'].includes(candidate.status)) return false;
    const command = parseSlashCommand(candidate.command);
    return command?.name === 'model' || command?.name === 'compact';
  });
}

export function sanitizeCommandResults(input: unknown, interruption?: string): CommandResult[] {
  if (!Array.isArray(input)) return [];
  const results: CommandResult[] = [];
  const ids = new Set<string>();
  for (const candidate of input) {
    if (!isCommandResult(candidate) || ids.has(candidate.id)) continue;
    const result = candidate;
    ids.add(result.id);
    let content = result.content.slice(0, MAX_CONTENT);
    const interrupted = result.status === 'pending' && interruption !== undefined;
    if (interrupted && interruption) {
      const note = interruption.slice(0, MAX_CONTENT);
      const partial = content.slice(0, Math.max(0, MAX_CONTENT - note.length - 2));
      content = partial ? `${partial}\n\n${note}` : note;
    }
    results.push({ id: result.id, command: result.command.slice(0, MAX_COMMAND), content, createdAt: result.createdAt, status: interrupted ? 'unknown' : result.status });
  }
  return results.slice(-MAX_RESULTS);
}
