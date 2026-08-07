export type ToolResult = ToolSuccessResult | ToolFailureResult;

export interface ToolSuccessResult {
  success: true;
  data?: unknown;
}

export interface ToolFailureResult {
  success: false;
  error?: string;
  data?: unknown;
}

export interface Tool {
  name: string;
  description: string;
  execute(parameters: Record<string, unknown>): Promise<ToolResult>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    const name = normalizeToolName(tool.name);

    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered.`);
    }

    this.tools.set(name, tool);
  }

  get(name: string): Tool {
    const normalizedName = normalizeToolName(name);
    const tool = this.tools.get(normalizedName);

    if (!tool) {
      throw new Error(`Tool "${normalizedName}" is not registered.`);
    }

    return tool;
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}

function normalizeToolName(name: string): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Tool name must be a non-empty string.');
  }

  return name.trim();
}
