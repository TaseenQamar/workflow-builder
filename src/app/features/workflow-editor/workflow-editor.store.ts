import { Injectable, computed, signal } from '@angular/core';
import {
  CanvasNode,
  ExecutionMode,
  WorkflowConnection,
  WorkflowDefinition,
  ApiWorkflowNode,
} from '../../core/models/workflow.models';
import {
  NODE_CATALOG,
  NODE_HEIGHT,
  NODE_HORIZONTAL_GAP,
  NODE_WIDTH,
  NodeDefinition,
  createNodeFromDefinition,
  snapToGrid,
  getNodeWidth,
  chatModelConfigForProvider,
  readStoredAiProvider,
  storeAiProvider,
  AiProviderChoice,
} from '../../core/constants/node-definitions';
import { getLlmPreset } from '../../core/constants/llm-providers';
import { isConfigNodeType } from '../../core/models/workflow.models';
import { formatChatStamp } from '../../core/utils/chat-stamp';

@Injectable()
export class WorkflowEditorStore {
  readonly workflowId = signal<string | null>(null);
  readonly workflowName = signal('Untitled Workflow');
  readonly description = signal('');
  readonly executionMode = signal<ExecutionMode>('LOCAL');
  readonly active = signal(false);
  readonly nodes = signal<CanvasNode[]>([]);
  readonly connections = signal<WorkflowConnection[]>([]);
  readonly selectedNodeId = signal<string | null>(null);
  readonly connectSourceId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly running = signal(false);
  /** Live run UI: idle | running | success | error */
  readonly nodeRunStatus = signal<
    Record<string, 'idle' | 'running' | 'success' | 'error'>
  >({});
  readonly nodeRunError = signal<Record<string, string>>({});
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly chatMessages = signal<
    { id: string; role: 'user' | 'assistant' | 'error'; text: string; at: string }[]
  >([]);
  readonly chatInput = signal('');
  readonly chatPanelHighlight = signal(false);
  /** Stable per-conversation id for n8n-style Window Buffer Memory */
  readonly chatSessionId = signal<string>(crypto.randomUUID());
  /** Active saved chat thread id (per workflow) */
  readonly activeChatId = signal<string | null>(null);
  readonly chatThreads = signal<
    Array<{
      id: string;
      title: string;
      updatedAt: string;
      preview: string;
      messageCount: number;
    }>
  >([]);
  readonly chatTitle = signal('New chat');
  private chatPersistFn: (() => void) | null = null;
  private chatPersistTimer: ReturnType<typeof setTimeout> | null = null;
  readonly defaultAiProvider = signal<AiProviderChoice>(readStoredAiProvider());

  readonly hasChatTrigger = computed(() =>
    this.nodes().some((n) => n.type === 'chat_trigger'),
  );

  readonly selectedNode = computed(() => {
    const id = this.selectedNodeId();
    return this.nodes().find((n) => n.id === id) ?? null;
  });

  readonly isConnectMode = computed(() => this.connectSourceId() !== null);

  loadFromRecord(record: {
    id: string;
    name: string;
    description?: string | null;
    executionMode: ExecutionMode;
    active: boolean;
    definition?: WorkflowDefinition;
  }): void {
    this.workflowId.set(record.id);
    this.workflowName.set(record.name);
    this.description.set(record.description ?? '');
    this.executionMode.set(record.executionMode);
    this.active.set(record.active);
    this.nodes.set(
      (record.definition?.nodes ?? []).map((n) => this.apiNodeToCanvas(n)),
    );
    this.connections.set(record.definition?.connections ?? []);
    this.normalizeScheduleNodes();
    this.selectedNodeId.set(null);
    this.connectSourceId.set(null);
    // Keep canvas Chat Model in sync with Settings (saved WF may still say openai)
    this.applyDefaultProviderToChatModels();
  }

  reset(): void {
    this.workflowId.set(null);
    this.workflowName.set('Untitled Workflow');
    this.description.set('');
    this.executionMode.set('LOCAL');
    this.active.set(false);
    this.nodes.set([]);
    this.connections.set([]);
    this.selectedNodeId.set(null);
    this.connectSourceId.set(null);
  }

  toDefinition(): WorkflowDefinition {
    return {
      nodes: this.nodes(),
      connections: this.connections(),
    };
  }

  /** Strip UI-only fields before sending to backend API */
  toApiDefinition(): WorkflowDefinition {
    const connections =
      this.connections().length > 0
        ? this.connections()
        : this.computeAutoConnections();

    return {
      nodes: this.nodes().map(({ id, type, label, position, data }) => ({
        id,
        type,
        label,
        position,
        data: this.sanitizeNodeData(type, data),
      })),
      connections,
    };
  }

  private sanitizeNodeData(
    type: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    if (type !== 'spreadsheet') return { ...data };

    const { rowCol1, rowCol2, rowCol3, ...rest } = data;
    return {
      ...rest,
      row: {
        col1: String(rowCol1 ?? '{{name}}'),
        col2: String(rowCol2 ?? '{{value}}'),
        ...(rowCol3 ? { col3: String(rowCol3) } : {}),
      },
    };
  }

  ensureConnections(): void {
    const configConns = this.connections().filter((c) => c.kind === 'config');
    const flowConns = this.connections().filter((c) => c.kind !== 'config');
    const flowNodes = this.nodes().filter((n) => !isConfigNodeType(n.type));

    if (flowConns.length === 0 && flowNodes.length > 1) {
      this.connections.set([...configConns, ...this.computeAutoConnections()]);
    }
  }

  getAgentAttachmentStatus(agentId: string): {
    chatModel: boolean;
    memory: boolean;
    tool: boolean;
    flowInput: boolean;
  } {
    const conns = this.connections();
    return {
      chatModel: conns.some((c) => c.to === agentId && c.targetPort === 'chatModel'),
      memory: conns.some((c) => c.to === agentId && c.targetPort === 'memory'),
      tool: conns.some((c) => c.to === agentId && c.targetPort === 'tool'),
      flowInput: conns.some((c) => c.to === agentId && c.kind !== 'config'),
    };
  }

