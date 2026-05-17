import { describe, it, expect, beforeEach } from 'vitest';
import { registry, type Command } from '../CommandRegistry';

describe('CommandRegistry', () => {
  const sampleCommand: Command = {
    id: 'test-cmd',
    label: 'Test Command',
    section: 'Test',
    keywords: ['tester', 'example'],
    handler: () => {},
  };

  beforeEach(() => {
    registry.unregister('test-cmd');
    registry.unregister('cmd-2');
    registry.unregister('cmd-3');
  });

  it('registers a command', () => {
    registry.register(sampleCommand);
    const commands = registry.list();
    expect(commands).toContainEqual(sampleCommand);
  });

  it('unregisters a command', () => {
    registry.register(sampleCommand);
    registry.unregister('test-cmd');
    const commands = registry.list();
    expect(commands).not.toContainEqual(sampleCommand);
  });

  it('overwrites duplicate command IDs', () => {
    registry.register(sampleCommand);
    registry.register({ ...sampleCommand, label: 'Updated' });
    const commands = registry.list();
    expect(commands.filter((c) => c.id === 'test-cmd')).toHaveLength(1);
    expect(commands.find((c) => c.id === 'test-cmd')?.label).toBe('Updated');
  });

  it('searches by label', () => {
    registry.register(sampleCommand);
    const results = registry.search('test');
    expect(results).toContainEqual(sampleCommand);
  });

  it('searches by keyword', () => {
    registry.register(sampleCommand);
    const results = registry.search('tester');
    expect(results).toContainEqual(sampleCommand);
  });

  it('searches case-insensitive', () => {
    registry.register(sampleCommand);
    const results = registry.search('TEST');
    expect(results).toContainEqual(sampleCommand);
  });

  it('returns all commands when query is empty', () => {
    registry.register(sampleCommand);
    const results = registry.search('');
    expect(results).toContainEqual(sampleCommand);
  });

  it('returns empty array when no matches', () => {
    registry.register(sampleCommand);
    const results = registry.search('nonexistent');
    expect(results).toHaveLength(0);
  });
});