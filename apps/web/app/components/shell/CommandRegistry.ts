export interface Command {
  id: string;
  label: string;
  section: string;
  keywords?: string[];
  handler: () => void;
  shortcut?: string;
}

/** Palette group order; sections outside this list follow in first-seen order. */
const COMMAND_SECTIONS = ['Navigation', 'Recent', 'Settings', 'Extensions', 'App'] as const;

export function commandMatchesQuery(command: Command, query: string): boolean {
  const lower = query.toLowerCase().trim();
  if (!lower) return true;
  if (command.label.toLowerCase().includes(lower)) return true;
  return command.keywords?.some((keyword) => keyword.toLowerCase().includes(lower)) ?? false;
}

export function groupCommandsBySection(commands: readonly Command[]): Array<[string, Command[]]> {
  const groups = new Map<string, Command[]>();
  for (const command of commands) {
    const group = groups.get(command.section);
    if (group === undefined) {
      groups.set(command.section, [command]);
    } else {
      group.push(command);
    }
  }

  const rank = (section: string) => {
    const index = COMMAND_SECTIONS.findIndex((candidate) => candidate === section);
    return index === -1 ? COMMAND_SECTIONS.length : index;
  };
  // Stable sort: unknown sections keep the order they were registered in.
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
}

class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(command: Command): void {
    if (this.commands.has(command.id)) {
      this.commands.delete(command.id);
    }
    this.commands.set(command.id, command);
  }

  unregister(id: string): void {
    this.commands.delete(id);
  }

  list(_context?: string): Command[] {
    return Array.from(this.commands.values());
  }

  search(query: string): Command[] {
    return Array.from(this.commands.values()).filter((cmd) => commandMatchesQuery(cmd, query));
  }
}

export const registry = new CommandRegistry();
