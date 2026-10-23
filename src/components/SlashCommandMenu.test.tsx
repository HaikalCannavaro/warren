import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlashCommandMenu } from './SlashCommandMenu';
import { extendedSlashCommands } from '../lib/slashCommands';
import { setLanguage } from '../lib/i18n';

describe('SlashCommandMenu', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders sectioned categories for extended commands suite', () => {
    setLanguage('en');
    const commands = extendedSlashCommands('openai');
    const onSelect = vi.fn();

    render(
      <SlashCommandMenu
        id="test-menu"
        commands={commands}
        selectedIndex={0}
        loading={false}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('WORKSPACE BRIDGE')).toBeTruthy();
    expect(screen.getByText('SESSION CONTROL')).toBeTruthy();
    expect(screen.getByText('HERMES INTEL')).toBeTruthy();
    expect(screen.getByText('SYSTEM')).toBeTruthy();

    expect(screen.getByText('/lastcmd')).toBeTruthy();
    expect(screen.getByText('/new')).toBeTruthy();
    expect(screen.getByText('/models')).toBeTruthy();
    expect(screen.getByText('/status')).toBeTruthy();
  });

  it('invokes onSelect when an available command option is clicked', () => {
    const commands = extendedSlashCommands('openai');
    const onSelect = vi.fn();

    render(
      <SlashCommandMenu
        id="test-menu"
        commands={commands}
        selectedIndex={1}
        loading={false}
        onSelect={onSelect}
      />
    );

    const termOption = screen.getByText('/term').closest('button');
    expect(termOption).toBeTruthy();
    fireEvent.click(termOption!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'term' }));
  });

  it('localizes category headers when language changes', () => {
    setLanguage('id');
    const commands = extendedSlashCommands('openai');
    render(
      <SlashCommandMenu
        id="test-menu"
        commands={commands}
        selectedIndex={0}
        loading={false}
        onSelect={() => {}}
      />
    );

    expect(screen.getByText('JEMBATAN RUANG KERJA')).toBeTruthy();
    expect(screen.getByText('KONTROL SESI')).toBeTruthy();
    expect(screen.getByText('INTEL HERMES')).toBeTruthy();
    expect(screen.getByText('SISTEM')).toBeTruthy();
    setLanguage('en');
  });

  it('renders empty matching state message when commands list is empty', () => {
    setLanguage('en');
    render(
      <SlashCommandMenu
        id="test-menu"
        commands={[]}
        selectedIndex={-1}
        loading={false}
        onSelect={() => {}}
      />
    );

    expect(screen.getByText(/No matching commands/)).toBeTruthy();
  });
});
