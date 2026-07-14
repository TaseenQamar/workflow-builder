import { NodeType } from '../models/workflow.models';

export interface NodeDefinition {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  category: 'Triggers' | 'Actions' | 'AI' | 'Logic' | 'Integrations';
  defaultData: Record<string, unknown>;
}

export const NODE_CATALOG: NodeDefinition[] = [
  {
    type: 'chat_trigger',
    label: 'Chat Message Received',
    description: 'When user sends a chat message',
    icon: '💬',
    category: 'Triggers',
    defaultData: { channel: 'web' },
  },
  {
    type: 'webhook',
    label: 'Webhook',
    description: 'Start on HTTP request',
    icon: '🔗',
    category: 'Triggers',
    defaultData: { path: 'my-webhook', method: 'POST' },
  },
  {
    type: 'schedule',
    label: 'Schedule',
    description: 'Run on cron schedule',
    icon: '⏰',
    category: 'Triggers',
    defaultData: { cron: '0 9 * * *' },
  },
  {
    type: 'http',
    label: 'HTTP Request',
    description: 'Call any REST API',
    icon: '🌐',
    category: 'Actions',
    defaultData: {
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'GET',
      body: '',
    },
  },
  {
    type: 'email',
    label: 'Send Email',
    description: 'Send via SMTP or SendGrid',
    icon: '✉',
    category: 'Actions',
    defaultData: { to: '{{email}}', subject: 'Notification', body: 'Hello!' },
  },
  {
    type: 'slack',
    label: 'Slack',
    description: 'Post channel message',
    icon: '💬',
    category: 'Actions',
    defaultData: {
      channel: '#general',
      message: 'New row added: {{aiResponse}}',
    },
  },
  {
    type: 'spreadsheet',
    label: 'Spreadsheet',
    description: 'Add rows to Excel-like sheet',
    icon: '📊',
    category: 'Actions',
    defaultData: {
      action: 'add_row',
      sheetName: 'Sheet1',
      headers: 'Name,Response',
      rowCol1: '{{name}}',
      rowCol2: '{{aiResponse}}',
    },
  },
  {
    type: 'n8n',
    label: 'n8n Node',
    description: 'Delegate step to n8n',
    icon: '⚙️',
    category: 'Integrations',
    defaultData: { webhookPath: 'support-ticket' },
  },
  {
    type: 'ai_agent',
    label: 'AI Agent',
    description: 'Tools Agent — attach model, memory & tools',
    icon: '🤖',
    category: 'AI',
    defaultData: {
      agentType: 'tools',
      instructions: 'You are a helpful assistant. Use {{message}}. If HTTP data exists, use it from context.',
      outputKey: 'aiResponse',
    },
  },
  {
    type: 'chat_model',
    label: 'OpenAI Chat Model',
    description: 'Attach to AI Agent Chat Model port',
    icon: '🧠',
    category: 'AI',
    defaultData: { provider: 'openai', model: 'gpt-4o-mini' },
  },
  {
    type: 'memory',
    label: 'Window Buffer Memory',
    description: 'Attach to AI Agent Memory port',
    icon: '🗂',
    category: 'AI',
    defaultData: { memoryType: 'window_buffer', windowSize: 10 },
  },
  {
    type: 'tool',
    label: 'Workflow Tool',
    description: 'Attach to AI Agent Tool port',
    icon: '🔧',
    category: 'AI',
    defaultData: { name: 'Workflow Tool', toolType: 'workflow' },
  },
  {
    type: 'ai',
    label: 'AI Generate',
    description: 'OpenAI / Gemini prompt',
    icon: '✦',
    category: 'AI',
    defaultData: {
      provider: 'openai',
      prompt: 'Process this: {{body}}',
      outputKey: 'aiResponse',
    },
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on if/else rules',
    icon: '◇',
    category: 'Logic',
    defaultData: { field: 'category', operator: 'equals', value: 'Billing' },
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait before next step',
    icon: '⏳',
    category: 'Logic',
    defaultData: { seconds: 2 },
  },
  {
    type: 'code',
    label: 'Code',
    description: 'Custom JavaScript logic',
    icon: '{ }',
    category: 'Logic',
    defaultData: { code: 'return { ...input, processed: true };' },
  },
];

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 88;
export const CONDITION_NODE_HEIGHT = 104;
export const AI_AGENT_NODE_HEIGHT = 128;
export const CONFIG_NODE_SIZE = 72;
export const GRID_SIZE = 24;
export const NODE_HORIZONTAL_GAP = 120;