  /**
   * Attach Chat Model (always if missing).
   * Memory only when includeMemory=true (button / new template) —
   * never force Memory back after user deletes it.
   */
  attachAgentDefaults(
    agentId: string,
    opts?: { includeMemory?: boolean },
  ): void {
    const includeMemory = opts?.includeMemory === true;
    const agent = this.nodes().find((n) => n.id === agentId);
    if (!agent || agent.type !== 'ai_agent') return;

    const status = this.getAgentAttachmentStatus(agentId);
    const newNodes = [...this.nodes()];
    const newConns = [...this.connections()];
    let addedModel = false;
    let addedMemory = false;

    if (!status.chatModel) {
      const model = this.createChatModelNode({
        x: snapToGrid(agent.position.x + 20),
        y: snapToGrid(agent.position.y + 150),
      });
      newNodes.push(model);
      newConns.push({
        from: model.id,
        to: agentId,
        kind: 'config',
        targetPort: 'chatModel',
      });
      addedModel = true;
    }

    if (includeMemory && !status.memory) {
      const def = NODE_CATALOG.find((n) => n.type === 'memory')!;
      const mem = createNodeFromDefinition(def, {
        x: snapToGrid(agent.position.x + 120),
        y: snapToGrid(agent.position.y + 150),
      });
      newNodes.push(mem);
      newConns.push({
        from: mem.id,
        to: agentId,
        kind: 'config',
        targetPort: 'memory',
      });
      addedMemory = true;
    }

    if (!addedModel && !addedMemory) return;

    this.nodes.set(newNodes);
    this.connections.set(newConns);
    const p = this.defaultAiProvider();
    this.message.set(
      addedMemory
        ? `Attached ${chatModelConfigForProvider(p).label} + Memory to AI Agent`
        : `Attached ${chatModelConfigForProvider(p).label} to AI Agent`,
    );
  }

  /** True when AI Agent has Window Buffer Memory wired. */
  hasMemoryAttached(): boolean {
    const agent = this.nodes().find((n) => n.type === 'ai_agent');
    if (!agent) return false;
    return this.getAgentAttachmentStatus(agent.id).memory;
  }

  validateWorkflowForRun(): string[] {
    const errors: string[] = [];
    const nodes = this.nodes();
    const conns = this.connections();

    if (!nodes.length) {
      errors.push('Workflow is empty — add nodes first');
      return errors;
    }

    const hasTrigger = nodes.some(
      (n) =>
        n.type === 'webhook' ||
        n.type === 'chat_trigger' ||
        n.type === 'schedule' ||
        n.type === 'manual_trigger' ||
        n.type === 'rss',
    );
    if (!hasTrigger) {
      errors.push('Add a trigger: Chat, Webhook, Manual, Schedule, or RSS');
    }

    for (const agent of nodes.filter((n) => n.type === 'ai_agent')) {
      const status = this.getAgentAttachmentStatus(agent.id);
      if (!status.chatModel) {
        errors.push(
          `AI Agent "${agent.label}": Chat Model not attached — click "Attach Model + Memory"`,
        );
      }
      if (!status.flowInput) {
        errors.push(
          `AI Agent "${agent.label}": not connected to trigger — drag wire from Chat → Agent`,
        );
      }
    }

    const flowConns = conns.filter((c) => c.kind !== 'config');
    const flowNodes = nodes.filter((n) => !isConfigNodeType(n.type));
    if (flowNodes.length > 1 && flowConns.length === 0) {
      errors.push(
        'Connect your nodes — drag wires from Chat to HTTP / AI Agent (left → right)',
      );
    }

    return errors;
  }

  /** Ready canvas for Chat run without destroying custom flow wires. */
  ensureChatWorkflow(): void {
    if (this.nodes().length === 0) {
      this.insertChatAgentTemplate(false);
      return;
    }

    const agent = this.nodes().find((n) => n.type === 'ai_agent');
    if (agent) {
      // Chat Model hi auto-attach — Memory user delete kare to wapas mat lao
      this.attachAgentDefaults(agent.id, { includeMemory: false });
    }
    this.applyDefaultProviderToChatModels();

    // Only auto-wire when user has not drawn any flow connections yet
    const hasFlow = this.connections().some((c) => c.kind !== 'config');
    if (!hasFlow) {
      this.ensureConnections();
    }

    if (this.executionMode() === 'N8N') {
      this.executionMode.set('LOCAL');
    }
  }

