import { describe, expect, it } from 'vitest';
import { basicSlashCommands, extendedSlashCommands, formatCommandHelp, localizeSlashCommand, parseSlashCommand, sanitizeCommandResults } from './slashCommands';
import { setLanguage } from './i18n';

describe('slash command parsing', () => {
  it.each([
    [' /HELP ', { name: 'help', args: '' }],
    ['/MODEL Model:Variant --provider Example', { name: 'model', args: 'Model:Variant --provider Example' }],
    ['/new  My  Project\nSecond line ', { name: 'new', args: 'My  Project\nSecond line' }],
    ['/some-command2 arg /other', { name: 'some-command2', args: 'arg /other' }],
  ])('parses %s without changing argument text', (input, expected) => {
    expect(parseSlashCommand(input as string)).toEqual(expected);
  });
  it.each(['ordinary chat', '', '/', ' / ', '//literal /help', ' //literal', '/bad_name args', '/2bad', '/bad! args', '/help/model'])('does not interpret %s as a command', text => {
    expect(parseSlashCommand(text)).toBeNull();
  });
});

describe('default command capabilities and help', () => {
  it('localizes descriptions without changing command names or argument syntax', () => {
    setLanguage('en');
    const english=basicSlashCommands();
    expect(formatCommandHelp(english)).toContain('Start a new conversation.');
    setLanguage('id');
    const indonesian=basicSlashCommands();
    expect(formatCommandHelp(indonesian)).toContain('Mulai percakapan baru.');
    expect(english.map(({description,reason,...command})=>command)).toEqual(indonesian.map(({description,reason,...command})=>command));
    setLanguage('en');
  });
  it('refreshes cached Warren copy but preserves custom server descriptions and reasons', () => {
    setLanguage('id');
    const cached=basicSlashCommands();
    setLanguage('en');
    expect(formatCommandHelp(cached)).toContain('Start a new conversation.');
    expect(formatCommandHelp(cached)).not.toContain('Mulai percakapan baru.');
    const remote={name:'status',description:'Custom gateway description',reason:'Gateway policy: unavailable',available:false};
    expect(localizeSlashCommand(remote)).toEqual(remote);
    expect(localizeSlashCommand(cached[2]).reason).toBe('Requires a compatible Hermes Gateway.');
  });
  it('only enables local commands until a compatible Gateway has been checked', () => {
    const commands = basicSlashCommands();
    expect(commands.filter(command => command.available).map(command => command.name)).toEqual(['help', 'new']);
    expect(commands.filter(command => !command.available).map(command => command.name)).toEqual(['status', 'usage', 'model', 'compact', 'stop']);
    expect(commands.filter(command => command.allowWhileRunning).map(command => command.name)).toEqual(['help', 'status', 'usage', 'stop']);
    expect(commands.filter(command => !command.available).every(command => command.reason?.includes('Gateway'))).toBe(true);
    commands[0].available = false;
    expect(basicSlashCommands()[0].available).toBe(true);
  });
  it('explains argument syntax and unavailable commands in plain help output', () => {
    const help = formatCommandHelp(basicSlashCommands());
    expect(help).toContain('/new [name]');
    expect(help).toContain('/model MODEL [--provider PROVIDER]');
    expect(help).toContain('/compact [focus]');
    expect(help).toContain('Gateway');
    expect(help).not.toMatch(/undefined|\[object Object\]/);
  });
  it('extended slash commands suite organizes commands into 4 section categories', () => {
    const commands = extendedSlashCommands('openai');
    const categories = new Set(commands.map(c => c.category));
    expect(categories).toEqual(new Set(['workspace', 'session', 'intel', 'system']));
    expect(commands.filter(c => c.category === 'workspace').map(c => c.name)).toEqual(['lastcmd', 'term']);
    expect(commands.filter(c => c.category === 'session').map(c => c.name)).toEqual(['new', 'fork', 'clear', 'retry', 'export', 'stop', 'compact']);
    expect(commands.filter(c => c.category === 'intel').map(c => c.name)).toEqual(['models', 'model', 'skills', 'tools']);
    expect(commands.filter(c => c.category === 'system').map(c => c.name)).toEqual(['status', 'help', 'usage']);
  });
  it('enables HTTP commands for openai transport and reserves gateway-only commands', () => {
    const httpCommands = extendedSlashCommands('openai');
    const availableHttp = httpCommands.filter(c => c.available).map(c => c.name);
    expect(availableHttp).toContain('lastcmd');
    expect(availableHttp).toContain('term');
    expect(availableHttp).toContain('clear');
    expect(availableHttp).toContain('retry');
    expect(availableHttp).toContain('fork');
    expect(availableHttp).toContain('export');
    expect(availableHttp).toContain('models');
    expect(availableHttp).toContain('model');
    expect(availableHttp).toContain('skills');
    expect(availableHttp).toContain('tools');
    expect(availableHttp).toContain('status');
    expect(availableHttp).toContain('stop');
    expect(httpCommands.find(c => c.name === 'compact')?.available).toBe(false);
    expect(httpCommands.find(c => c.name === 'usage')?.available).toBe(false);

    const gatewayCommands = extendedSlashCommands('gateway');
    expect(gatewayCommands.find(c => c.name === 'compact')?.available).toBe(true);
    expect(gatewayCommands.find(c => c.name === 'usage')?.available).toBe(true);
  });
});