export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export type PortKind = 'flow' | 'config';

export interface PortConfig {
  id: string;
  label?: string;
  side: PortSide;
  offsetY?: number;
  offsetX?: number;
  kind?: PortKind;
}

export interface NodePortLayout {
  inputs: PortConfig[];
  outputs: PortConfig[];
  configInputs?: PortConfig[];
}

export function isTriggerNode(type: NodeType): boolean {
  return type === 'webhook' || type === 'schedule' || type === 'chat_trigger';
}

export function isConfigNode(type: NodeType): boolean {
  return type === 'chat_model' || type === 'memory' || type === 'tool';
}

export type AiProviderChoice = 'openai' | 'gemini';

export function chatModelConfigForProvider(provider: AiProviderChoice): {
  label: string;
  data: Record<string, unknown>;
} {
  if (provider === 'gemini') {
    return {
      label: 'Gemini Chat Model',
      data: { provider: 'gemini', model: 'gemini-2.0-flash' },
    };
  }
  return {
    label: 'OpenAI Chat Model',
    data: { provider: 'openai', model: 'gpt-4o-mini' },
  };
}

export function readStoredAiProvider(): AiProviderChoice {
  try {
    const v = localStorage.getItem('wb-default-ai-provider');
    return v === 'gemini' ? 'gemini' : 'openai';
  } catch {
    return 'openai';
  }
}

export function storeAiProvider(provider: AiProviderChoice): void {
  try {
    localStorage.setItem('wb-default-ai-provider', provider);
  } catch {
    /* ignore */
  }
}

export function getNodeHeight(type: NodeType): number {
  if (type === 'condition') return CONDITION_NODE_HEIGHT;
  if (type === 'ai_agent') return AI_AGENT_NODE_HEIGHT;
  if (isConfigNode(type)) return CONFIG_NODE_SIZE;
  return NODE_HEIGHT;
}

export function getNodeWidth(type: NodeType): number {
  return isConfigNode(type) ? CONFIG_NODE_SIZE : NODE_WIDTH;
}

export function getNodePortLayout(type: NodeType): NodePortLayout {
  if (type === 'condition') {
    return {
      inputs: [{ id: 'main', side: 'left', offsetY: 0.5, kind: 'flow' }],
      outputs: [
        { id: 'true', label: 'true', side: 'right', offsetY: 0.35, kind: 'flow' },
        { id: 'false', label: 'false', side: 'right', offsetY: 0.65, kind: 'flow' },
      ],
    };
  }

  if (type === 'ai_agent') {
    return {
      inputs: [{ id: 'main', side: 'left', offsetY: 0.38, kind: 'flow' }],
      outputs: [{ id: 'main', side: 'right', offsetY: 0.38, kind: 'flow' }],
      configInputs: [
        { id: 'chatModel', label: 'Chat Model', side: 'bottom', offsetX: 0.22, kind: 'config' },
        { id: 'memory', label: 'Memory', side: 'bottom', offsetX: 0.5, kind: 'config' },
        { id: 'tool', label: 'Tool', side: 'bottom', offsetX: 0.78, kind: 'config' },
      ],
    };
  }

  if (isConfigNode(type)) {
    return {
      inputs: [],
      outputs: [{ id: 'config', side: 'top', offsetX: 0.5, kind: 'config' }],
    };
  }

  const isTrigger = isTriggerNode(type);
  return {
    inputs: isTrigger ? [] : [{ id: 'main', side: 'left', offsetY: 0.5, kind: 'flow' }],
    outputs: [{ id: 'main', side: 'right', offsetY: 0.5, kind: 'flow' }],
  };
}

