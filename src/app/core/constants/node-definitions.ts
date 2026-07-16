import { NodeType } from '../models/workflow.models';

export interface NodeDefinition {
  type: NodeType;
  label: string;
  description: string;
  icon: string;
  category: 'Triggers' | 'Actions' | 'AI' | 'Logic' | 'Data' | 'Integrations' | 'Social';
  defaultData: Record<string, unknown>;
}

export const NODE_CATEGORIES: NodeDefinition['category'][] = [
  'Triggers',
  'Actions',
  'AI',
  'Logic',
  'Data',
  'Social',
  'Integrations',
];

export const NODE_CATALOG: NodeDefinition[] = [
  // ── Triggers (n8n-style) ──
  {
    type: 'manual_trigger',
    label: 'Manual Trigger',
    description: 'Start workflow manually (n8n Manual Trigger)',
    icon: '▶',
    category: 'Triggers',
    defaultData: {},
  },
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
    description: 'Run on a timer (daily / hourly) — wire to Slack, Email, or Agent',
    icon: '⏰',
    category: 'Triggers',
    defaultData: {
      interval: 'daily',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Karachi',
      cron: '0 9 * * *',
    },
  },
  {
    type: 'rss',
    label: 'RSS Feed Read',
    description: 'Fetch items from an RSS/Atom feed',
    icon: '📰',
    category: 'Triggers',
    defaultData: { url: 'https://hnrss.org/frontpage', limit: 5 },
  },

  // ── Actions ──
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
    type: 'graphql',
    label: 'GraphQL',
    description: 'Run a GraphQL query/mutation',
    icon: '◈',
    category: 'Actions',
    defaultData: {
      url: 'https://countries.trevorblades.com/',
      query: '{ continents { code name } }',
      variables: '{}',
    },
  },
  {
    type: 'email',
    label: 'Send Email',
    description: 'Notify any To address via platform mailer (no password on node)',
    icon: '✉',
    category: 'Actions',
    defaultData: {
      to: '',
      subject: '{{emailSubject}}',
      body: '{{emailNotifyBody}}',
    },
  },
  {
    type: 'slack',
    label: 'Slack',
    description: 'Post channel message',
    icon: '💬',
    category: 'Actions',
    defaultData: {
      channel: '#general',
      message: '{{slackNotifyBody}}',
    },
  },
  {
    type: 'discord',
    label: 'Discord',
    description: 'Send message via Discord webhook',
    icon: '🎮',
    category: 'Actions',
    defaultData: {
      webhookUrl: '',
      content: 'Hello from Cluster Valley: {{aiResponse}}',
    },
  },
  {
    type: 'telegram',
    label: 'Telegram',
    description: 'Send Telegram bot message',
    icon: '✈️',
    category: 'Actions',
    defaultData: {
      botToken: '',
      chatId: '',
      text: 'Hello: {{message}}',
    },
  },
  {
    type: 'spreadsheet',
    label: 'Spreadsheet / Posts Sheet',
    description: 'Local Postgres sheet — CSV import / add / update (not Google)',
    icon: '📊',
    category: 'Actions',
    defaultData: {
      action: 'add_row',
      sheetName: 'Posts',
      pickMode: 'rotate_daily',
      headers: 'Message,Link,ImageUrl',
      postsCsv:
        'Message,Link,ImageUrl\nGood morning from Cluster Valley!,https://example.com,\nOur new AI workflow tip of the day,,\nFriday feature update is live!,https://example.com/blog,',
      rowCol1: '{{aiResponse}}',
      rowCol2: '',
      rowCol3: '',
      rowIndex: '1',
      columnIndex: '0',
      cellValue: '{{aiResponse}}',
      columnUpdates: '',
    },
  },
  {
    type: 'google_sheets',
    label: 'Google Sheets',
    description: 'n8n-style — append/update/read your real Google Sheet (Service Account)',
    icon: '📗',
    category: 'Actions',
    defaultData: {
      operation: 'auto',
      spreadsheetId: '',
      sheetName: '',
      range: '',
      dryRun: 'true',
      requireChatIntent: 'true',
      lookupColumn: '',
      lookupValue: '*',
      matchMode: 'all_rows',
      columnsToUpdate: [],
      columnMap: {},
      headersList: [],
      colDate: '{{date}}',
      colStart: '{{startTime}}',
      colEnd: '{{endTime}}',
      colDuration: '{{duration}}',
      colTicket: '{{ticket}}',
      colTask: '{{aiResponse}}{{task}}{{message}}',
      rowValues: '',
    },
  },
  {
    type: 'facebook',
    label: 'Facebook Page Post',
    description: 'Post text, link, or image (public HTTPS URL) to a Facebook Page',
    icon: '📘',
    category: 'Social',
    defaultData: {
      pageId: '',
      accessToken: '',
      message: '{{nextPost.message}}',
      link: '{{nextPost.link}}',
      imageUrl: '{{nextPost.imageUrl}}',
      dryRun: 'true',
    },
  },
  {
    type: 'instagram',
    label: 'Instagram Post',
    description: 'Publish image + caption to IG Business account',
    icon: '📸',
    category: 'Social',
    defaultData: {
      igUserId: '',
      accessToken: '',
      caption: '{{nextPost.message}}',
      imageUrl: '{{nextPost.imageUrl}}',
      dryRun: 'true',
    },
  },
  {
    type: 'linkedin',
    label: 'LinkedIn Post',
    description: 'Share a text update on LinkedIn',
    icon: '💼',
    category: 'Social',
    defaultData: {
      accessToken: '',
      authorUrn: '',
      text: '{{nextPost.message}}',
      dryRun: 'true',
    },
  },
  {
    type: 'postgres',
    label: 'Postgres',
    description: 'Run a SQL query (read-only SELECT by default)',
    icon: '🐘',
    category: 'Actions',
    defaultData: {
      mode: 'select',
      query: 'SELECT id, name FROM "Workflow" LIMIT 10',
    },
  },
  {
    type: 'respond_webhook',
    label: 'Respond to Webhook',
    description: 'Set response body/status for webhook calls',
    icon: '↩',
    category: 'Actions',
    defaultData: {
      statusCode: 200,
      body: '{"ok":true,"result":"{{aiResponse}}"}',
    },
  },

  // ── AI ──
  {
    type: 'ai_agent',
    label: 'AI Agent',
    description: 'Tools Agent — attach model, memory & tools',
    icon: '🤖',
    category: 'AI',
    defaultData: {
      agentType: 'tools',
      instructions:
        'You are the Cluster Valley AI guide for this workflow. Always reply in the user\'s language. Explain the full Chat→Agent→Tools flow when asked. For hi/hello/thanks/small talk: reply only — do NOT call tools. Call google_sheets / send_email / send_slack only when the user clearly asks in this message. After a successful sheet write, also notify email/Slack if attached. Never invent Apps Script.',
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
    description: 'n8n-style memory — remembers past chat turns for the AI Agent',
    icon: '🗂',
    category: 'AI',
    defaultData: {
      memoryType: 'window_buffer',
      windowSize: 10,
      sessionKey: '{{sessionId}}',
      storage: 'postgresql',
    },
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

  // ── Logic ──
  {
    type: 'condition',
    label: 'IF',
    description: 'Branch true/false (n8n IF)',
    icon: '◇',
    category: 'Logic',
    defaultData: { field: 'category', operator: 'equals', value: 'Billing' },
  },
  {
    type: 'switch',
    label: 'Switch',
    description: 'Route by value to case0/case1/default',
    icon: '⎇',
    category: 'Logic',
    defaultData: {
      field: 'category',
      case0: 'Billing',
      case1: 'Technical',
    },
  },
  {
    type: 'delay',
    label: 'Wait',
    description: 'Wait before next step (n8n Wait)',
    icon: '⏳',
    category: 'Logic',
    defaultData: { seconds: 2 },
  },
  {
    type: 'code',
    label: 'Code',
    description: 'Custom JavaScript (n8n Code)',
    icon: '{ }',
    category: 'Logic',
    defaultData: { code: 'return { ...input, processed: true };' },
  },
  {
    type: 'noop',
    label: 'No Operation',
    description: 'Pass data through unchanged',
    icon: '○',
    category: 'Logic',
    defaultData: {},
  },
  {
    type: 'stop_and_error',
    label: 'Stop and Error',
    description: 'Stop workflow with an error message',
    icon: '⛔',
    category: 'Logic',
    defaultData: { message: 'Stopped by workflow rule' },
  },

  // ── Data (n8n transform) ──
  {
    type: 'set',
    label: 'Edit Fields (Set)',
    description: 'Set/override fields like n8n Set',
    icon: '✎',
    category: 'Data',
    defaultData: {
      assignments: 'status=ok\nsummary={{aiResponse}}',
    },
  },
  {
    type: 'filter',
    label: 'Filter',
    description: 'Keep data only when condition matches',
    icon: '⨂',
    category: 'Data',
    defaultData: {
      field: 'category',
      operator: 'equals',
      value: 'Billing',
    },
  },
  {
    type: 'merge',
    label: 'Merge',
    description: 'Merge previous output into named object',
    icon: '⧉',
    category: 'Data',
    defaultData: { outputKey: 'merged' },
  },
  {
    type: 'split_out',
    label: 'Split Out',
    description: 'Split an array field into items[]',
    icon: '▤',
    category: 'Data',
    defaultData: { field: 'items' },
  },
  {
    type: 'aggregate',
    label: 'Aggregate',
    description: 'Count / join / summarize fields',
    icon: '∑',
    category: 'Data',
    defaultData: { field: 'items', operation: 'count' },
  },
  {
    type: 'datetime',
    label: 'Date & Time',
    description: 'Add current timestamp / format date',
    icon: '📅',
    category: 'Data',
    defaultData: { outputKey: 'now', format: 'iso' },
  },
  {
    type: 'crypto',
    label: 'Crypto',
    description: 'Hash a value (sha256 / md5)',
    icon: '🔐',
    category: 'Data',
    defaultData: {
      algorithm: 'sha256',
      value: '{{message}}',
      outputKey: 'hash',
    },
  },
  {
    type: 'html',
    label: 'HTML Extract',
    description: 'Pull text length / title from HTML string',
    icon: '📄',
    category: 'Data',
    defaultData: { field: 'htmlData', outputKey: 'htmlText' },
  },

  // ── Integrations ──
  {
    type: 'n8n',
    label: 'n8n Node',
    description: 'Delegate step to n8n',
    icon: '⚙️',
    category: 'Integrations',
    defaultData: { webhookPath: 'support-ticket' },
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
  return (
    type === 'webhook' ||
    type === 'schedule' ||
    type === 'chat_trigger' ||
    type === 'manual_trigger' ||
    type === 'rss'
  );
}

export function isConfigNode(type: NodeType): boolean {
  return type === 'chat_model' || type === 'memory' || type === 'tool';
}

export type {
  AiProviderChoice,
} from './llm-providers';
export {
  AI_PROVIDER_CHOICES,
  getLlmPreset,
  isAiProviderChoice,
  LLM_PROVIDER_PRESETS,
} from './llm-providers';
import {
  AiProviderChoice,
  getLlmPreset,
  isAiProviderChoice,
} from './llm-providers';

export function chatModelConfigForProvider(provider: AiProviderChoice): {
  label: string;
  data: Record<string, unknown>;
} {
  const preset = getLlmPreset(provider);
  return {
    label: `${preset.label} Chat Model`,
    data: { provider: preset.id, model: preset.defaultModel },
  };
}

export function readStoredAiProvider(): AiProviderChoice {
  try {
    const v = localStorage.getItem('wb-default-ai-provider');
    return isAiProviderChoice(v) ? v : 'openai';
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
  if (type === 'condition' || type === 'switch') return CONDITION_NODE_HEIGHT;
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

  if (type === 'switch') {
    return {
      inputs: [{ id: 'main', side: 'left', offsetY: 0.5, kind: 'flow' }],
      outputs: [
        { id: 'case0', label: '0', side: 'right', offsetY: 0.25, kind: 'flow' },
        { id: 'case1', label: '1', side: 'right', offsetY: 0.5, kind: 'flow' },
        { id: 'default', label: 'default', side: 'right', offsetY: 0.75, kind: 'flow' },
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
  // n8n-style: Sheets / Email (etc.) can attach as Agent Tool via top config port
  const canBeAgentTool =
    type === 'google_sheets' ||
    type === 'email' ||
    type === 'slack' ||
    type === 'http' ||
    type === 'telegram';

  return {
    inputs: isTrigger ? [] : [{ id: 'main', side: 'left', offsetY: 0.5, kind: 'flow' }],
    outputs: canBeAgentTool
      ? [
          { id: 'main', side: 'right', offsetY: 0.5, kind: 'flow' },
          { id: 'config', side: 'top', offsetX: 0.5, kind: 'config' },
        ]
      : [{ id: 'main', side: 'right', offsetY: 0.5, kind: 'flow' }],
  };
}

export function canAttachAsAgentTool(type: NodeType): boolean {
  return (
    type === 'google_sheets' ||
    type === 'email' ||
    type === 'slack' ||
    type === 'http' ||
    type === 'telegram'
  );
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
    manual_trigger: 'border-amber-300 bg-amber-50',
    schedule: 'border-amber-300 bg-amber-50',
    rss: 'border-amber-300 bg-amber-50',
    http: 'border-[#CDDBD9] bg-white',
    graphql: 'border-indigo-300 bg-indigo-50',
    email: 'border-[#CDDBD9] bg-white',
    slack: 'border-pink-300 bg-pink-50',
    discord: 'border-indigo-300 bg-indigo-50',
    telegram: 'border-sky-300 bg-sky-50',
    ai: 'border-[#9FE0DC] bg-[#F5FBFA]',
    ai_agent: 'border-[#2BBFBA]/40 bg-[#E6F7F6]',
    chat_model: 'border-sky-300 bg-sky-50',
    memory: 'border-[#9FE0DC] bg-[#E6F7F6]',
    tool: 'border-teal-300 bg-teal-50',
    condition: 'border-cyan-300 bg-cyan-50',
    switch: 'border-cyan-300 bg-cyan-50',
    delay: 'border-cyan-300 bg-cyan-50',
    code: 'border-cyan-300 bg-cyan-50',
    noop: 'border-[#CDDBD9] bg-white',
    stop_and_error: 'border-red-300 bg-red-50',
    set: 'border-violet-300 bg-violet-50',
    filter: 'border-violet-300 bg-violet-50',
    merge: 'border-violet-300 bg-violet-50',
    split_out: 'border-violet-300 bg-violet-50',
    aggregate: 'border-violet-300 bg-violet-50',
    datetime: 'border-violet-300 bg-violet-50',
    crypto: 'border-violet-300 bg-violet-50',
    html: 'border-violet-300 bg-violet-50',
    postgres: 'border-blue-300 bg-blue-50',
    respond_webhook: 'border-amber-300 bg-amber-50',
    n8n: 'border-[#9FE0DC] bg-[#E6F7F6]',
    spreadsheet: 'border-emerald-300 bg-emerald-50',
    google_sheets: 'border-green-400 bg-green-50',
    facebook: 'border-blue-400 bg-blue-50',
    instagram: 'border-pink-400 bg-pink-50',
    linkedin: 'border-sky-400 bg-sky-50',
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
    google_sheets: 'bg-green-100',
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