describe('saved command results', () => {
  const valid = { id: 'result-1', command: '/status', content: 'Ready', createdAt: 1, status: 'complete' };
  it('drops corrupt records and duplicate IDs without mutating the source', () => {
    const source = [
      null, false, 'wrong', { ...valid, id: '' }, { ...valid, id: ' ' },
      { ...valid, id: 'bad-command', command: 5 }, { ...valid, id: 'empty-command', command: ' ' },
      { ...valid, id: 'bad-content', content: null }, { ...valid, id: 'bad-time', createdAt: NaN },
      { ...valid, id: 'unrenderable-time', createdAt: 1e100 },
      { ...valid, id: 'negative-time', createdAt: -1 }, { ...valid, id: 'bad-status', status: 'invented' },
      valid, { ...valid, content: 'Duplicate content' },
    ];
    expect(sanitizeCommandResults(source)).toEqual([valid]);
    expect(valid.content).toBe('Ready');
    expect(sanitizeCommandResults({ results: source })).toEqual([]);
  });
  it('keeps only the latest 100 valid results and bounds saved text', () => {
    const source = Array.from({ length: 105 }, (_, index) => ({ ...valid, id: `result-${index}`, command: '/model ' + 'x'.repeat(600), content: 'y'.repeat(5000) }));
    const results = sanitizeCommandResults(source);
    expect(results).toHaveLength(100);
    expect(results[0].id).toBe('result-5');
    expect(results.at(-1)?.id).toBe('result-104');
    expect(results.every(result => result.command.length === 500 && result.content.length === 4000)).toBe(true);
    expect(source[0].content).toHaveLength(5000);
  });
  it('marks pending results unknown on recovery and retains the interruption note once', () => {
    const source = [{ ...valid, status: 'pending', content: 'Partial command output' }, { ...valid, id: 'complete-result' }];
    expect(sanitizeCommandResults(source)[0].status).toBe('pending');
    const recovered = sanitizeCommandResults(source, 'Connection interrupted; no retry.');
    expect(recovered[0]).toMatchObject({ id: 'result-1', status: 'unknown' });
    expect(recovered[0].content).toContain('Partial command output');
    expect(recovered[0].content).toContain('Connection interrupted; no retry.');
    expect(recovered[1]).toEqual({ ...valid, id: 'complete-result' });
    expect(sanitizeCommandResults(recovered, 'Connection interrupted; no retry.')).toEqual(recovered);
    expect(source[0].status).toBe('pending');
  });
  it('keeps an interruption explanation even when partial output already reaches the limit', () => {
    const [result] = sanitizeCommandResults([{ ...valid, status: 'pending', content: 'x'.repeat(5000) }], 'Result unknown.');
    expect(result.content).toHaveLength(4000);
    expect(result.content.endsWith('Result unknown.')).toBe(true);
  });
});