export function getPortPosition(
  node: import('../models/workflow.models').CanvasNode,
  port: PortConfig,
): { x: number; y: number } {
  const w = getNodeWidth(node.type);
  const h = getNodeHeight(node.type);
  const yFrac = port.offsetY ?? 0.5;
  const xFrac = port.offsetX ?? 0.5;

  if (port.side === 'left') {
    return { x: node.position.x, y: node.position.y + h * yFrac };
  }
  if (port.side === 'right') {
    return { x: node.position.x + w, y: node.position.y + h * yFrac };
  }
  if (port.side === 'top') {
    return { x: node.position.x + w * xFrac, y: node.position.y };
  }
  return { x: node.position.x + w * xFrac, y: node.position.y + h };
}

export function horizontalBezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const dx = Math.abs(x2 - x1);
  const curve = Math.max(48, dx * 0.45);
  return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
}

export function snapToGrid(value: number, grid = GRID_SIZE): number {
  return Math.round(value / grid) * grid;
}

export function nodeColor(type: NodeType): string {
  const map: Record<string, string> = {
    webhook: 'border-amber-300 bg-amber-50',
    chat_trigger: 'border-rose-300 bg-rose-50',
    schedule: 'border-amber-300 bg-amber-50',
    http: 'border-[#CDDBD9] bg-white',
    email: 'border-[#CDDBD9] bg-white',
    slack: 'border-pink-300 bg-pink-50',
    ai: 'border-[#9FE0DC] bg-[#F5FBFA]',
    ai_agent: 'border-[#2BBFBA]/40 bg-[#E6F7F6]',
    chat_model: 'border-sky-300 bg-sky-50',
    memory: 'border-[#9FE0DC] bg-[#E6F7F6]',
    tool: 'border-teal-300 bg-teal-50',
    condition: 'border-cyan-300 bg-cyan-50',
    delay: 'border-cyan-300 bg-cyan-50',
    code: 'border-cyan-300 bg-cyan-50',
    n8n: 'border-[#9FE0DC] bg-[#E6F7F6]',
    spreadsheet: 'border-emerald-300 bg-emerald-50',
  };
  return map[type] ?? 'border-[#CDDBD9] bg-white';
}

/** Text classes for node labels — always readable on node backgrounds */
export function nodeTextColor(type: NodeType): string {
  return 'text-[#1A1A1A]';
}

export function nodeSubtextColor(type: NodeType): string {
  return 'text-[#757575]';
}

export function nodeIconBg(type: NodeType): string {
  const map: Record<string, string> = {
    webhook: 'bg-amber-100',
    chat_trigger: 'bg-rose-100',
    schedule: 'bg-amber-100',
    ai: 'bg-[#D5F2F0]',
    ai_agent: 'bg-[#D5F2F0]',
    chat_model: 'bg-sky-100',
    memory: 'bg-[#D5F2F0]',
    tool: 'bg-teal-100',
    condition: 'bg-cyan-100',
    delay: 'bg-cyan-100',
    code: 'bg-cyan-100',
    slack: 'bg-pink-100',
    spreadsheet: 'bg-emerald-100',
    n8n: 'bg-[#E6F7F6]',
  };
  return map[type] ?? 'bg-[#E6F7F6]';
}

export function createNodeFromDefinition(
  def: NodeDefinition,
  position: { x: number; y: number },
): import('../models/workflow.models').CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: def.type,
    label: def.label,
    icon: def.icon,
    category: def.category,
    position,
    data: { ...def.defaultData },
  };
}
