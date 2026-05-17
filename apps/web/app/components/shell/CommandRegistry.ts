export interface Command {
  id: string;
  label: string;
  section: string;
  keywords?: string[];
  handler: () => void;
  shortcut?: string;
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
    const lower = query.toLowerCase().trim();
    if (!lower) return this.list();

    return Array.from(this.commands.values()).filter((cmd) => {
      if (cmd.label.toLowerCase().includes(lower)) return true;
      if (cmd.keywords?.some((k) => k.toLowerCase().includes(lower))) return true;
      return false;
    });
  }
}

export const registry = new CommandRegistry();