  /**
   * Keep n8n-style wiring without rewriting the whole canvas:
   * - Schedule/Chat → AI Agent (flow)
   * - Sheets / Facebook / LinkedIn / … → Agent Tool port only
   * If tools are already correctly wired, leave connections alone.
   */
  ensureAgentToolWiring(): void {
    const nodes = this.nodes();
    const chat = nodes.find((n) => n.type === 'chat_trigger');
    const schedule = nodes.find((n) => n.type === 'schedule');
    const agent = nodes.find((n) => n.type === 'ai_agent');
    if (!agent) return;
    if (!chat && !schedule) return;

    const toolTypes = new Set([
      'google_sheets',
      'email',
      'slack',
      'linkedin',
      'facebook',
      'instagram',
      'telegram',
      'discord',
    ]);
    const toolNodes = nodes.filter((n) => toolTypes.has(n.type));

    let conns = [...this.connections()];
    let changed = false;

    const hasFlow = (from: string, to: string) =>
      conns.some(
        (c) => c.from === from && c.to === to && c.kind !== 'config',
      );
    const isAgentTool = (nodeId: string) =>
      conns.some(
        (c) =>
          c.from === nodeId &&
          c.to === agent.id &&
          c.kind === 'config' &&
          c.targetPort === 'tool',
      );

    if (schedule && !hasFlow(schedule.id, agent.id)) {
      conns.push({
        from: schedule.id,
        to: agent.id,
        output: 'main',
        kind: 'flow',
      });
      changed = true;
    }
    if (chat && !hasFlow(chat.id, agent.id)) {
      conns.push({
        from: chat.id,
        to: agent.id,
        output: 'main',
        kind: 'flow',
      });
      changed = true;
    }

    for (const t of toolNodes) {
      const onMain = conns.some(
        (c) =>
          c.kind !== 'config' && (c.from === t.id || c.to === t.id),
      );
      if (!isAgentTool(t.id)) {
        // Move onto Agent Tool port (remove main-flow wires into/out of this node)
        conns = conns.filter(
          (c) =>
            !(c.kind !== 'config' && (c.from === t.id || c.to === t.id)),
        );
        conns.push({
          from: t.id,
          to: agent.id,
          kind: 'config',
          targetPort: 'tool',
        });
        changed = true;
      } else if (onMain) {
        // Already a tool — drop duplicate main-flow wires only
        conns = conns.filter(
          (c) =>
            !(c.kind !== 'config' && (c.from === t.id || c.to === t.id)),
        );
        changed = true;
      }
    }

    // Schedule: Sheets must queue next unposted row (clear sticky chat row pin)
    if (schedule) {
      for (const s of toolNodes.filter((n) => n.type === 'google_sheets')) {
        this.nodes.update((list) =>
          list.map((n) =>
            n.id === s.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    operation: 'read_next_daily',
                    dailyPickMode: 'unposted',
                    requestedDataRow: '',
                    requireAgent: 'false',
                    requireChatIntent: 'false',
                  },
                }
              : n,
          ),
        );
      }
    }

    if (changed) this.connections.set(conns);
  }

  /** Alias — keeps Facebook/Sheets on AI Agent Tool port without full canvas rewrite. */
  ensureAgentCentricFlow(): void {
    this.ensureAgentToolWiring();
  }

  /**
   * Chat panel conversation requires an AI Agent.
   * If Chat → Sheets is wired directly, insert Agent in between and fix wires.
   */
  ensureConversationAgent(): void {
    const nodes = this.nodes();
    const chat = nodes.find((n) => n.type === 'chat_trigger');
    if (!chat) return;

    let agent = nodes.find((n) => n.type === 'ai_agent');
    if (!agent) {
      agent = createNodeFromDefinition(
        NODE_CATALOG.find((n) => n.type === 'ai_agent')!,
        {
          x: snapToGrid(chat.position.x + NODE_WIDTH + NODE_HORIZONTAL_GAP),
          y: snapToGrid(chat.position.y - 20),
        },
      );
      this.nodes.update((list) => [...list, agent!]);
      this.message.set('AI Agent added — chat will reply too');
      // New agent: attach model + memory (first time only)
      this.attachAgentDefaults(agent.id, { includeMemory: true });
    } else {
      // Existing agent: fill missing model; do not re-add deleted memory
      this.attachAgentDefaults(agent.id, { includeMemory: false });
    }

    const conns = this.connections();
    const chatToAgent = conns.some(
      (c) => c.from === chat.id && c.to === agent!.id && c.kind !== 'config',
    );
    if (!chatToAgent) {
      // Move actions previously attached to Chat to after the Agent
      const fromChat = conns.filter(
        (c) => c.from === chat.id && c.kind !== 'config' && c.to !== agent!.id,
      );
      this.connections.update((list) => {
        let next = list.filter(
          (c) =>
            !(c.from === chat.id && c.kind !== 'config' && c.to !== agent!.id),
        );
        next = [
          ...next.filter(
            (c) =>
              !(
                c.from === chat.id &&
                c.to === agent!.id &&
                c.kind !== 'config'
              ),
          ),
          {
            from: chat.id,
            to: agent!.id,
            output: 'main',
            kind: 'flow' as const,
          },
        ];
        for (const c of fromChat) {
          next.push({
            from: agent!.id,
            to: c.to,
            output: c.output ?? 'main',
            kind: 'flow',
          });
        }
        return next;
      });
    }
  }

  /**
   * Natural language → canvas build.
   * Returns assistant reply when it handled a "build connection" request; else null.
   */
  tryBuildFlowFromChat(message: string): string | null {
    const text = message.trim();
    if (!text) return null;

    const wantsBuild =
      /\b(connection|connections|workflow|flow|pipeline)\b/i.test(text) &&
      /\b(bana|banao|bana\s*do|bana\s*ke|create|build|wire|connect|laga|lagao)\b/i.test(
        text,
      );
    const wantsPromptFlow =
      /\bprompt\b/i.test(text) &&
      /\b(sheet|excel|email|mail)\b/i.test(text) &&
      /\b(bana|banao|update|chale|jaen|jaye|ho)\b/i.test(text);
    const wantsSheetEmail =
      /\b(sheet|excel)\b/i.test(text) &&
      /\b(email|mail|e-mail)\b/i.test(text) &&
      /\b(bana|banao|connect|flow|workflow|chale|jae|jaye)\b/i.test(text);

    if (!wantsBuild && !wantsPromptFlow && !wantsSheetEmail) return null;

    const wantsSheet = /\b(sheet|excel|spreadsheet|google\s*sheet)\b/i.test(text);
    const wantsEmail = /\b(email|e-mail|\bmail\b)\b/i.test(text);
    const wantsSlack = /\bslack\b/i.test(text);
    const wantsHttp = /\b(http|api|webhook)\b/i.test(text);

    const flowTypes: string[] = ['chat_trigger', 'ai_agent'];
    if (wantsSheet) flowTypes.push('google_sheets');
    if (wantsEmail) flowTypes.push('email');
    if (wantsSlack) flowTypes.push('slack');
    if (wantsHttp && !wantsSheet) flowTypes.push('http');

    // Default example: prompt → sheet + email
    if (flowTypes.length === 2 && (wantsPromptFlow || wantsBuild)) {
      flowTypes.push('google_sheets', 'email');
    }

    this.applyLinearChatFlow(flowTypes);

    const labels = flowTypes
      .map((t) => NODE_CATALOG.find((d) => d.type === t)?.label ?? t)
      .join(' → ');

    return (
      `Done — I built this connection on the canvas:\n\n` +
      `${labels}\n\n` +
      `Next steps:\n` +
      `1) In the Google Sheets node, set Document + Dry Run=false\n` +
      `2) In the Email node, fill the "to" address\n` +
      `3) Then type a prompt in chat — AI will run, and sheet update / email follow that flow.\n\n` +
      `Need another flow? Say e.g. "Create Chat → AI → Slack".`
    );
  }

  /** n8n-style build: Chat → Agent; Sheets/Email on Agent Tool port. */
  applyLinearChatFlow(flowTypes: string[]): void {
    this.executionMode.set('LOCAL');
    const startX = 80;
    const y = 200;
    const gap = NODE_WIDTH + NODE_HORIZONTAL_GAP;
    const newNodes: CanvasNode[] = [];
    const newConns: WorkflowConnection[] = [];
    let agentId: string | null = null;
    let chatId: string | null = null;
    let x = startX;

    const mainTypes = flowTypes.filter(
      (t) => t === 'chat_trigger' || t === 'ai_agent',
    );
    const toolTypes = flowTypes.filter(
      (t) => t === 'google_sheets' || t === 'email',
    );

    for (const type of mainTypes) {
      const def = NODE_CATALOG.find((d) => d.type === type);
      if (!def) continue;
      const node = createNodeFromDefinition(def, {
        x: snapToGrid(x),
        y: snapToGrid(y),
      });
      if (type === 'chat_trigger') chatId = node.id;
      if (type === 'ai_agent') {
        agentId = node.id;
        node.data = {
          ...node.data,
          instructions:
            'You are the Cluster Valley AI guide for this workflow. Always reply in the user\'s language. Explain product + this canvas flow when asked. For hi/hello/thanks/small talk: reply only — do NOT call tools. Use google_sheets / send_email / send_slack only when the user clearly asks in this message. After a successful sheet write, also notify email/Slack if attached. Never invent Apps Script.',
        };
      }
      newNodes.push(node);
      x += gap;
    }

    if (chatId && agentId) {
      newConns.push({
        from: chatId,
        to: agentId,
        output: 'main',
        kind: 'flow',
      });
    }

    let toolX = (agentId
      ? (newNodes.find((n) => n.id === agentId)?.position.x ?? startX)
      : startX) + 40;
    const toolY = y + 180;
    for (const type of toolTypes) {
      const def = NODE_CATALOG.find((d) => d.type === type);
      if (!def || !agentId) continue;
      const node = createNodeFromDefinition(def, {
        x: snapToGrid(toolX),
        y: snapToGrid(toolY),
      });
      if (type === 'google_sheets') {
        node.data = {
          ...node.data,
          operation: 'append',
          dryRun: 'false',
          requireChatIntent: 'false',
          requireAgent: 'false',
          lookupColumn: '',
          lookupValue: '*',
          matchMode: 'first',
        };
      }
      if (type === 'email') {
        node.data = {
          ...node.data,
          to: '',
          subject: '{{emailSubject}}',
          body: '{{emailNotifyBody}}',
        };
      }
      newNodes.push(node);
      newConns.push({
        from: node.id,
        to: agentId,
        kind: 'config',
        targetPort: 'tool',
      });
      toolX += gap * 0.85;
    }

    if (agentId) {
      const agent = newNodes.find((n) => n.id === agentId)!;
      const model = this.createChatModelNode({
        x: snapToGrid(agent.position.x + 40),
        y: snapToGrid(agent.position.y + 160),
      });
      const memory = createNodeFromDefinition(
        NODE_CATALOG.find((n) => n.type === 'memory')!,
        {
          x: snapToGrid(agent.position.x + 140),
          y: snapToGrid(agent.position.y + 160),
        },
      );
      // Place model/memory left of tools if tools occupy bottom
      model.position = {
        x: snapToGrid(agent.position.x - 20),
        y: snapToGrid(agent.position.y + 160),
      };
      memory.position = {
        x: snapToGrid(agent.position.x + 80),
        y: snapToGrid(agent.position.y + 160),
      };
      newNodes.push(model, memory);
      newConns.push(
        {
          from: model.id,
          to: agentId,
          kind: 'config',
          targetPort: 'chatModel',
        },
        {
          from: memory.id,
          to: agentId,
          kind: 'config',
          targetPort: 'memory',
        },
      );
    }

    this.nodes.set(newNodes);
    this.connections.set(newConns);
    this.workflowName.set('n8n Tools Agent flow');
    this.description.set('Chat → AI Agent; Sheets/Email as Agent tools');
    this.selectedNodeId.set(agentId);
    this.applyDefaultProviderToChatModels();
  }

  setDefaultAiProvider(provider: AiProviderChoice): void {
    this.defaultAiProvider.set(provider);
    storeAiProvider(provider);
    this.applyDefaultProviderToChatModels();
  }

  applyDefaultProviderToChatModels(): void {
    const provider = this.defaultAiProvider();
    const cfg = chatModelConfigForProvider(provider);
    const presetModels = new Set(
      (getLlmPreset(provider).models ?? []).map(String),
    );

    this.nodes.update((list) =>
      list.map((n) => {
        if (n.type === 'chat_model') {
          const currentProvider = String(n.data['provider'] ?? '').trim();
          const currentModel = String(n.data['model'] ?? '').trim();
          // Keep a valid model already set for this provider (don't wipe llama → gpt-oss on every Save)
          const sameProvider = currentProvider === provider;
          const modelOk =
            !!currentModel &&
            (presetModels.size === 0 ||
              presetModels.has(currentModel) ||
              currentModel.includes('/'));
          if (sameProvider && modelOk) {
            return {
              ...n,
              label: cfg.label,
              data: { ...n.data, provider },
            };
          }
          return {
            ...n,
            label: cfg.label,
            data: { ...n.data, ...cfg.data },
          };
        }
        if (n.type === 'ai' || n.type === 'ai_agent') {
          return { ...n, data: { ...n.data, provider } };
        }
        return n;
      }),
    );
  }

  private createChatModelNode(position: { x: number; y: number }): CanvasNode {
    const def = NODE_CATALOG.find((n) => n.type === 'chat_model')!;
    const cfg = chatModelConfigForProvider(this.defaultAiProvider());
    const node = createNodeFromDefinition(def, position);
    return { ...node, label: cfg.label, data: { ...node.data, ...cfg.data } };
  }

  addChatMessage(role: 'user' | 'assistant' | 'error', text: string): void {
    const tz =
      String(
        this.nodes().find((n) => n.type === 'schedule')?.data['timezone'] ??
          'Asia/Karachi',
      ) || 'Asia/Karachi';
    this.chatMessages.update((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        role,
        text,
        at: formatChatStamp(new Date(), tz),
      },
    ]);
    // Auto-title from first user message
    if (role === 'user' && this.chatTitle() === 'New chat') {
      this.chatTitle.set(text.slice(0, 48).trim() || 'New chat');
    }
    this.queueChatPersist();
  }

  registerChatPersist(fn: (() => void) | null): void {
    this.chatPersistFn = fn;
  }

  private queueChatPersist(): void {
    if (this.chatPersistTimer) clearTimeout(this.chatPersistTimer);
    this.chatPersistTimer = setTimeout(() => this.chatPersistFn?.(), 700);
  }

  setActiveChat(
    chatId: string | null,
    messages: Array<{
      id: string;
      role: 'user' | 'assistant' | 'error';
      text: string;
      at?: string;
    }>,
    sessionKey?: string,
    title?: string,
  ): void {
    this.activeChatId.set(chatId);
    this.chatMessages.set(
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        at: m.at || formatChatStamp(new Date()),
      })),
    );
    this.chatTitle.set(title?.trim() || 'New chat');
    if (sessionKey) this.chatSessionId.set(sessionKey);
    else if (chatId && this.workflowId()) {
      this.chatSessionId.set(`wf:${this.workflowId()}:t:${chatId}`);
    }
  }

  clearNodeRunStatuses(): void {
    this.nodeRunStatus.set({});
    this.nodeRunError.set({});
  }

  setNodeRunStatus(
    nodeId: string,
    status: 'idle' | 'running' | 'success' | 'error',
    error?: string,
  ): void {
    this.nodeRunStatus.update((m) => ({ ...m, [nodeId]: status }));
    if (status === 'error' && error) {
      this.nodeRunError.update((m) => ({ ...m, [nodeId]: error }));
    }
  }

  /** Wire selected / given node onto AI Agent Tool port (n8n-style). */
  attachNodeAsAgentTool(nodeId?: string): string | null {
    const id = nodeId ?? this.selectedNodeId();
    const node = this.nodes().find((n) => n.id === id);
    const agent = this.nodes().find((n) => n.type === 'ai_agent');
    if (!node || !agent) {
      return 'Add an AI Agent to the canvas first, then select Sheets/Email and click Attach';
    }
    if (
      !['google_sheets', 'email', 'slack', 'http', 'telegram'].includes(
        node.type,
      )
    ) {
      return 'This node cannot be attached as a Tool';
    }
    this.addConfigConnection(node.id, agent.id, 'tool');
    // Remove main-chain wires into/out of this tool node
    this.connections.update((list) =>
      list.filter(
        (c) =>
          !(
            c.kind !== 'config' &&
            (c.from === node.id || c.to === node.id)
          ),
      ),
    );
    this.message.set(`${node.label} → AI Agent Tool connected ✓`);
    return null;
  }

  /** Start a fresh chat session (clears UI + new memory session key). */
  newChatSession(): void {
    this.chatMessages.set([]);
    this.chatInput.set('');
    this.chatSessionId.set(crypto.randomUUID());
    this.activeChatId.set(null);
    this.chatTitle.set('New chat');
    this.message.set('New chat — memory cleared for this session');
    this.error.set(null);
  }

  /** History for the AI agent (user/assistant turns only). */
  chatHistoryForAgent(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.chatMessages()
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }));
  }

  private computeAutoConnections(): WorkflowConnection[] {
    const sorted = [...this.nodes()]
      .filter((n) => !isConfigNodeType(n.type))
      .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
    const connections: WorkflowConnection[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      connections.push({
        from: sorted[i].id,
        to: sorted[i + 1].id,
        output: 'main',
        kind: 'flow',
      });
    }
    return connections;
  }

  addNode(
    def: NodeDefinition,
    position: { x: number; y: number },
    connectFrom?: { nodeId: string; outputPort?: string },
  ): void {
    const node = createNodeFromDefinition(def, position);
    const existing = this.nodes();
    this.nodes.set([...existing, node]);

    if (connectFrom) {
      this.addConnection(connectFrom.nodeId, node.id, connectFrom.outputPort ?? 'main');
    } else {
      const left = this.findNodeToLeft(position, node.id, existing);
      if (left) {
        this.addConnection(left.nodeId, node.id, left.outputPort);
      }
    }

    this.selectedNodeId.set(node.id);

    if (def.type === 'chat_trigger') {
      this.chatPanelHighlight.set(true);
      setTimeout(() => this.chatPanelHighlight.set(false), 3000);
    }
  }

  addNodeAfter(
    def: NodeDefinition,
    fromId: string,
    outputPort = 'main',
  ): void {
    const from = this.nodes().find((n) => n.id === fromId);
    if (!from) return;

    const yOffset = outputPort === 'false' ? 96 : outputPort === 'true' ? -32 : 0;
    this.addNode(
      def,
      {
        x: snapToGrid(from.position.x + NODE_WIDTH + NODE_HORIZONTAL_GAP),
        y: snapToGrid(from.position.y + yOffset),
      },
      { nodeId: fromId, outputPort },
    );
  }

  private findNodeToLeft(
    position: { x: number; y: number },
    newId: string,
    nodes: CanvasNode[],
  ): { nodeId: string; outputPort: string } | null {
    const newCenterX = position.x + NODE_WIDTH / 2;
    const candidates = nodes.filter(
      (n) =>
        n.id !== newId &&
        !isConfigNodeType(n.type) &&
        n.position.x + getNodeWidth(n.type) <= newCenterX + 12 &&
        Math.abs(n.position.y - position.y) < NODE_HEIGHT * 2,
    );
    const left = candidates.sort((a, b) => b.position.x - a.position.x)[0];
    if (!left) return null;

    const outputPort =
      left.type === 'condition' && position.y > left.position.y + NODE_HEIGHT / 2
        ? 'false'
        : left.type === 'condition'
          ? 'true'
          : 'main';

    return { nodeId: left.id, outputPort };
  }

  updateNodePosition(id: string, position: { x: number; y: number }): void {
    this.nodes.update((list) =>
      list.map((n) => (n.id === id ? { ...n, position } : n)),
    );
  }

  updateNodeData(id: string, data: Record<string, unknown>): void {
    this.nodes.update((list) =>
      list.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
    );
  }

  updateNodeLabel(id: string, label: string): void {
    this.nodes.update((list) =>
      list.map((n) => (n.id === id ? { ...n, label } : n)),
    );
  }

  removeNode(id: string): void {
    this.nodes.update((list) => list.filter((n) => n.id !== id));
    this.connections.update((list) =>
      list.filter((c) => c.from !== id && c.to !== id),
    );
    if (this.selectedNodeId() === id) this.selectedNodeId.set(null);
    if (this.connectSourceId() === id) this.connectSourceId.set(null);
  }

  selectNode(id: string | null): void {
    this.selectedNodeId.set(id);
  }

  toggleConnectMode(nodeId: string): void {
    const source = this.connectSourceId();
    if (!source) {
      this.connectSourceId.set(nodeId);
      return;
    }
    if (source === nodeId) {
      this.connectSourceId.set(null);
      return;
    }
    this.addConnection(source, nodeId);
    this.connectSourceId.set(null);
  }

  addConnection(from: string, to: string, output = 'main'): void {
    if (from === to) return;

    this.connections.update((list) => {
      const withoutSameOutput = list
        .filter((c) => c.kind !== 'config')
        .filter((c) => !(c.from === from && (c.output ?? 'main') === output));
      return [...withoutSameOutput, { from, to, output, kind: 'flow' }];
    });
  }

  addConfigConnection(from: string, to: string, targetPort: string): void {
    if (from === to) return;

    this.connections.update((list) => {
      // n8n: multiple Tools allowed on tool port; chatModel/memory stay single
      const filtered =
        targetPort === 'tool'
          ? list.filter(
              (c) =>
                !(
                  c.kind === 'config' &&
                  c.from === from &&
                  c.to === to &&
                  c.targetPort === targetPort
                ),
            )
          : list.filter(
              (c) =>
                !(
                  c.kind === 'config' &&
                  c.to === to &&
                  c.targetPort === targetPort
                ),
            );
      return [...filtered, { from, to, kind: 'config', targetPort }];
    });
  }

  /** n8n-style starter: Chat → AI Agent + attached model & memory */
  insertChatAgentTemplate(resetWorkflow = true): void {
    if (resetWorkflow) {
      this.reset();
      this.workflowName.set('Chat AI Agent');
      this.description.set('Chat message → AI Agent with model & memory');
    }
    this.executionMode.set('LOCAL');

    const chat = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'chat_trigger')!,
      { x: 80, y: 200 },
    );
    const agent = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'ai_agent')!,
      { x: 80 + NODE_WIDTH + NODE_HORIZONTAL_GAP, y: 180 },
    );
    const model = this.createChatModelNode({
      x: 80 + NODE_WIDTH + NODE_HORIZONTAL_GAP + 40,
      y: 180 + 160,
    });
    const memory = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'memory')!,
      { x: 80 + NODE_WIDTH + NODE_HORIZONTAL_GAP + 140, y: 180 + 160 },
    );

    this.nodes.set([chat, agent, model, memory]);
    this.connections.set([
      { from: chat.id, to: agent.id, output: 'main', kind: 'flow' },
      { from: model.id, to: agent.id, kind: 'config', targetPort: 'chatModel' },
      { from: memory.id, to: agent.id, kind: 'config', targetPort: 'memory' },
    ]);
  }

  /**
   * Daily / timed flow: Schedule → Slack (main wire).
   * Save + keep workflow Active so backend cron can run it.
   */
  insertScheduleSlackTemplate(resetWorkflow = true): void {
    if (resetWorkflow) {
      this.reset();
      this.workflowName.set('Daily Slack Notify');
      this.description.set(
        'Schedule trigger → Slack channel message (save + Active for cron)',
      );
    }
    this.executionMode.set('LOCAL');
    this.active.set(true);

    const schedule = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'schedule')!,
      { x: 80, y: 200 },
    );
    schedule.data = {
      ...schedule.data,
      interval: 'daily',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Karachi',
      cron: '0 9 * * *',
    };

    const slack = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'slack')!,
      { x: 80 + NODE_WIDTH + NODE_HORIZONTAL_GAP, y: 200 },
    );
    slack.data = {
      ...slack.data,
      channel: '#general',
      message: 'Good morning — scheduled check-in from Cluster Valley AI',
    };

    this.nodes.set([schedule, slack]);
    this.connections.set([
      { from: schedule.id, to: slack.id, output: 'main', kind: 'flow' },
    ]);
    this.selectedNodeId.set(schedule.id);
    this.message.set(
      'Schedule → Slack ready. Set time + channel, Save, keep Active on.',
    );
  }

  /**
   * Daily Google Sheet row → Slack (+ optional ImagePrompt column).
   * Day 1 posts row 1, day 2 posts row 2, … (unposted queue).
   */
  insertScheduleDailySheetSlackTemplate(resetWorkflow = true): void {
    this.insertScheduleDailySheetSocialTemplate('slack', resetWorkflow);
  }

  /**
   * Same daily sheet queue, swap last node: slack | facebook | Instagram | telegram | discord | linkedin
   */
  insertScheduleDailySheetSocialTemplate(
    socialType:
      | 'slack'
      | 'facebook'
      | 'instagram'
      | 'telegram'
      | 'discord'
      | 'linkedin' = 'slack',
    resetWorkflow = true,
  ): void {
    const def = NODE_CATALOG.find((n) => n.type === socialType);
    if (!def) {
      this.message.set(`Unknown social type: ${socialType}`);
      return;
    }

    const labels: Record<string, string> = {
      slack: 'Slack',
      facebook: 'Facebook',
      instagram: 'Instagram',
      telegram: 'Telegram',
      discord: 'Discord',
      linkedin: 'LinkedIn',
    };
    const socialLabel = labels[socialType] ?? def.label;

    if (resetWorkflow) {
      this.reset();
      this.workflowName.set(`Daily Sheet → ${socialLabel}`);
      this.description.set(
        `Each day: next Google Sheet row → ${socialLabel} (Message | ImagePrompt | Post)`,
      );
    }
    this.executionMode.set('LOCAL');
    this.active.set(true);

    const gap = NODE_WIDTH + NODE_HORIZONTAL_GAP;
    const schedule = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'schedule')!,
      { x: 80, y: 200 },
    );
    schedule.data = {
      ...schedule.data,
      interval: 'daily',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Karachi',
      cron: '0 9 * * *',
    };

    const sheets = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'google_sheets')!,
      { x: 80 + gap, y: 200 },
    );
    sheets.data = {
      ...sheets.data,
      operation: 'read_next_daily',
      dailyPickMode: 'unposted',
      postStatusColumn: 'Post',
      messageColumn: 'Message',
      imagePromptColumn: 'ImagePrompt',
      requireAgent: 'false',
      requireChatIntent: 'false',
      dryRun: 'false',
      spreadsheetId: '',
      sheetName: '',
    };

    const social = createNodeFromDefinition(def, {
      x: 80 + gap * 2,
      y: 200,
    });
    // Sensible defaults for daily sheet → social
    if (socialType === 'slack') {
      social.data = {
        ...social.data,
        channel: '#general',
        message: '{{message}}',
        generateImage: 'false',
      };
    } else if (socialType === 'facebook') {
      social.data = {
        ...social.data,
        message: '{{message}}',
        captionColumn: 'Message',
        imagePromptColumn: 'ImagePrompt',
        imageUrl: '{{imageUrl}}',
        imagePrompt: '{{imagePrompt}}',
        link: '{{link}}',
        dryRun: 'false',
      };
    } else if (socialType === 'instagram') {
      social.data = {
        ...social.data,
        caption: '{{message}}',
        imageUrl: '{{imageUrl}}',
        dryRun: 'false',
      };
    } else if (socialType === 'telegram') {
      social.data = {
        ...social.data,
        text: '{{message}}',
      };
    } else if (socialType === 'discord') {
      social.data = {
        ...social.data,
        content: '{{message}}',
      };
    } else if (socialType === 'linkedin') {
      social.data = {
        ...social.data,
        text: '{{message}}',
        captionColumn: 'Message',
        imagePromptColumn: 'ImagePrompt',
        imageUrl: '{{imageUrl}}',
        imagePrompt: '{{imagePrompt}}',
        dryRun: 'false',
      };
    }

    this.nodes.set([schedule, sheets, social]);
    this.connections.set([
      { from: schedule.id, to: sheets.id, output: 'main', kind: 'flow' },
      { from: sheets.id, to: social.id, output: 'main', kind: 'flow' },
    ]);
    this.selectedNodeId.set(social.id);
    this.message.set(
      `Schedule → Sheets → ${socialLabel} ready. Set sheet URL + ${socialLabel} credentials, then Save.`,
    );
  }

  /**
   * Replace the last social node in an existing Schedule → Sheets → Social flow.
   */
  swapDailySheetSocialTarget(
    socialType:
      | 'slack'
      | 'facebook'
      | 'instagram'
      | 'telegram'
      | 'discord'
      | 'linkedin',
  ): void {
    const nodes = this.nodes();
    const sheets = nodes.find((n) => n.type === 'google_sheets');
    const social = nodes.find((n) =>
      ['slack', 'facebook', 'instagram', 'telegram', 'discord', 'linkedin'].includes(
        n.type,
      ),
    );
    if (!sheets || !social) {
      this.insertScheduleDailySheetSocialTemplate(socialType, true);
      return;
    }
    // Rebuild keeping sheet settings
    const sheetData = { ...sheets.data };
    const scheduleNode = nodes.find((n) => n.type === 'schedule');
    const scheduleData = scheduleNode ? { ...scheduleNode.data } : null;

    this.insertScheduleDailySheetSocialTemplate(socialType, true);
    this.nodes.update((list) =>
      list.map((n) => {
        if (n.type === 'google_sheets') {
          return { ...n, data: { ...n.data, ...sheetData } };
        }
        if (n.type === 'schedule' && scheduleData) {
          return { ...n, data: { ...n.data, ...scheduleData } };
        }
        return n;
      }),
    );
    this.message.set(
      `Switched target to ${socialType}. Keep sheet settings; fill ${socialType} credentials, then Save.`,
    );
  }

  /**
   * Schedule → AI Agent; Sheets + Social as Agent tools (LLM drives everything).
   * Agent Schedule Prompt → google_sheets → linkedin/slack/…
   */
  insertScheduleAgentDailySheetTemplate(
    resetWorkflow = true,
    socialType:
      | 'slack'
      | 'facebook'
      | 'instagram'
      | 'telegram'
      | 'discord'
      | 'linkedin' = 'linkedin',
  ): void {
    const socialLabel: Record<string, string> = {
      slack: 'Slack',
      facebook: 'Facebook',
      instagram: 'Instagram',
      telegram: 'Telegram',
      discord: 'Discord',
      linkedin: 'LinkedIn',
    };
    const label = socialLabel[socialType] ?? 'Social';
    const toolName =
      socialType === 'slack'
        ? 'send_slack'
        : socialType === 'linkedin'
          ? 'linkedin'
          : socialType;

    if (resetWorkflow) {
      this.reset();
      this.workflowName.set(`Daily Sheet via Agent → ${label}`);
      this.description.set(
        `Schedule → AI Agent (LLM); tools: Sheets + ${label}`,
      );
    }
    this.executionMode.set('LOCAL');
    this.active.set(true);

    const gap = NODE_WIDTH + NODE_HORIZONTAL_GAP;
    const schedule = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'schedule')!,
      { x: 80, y: 200 },
    );
    schedule.data = {
      ...schedule.data,
      interval: 'daily',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Karachi',
      cron: '0 9 * * *',
    };

    const agent = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'ai_agent')!,
      { x: 80 + gap, y: 160 },
    );
    agent.data = {
      ...agent.data,
      instructions:
        'You are the automation brain for this workflow. On schedule and in chat: use attached tools to read Google Sheets and post to social. Never invent data. If ImagePrompt exists, always pass imagePrompt to the social tool so an image is generated and posted.',
      scheduledPrompt: `Daily job (no chat): 1) Call google_sheets to load today's next unposted row (Message + optional ImagePrompt). 2) Call ${toolName} with that Message as message/caption. 3) If ImagePrompt is present, pass it as imagePrompt so an AI image is generated and posted with the caption. Do not ask questions. Do not wait for a user.`,
    };

    const model = this.createChatModelNode({
      x: 80 + gap + 40,
      y: 160 + 170,
    });

    const sheets = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'google_sheets')!,
      { x: 80 + gap + 200, y: 380 },
    );
    sheets.data = {
      ...sheets.data,
      operation: 'read_next_daily',
      dailyPickMode: 'unposted',
      postStatusColumn: 'Post',
      messageColumn: 'Message',
      imagePromptColumn: 'ImagePrompt',
      requireAgent: 'false',
      requireChatIntent: 'false',
      dryRun: 'false',
      toolDescription: `Load next unposted Google Sheet row (Post≠success) for ${label}; social tool marks Post success/failed`,
    };

    const socialDef = NODE_CATALOG.find((n) => n.type === socialType);
    if (!socialDef) {
      this.message.set(`Unknown social type: ${socialType}`);
      return;
    }
    const social = createNodeFromDefinition(socialDef, {
      x: 80 + gap + 360,
      y: 380,
    });

    if (socialType === 'slack') {
      social.data = {
        ...social.data,
        channel: '#general',
        message: '{{message}}',
        generateImage: 'false',
        imagePrompt: '',
      };
    } else if (socialType === 'linkedin') {
      social.data = {
        ...social.data,
        text: '{{message}}',
        captionColumn: 'Message',
        imagePromptColumn: 'ImagePrompt',
        imageUrl: '{{imageUrl}}',
        imagePrompt: '{{imagePrompt}}',
        dryRun: 'false',
      };
    } else if (socialType === 'facebook') {
      social.data = {
        ...social.data,
        message: '{{message}}',
        captionColumn: 'Message',
        imagePromptColumn: 'ImagePrompt',
        imageUrl: '{{imageUrl}}',
        imagePrompt: '{{imagePrompt}}',
        link: '{{link}}',
        dryRun: 'false',
      };
    } else if (socialType === 'instagram') {
      social.data = {
        ...social.data,
        caption: '{{message}}',
        imageUrl: '{{imageUrl}}',
        dryRun: 'false',
      };
    } else if (socialType === 'telegram') {
      social.data = {
        ...social.data,
        text: '{{message}}',
      };
    } else if (socialType === 'discord') {
      social.data = {
        ...social.data,
        content: '{{message}}',
      };
    }

    this.nodes.set([schedule, agent, model, sheets, social]);
    this.connections.set([
      { from: schedule.id, to: agent.id, output: 'main', kind: 'flow' },
      { from: model.id, to: agent.id, kind: 'config', targetPort: 'chatModel' },
      { from: sheets.id, to: agent.id, kind: 'config', targetPort: 'tool' },
      { from: social.id, to: agent.id, kind: 'config', targetPort: 'tool' },
    ]);
    this.selectedNodeId.set(agent.id);
    this.applyDefaultProviderToChatModels();
    this.message.set(
      `LLM flow ready: Schedule → Agent → Sheets + ${label} tools. Edit Schedule Prompt, set credentials, Save.`,
    );
  }

  /**
   * Schedule → AI Agent (+ model) for timed agent runs.
   * Attach Sheets/Email/Slack as tools after if needed.
   */
  insertScheduleAgentTemplate(resetWorkflow = true): void {
    if (resetWorkflow) {
      this.reset();
      this.workflowName.set('Scheduled AI Agent');
      this.description.set(
        'Schedule → AI Agent; attach Sheets/Email/Slack as tools',
      );
    }
    this.executionMode.set('LOCAL');
    this.active.set(true);

    const schedule = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'schedule')!,
      { x: 80, y: 200 },
    );
    schedule.data = {
      ...schedule.data,
      interval: 'daily',
      hour: 9,
      minute: 0,
      timezone: 'Asia/Karachi',
      cron: '0 9 * * *',
    };

    const agent = createNodeFromDefinition(
      NODE_CATALOG.find((n) => n.type === 'ai_agent')!,
      { x: 80 + NODE_WIDTH + NODE_HORIZONTAL_GAP, y: 180 },
    );
    agent.data = {
      ...agent.data,
      systemPrompt:
        'You were triggered by a Schedule. Summarize any tool results briefly in English.',
    };

    const model = this.createChatModelNode({
      x: 80 + NODE_WIDTH + NODE_HORIZONTAL_GAP + 40,
      y: 180 + 160,
    });

    this.nodes.set([schedule, agent, model]);
    this.connections.set([
      { from: schedule.id, to: agent.id, output: 'main', kind: 'flow' },
      { from: model.id, to: agent.id, kind: 'config', targetPort: 'chatModel' },
    ]);
    this.selectedNodeId.set(schedule.id);
    this.applyDefaultProviderToChatModels();
    this.message.set(
      'Schedule → Agent ready. Attach tools, then Save with Active on.',
    );
  }

  /** Keep schedule cron in sync with interval / hour / minute. */
  syncScheduleCron(nodeId: string): void {
    const node = this.nodes().find((n) => n.id === nodeId);
    if (!node || node.type !== 'schedule') return;

    const interval = String(node.data['interval'] ?? 'daily');
    const hour = Math.min(23, Math.max(0, Number(node.data['hour'] ?? 9)));
    const minute = Math.min(59, Math.max(0, Number(node.data['minute'] ?? 0)));

    let cron = `${minute} ${hour} * * *`;
    if (interval === 'hourly') cron = '0 * * * *';
    if (interval === 'every_minute') cron = '* * * * *';

    this.updateNodeData(nodeId, { hour, minute, cron, interval });
  }

  /** After load: map cron → interval so UI shows Every minute correctly. */
  normalizeScheduleNodes(): void {
    this.nodes.update((list) =>
      list.map((n) => {
        if (n.type !== 'schedule') return n;
        const cron = String(n.data['cron'] ?? '').trim();
        let interval = String(n.data['interval'] ?? 'daily');
        if (cron === '* * * * *') interval = 'every_minute';
        else if (cron === '0 * * * *') interval = 'hourly';
        else if (interval !== 'hourly' && interval !== 'every_minute') {
          interval = 'daily';
        }
        const label =
          !n.label || n.label === 'Google Sheets' || n.label === 'Slack'
            ? 'Schedule'
            : n.label;
        return {
          ...n,
          label,
          data: { ...n.data, interval, cron: cron || n.data['cron'] },
        };
      }),
    );
  }

  removeConnection(from: string, to: string, output?: string): void {
    this.connections.update((list) =>
      list.filter(
        (c) =>
          !(
            c.from === from &&
            c.to === to &&
            (output === undefined || (c.output ?? 'main') === output)
          ),
      ),
    );
  }

  getDefinitionByLabel(label: string): NodeDefinition | undefined {
    return NODE_CATALOG.find((n) => n.label === label);
  }

  getCatalog(): NodeDefinition[] {
    return NODE_CATALOG;
  }

  private normalizeLoadedNode(node: CanvasNode): CanvasNode {
    if (node.type !== 'spreadsheet') return node;
    const row = node.data['row'] as Record<string, string> | undefined;
    if (!row) return node;
    return {
      ...node,
      data: {
        ...node.data,
        rowCol1: row['col1'] ?? node.data['rowCol1'],
        rowCol2: row['col2'] ?? node.data['rowCol2'],
        rowCol3: row['col3'] ?? node.data['rowCol3'],
      },
    };
  }

  private apiNodeToCanvas(node: ApiWorkflowNode): CanvasNode {
    const def = NODE_CATALOG.find((d) => d.type === node.type);
    const canvas: CanvasNode = {
      ...node,
      icon: def?.icon ?? '⬡',
      category: def?.category ?? 'Actions',
    };
    return this.normalizeLoadedNode(canvas);
  }
}
