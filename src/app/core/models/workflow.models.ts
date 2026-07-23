export type NodeType =
  | 'webhook'
  | 'chat_trigger'
  | 'manual_trigger'
  | 'http'
  | 'ai'
  | 'ai_agent'
  | 'chat_model'
  | 'memory'
  | 'tool'
  | 'email'
  | 'slack'
  | 'discord'
  | 'telegram'
  | 'condition'
  | 'switch'
  | 'delay'
  | 'code'
  | 'n8n'
  | 'schedule'
  | 'spreadsheet'
  | 'google_sheets'
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'linkedin'
  | 'set'
  | 'filter'
  | 'merge'
  | 'split_out'
  | 'aggregate'
  | 'noop'
  | 'stop_and_error'
  | 'respond_webhook'
  | 'graphql'
  | 'datetime'
  | 'crypto'
  | 'postgres'
  | 'rss'
  | 'html';

export const CONFIG_NODE_TYPES: NodeType[] = ['chat_model', 'memory', 'tool'];

export function isConfigNodeType(type: NodeType): boolean {
  return CONFIG_NODE_TYPES.includes(type);
}

export type ExecutionMode = 'LOCAL' | 'N8N' | 'HYBRID';

export interface NodePosition {
  x: number;
  y: number;
}

export interface CanvasNode {
  id: string;
  type: NodeType;
  label: string;
  icon: string;
  category: string;
  position: NodePosition;
  data: Record<string, unknown>;
}

/** Node shape sent to / received from backend API */
export interface ApiWorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  position: NodePosition;
  data: Record<string, unknown>;
}

export interface WorkflowConnection {
  from: string;
  to: string;
  output?: string;
  kind?: 'flow' | 'config';
  targetPort?: string;
}

export interface WorkflowDefinition {
  nodes: ApiWorkflowNode[];
  connections: WorkflowConnection[];
  settings?: Record<string, unknown>;
}

/** Editor canvas state includes UI metadata on nodes */
export interface EditorWorkflowDefinition {
  nodes: CanvasNode[];
  connections: WorkflowConnection[];
  settings?: Record<string, unknown>;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  description?: string;
  status: string;
  active: boolean;
  executionMode: ExecutionMode;
  n8nWorkflowId?: string | null;
  n8nWebhookPath?: string | null;
  definition?: WorkflowDefinition;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExecutionRecord {
  id: string;
  workflowId: string;
  status: string;
  engine: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  output?: Record<string, unknown>;
  triggerData?: Record<string, unknown>;
  workflow?: { id: string; name: string; executionMode?: string };
}

export interface NodeTypeInfo {
  type: NodeType;
  label: string;
}

export interface ExecutionStats {
  total: number;
  success: number;
  failed: number;
  running: number;
  todayCount: number;
  n8nRuns: number;
  localRuns: number;
  n8nConnected: boolean;
  successRate: string;
}

export interface AiProviderStatus {
  configured: boolean;
  source: string;
  maskedKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  free?: boolean;
  label?: string;
}

export interface LlmProviderPresetDto {
  id: string;
  label: string;
  kind?: string;
  free: boolean;
  needsKey: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  models: string[];
  hint: string;
}

export interface AiIntegrationStatus {
  openai: AiProviderStatus;
  gemini: AiProviderStatus;
  groq?: AiProviderStatus;
  openrouter?: AiProviderStatus;
  ollama?: AiProviderStatus;
  custom?: AiProviderStatus;
  providers?: Record<string, AiProviderStatus>;
  presets?: LlmProviderPresetDto[];
  defaultProvider?:
    | 'openai'
    | 'gemini'
    | 'groq'
    | 'openrouter'
    | 'ollama'
    | 'custom';
  demoMode: boolean;
  message: string;
}

export interface N8nHealth {
  connected: boolean;
  api: boolean;
  webhook: boolean;
}
