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
import { isConfigNodeType } from '../../core/models/workflow.models';

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
  readonly chatMessages = signal<{ id: string; role: 'user' | 'assistant' | 'error'; text: string }[]>([]);
  readonly chatInput = signal('');
  readonly chatPanelHighlight = signal(false);
  /** Stable per-conversation id for n8n-style Window Buffer Memory */
  readonly chatSessionId = signal<string>(crypto.randomUUID());
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
   * n8n-style: Chat → AI Agent (main).
   * Google Sheets + Email → Agent Tool port (config). Agent calls tools itself.
   */
  ensureAgentCentricFlow(): void {
    const nodes = this.nodes();
    const chat = nodes.find((n) => n.type === 'chat_trigger');
    const agent = nodes.find((n) => n.type === 'ai_agent');
    const sheets = nodes.filter((n) => n.type === 'google_sheets');
    const emails = nodes.filter((n) => n.type === 'email');
    if (!chat || !agent) return;

    for (const s of sheets) {
      this.nodes.update((list) =>
        list.map((n) =>
          n.id === s.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  requireAgent: 'false',
                  requireChatIntent: 'false',
                  toolDescription:
                    n.data['toolDescription'] ??
                    'Use when user asks to read/update/append/delete Google Sheet rows',
                },
              }
            : n,
        ),
      );
    }
    for (const e of emails) {
      this.nodes.update((list) =>
        list.map((n) => {
          if (n.id !== e.id) return n;
          const body = String(n.data['body'] ?? '');
          const to = String(n.data['to'] ?? '');
          return {
            ...n,
            data: {
              ...n.data,
              body:
                !body.trim() || body.trim() === 'Hello!'
                  ? '{{emailNotifyBody}}'
                  : body,
              subject:
                !String(n.data['subject'] ?? '').trim() ||
                String(n.data['subject']) === 'Notification'
                  ? '{{emailSubject}}'
                  : n.data['subject'],
              to: to === '{{email}}' ? '' : to,
            },
          };
        }),
      );
    }

    // Keep non-tool config (model/memory); drop old tool links we'll recreate
    const baseConfig = this.connections().filter(
      (c) =>
        c.kind === 'config' &&
        !(
          c.to === agent.id &&
          c.targetPort === 'tool' &&
          (sheets.some((s) => s.id === c.from) ||
            emails.some((e) => e.id === c.from))
        ),
    );

    const toolConns: WorkflowConnection[] = [
      ...sheets.map((s) => ({
        from: s.id,
        to: agent.id,
        kind: 'config' as const,
        targetPort: 'tool',
      })),
      ...emails.map((e) => ({
        from: e.id,
        to: agent.id,
        kind: 'config' as const,
        targetPort: 'tool',
      })),
    ];

    // Main: only Chat → Agent (tools are NOT in main chain — n8n style)
    const flowChain: WorkflowConnection[] = [
      { from: chat.id, to: agent.id, output: 'main', kind: 'flow' },
    ];

    // Remove main-flow wires into/out of sheets/email (they become tools)
    const toolIds = new Set([
      ...sheets.map((s) => s.id),
      ...emails.map((e) => e.id),
    ]);
    const otherFlow = this.connections().filter(
      (c) =>
        c.kind !== 'config' &&
        !toolIds.has(c.from) &&
        !toolIds.has(c.to) &&
        !(c.from === chat.id && c.to === agent.id),
    );

    this.connections.set([
      ...baseConfig,
      ...toolConns,
      ...flowChain,
      ...otherFlow,
    ]);
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
            'You are an n8n-style Tools Agent. Use google_sheets / send_email tools when the user asks. Never invent Apps Script — call tools. Reply in the user language after tools run.',
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

    this.nodes.update((list) =>
      list.map((n) =>
        n.type === 'chat_model'
          ? { ...n, label: cfg.label, data: { ...n.data, ...cfg.data } }
          : n.type === 'ai' || n.type === 'ai_agent'
            ? { ...n, data: { ...n.data, provider } }
            : n,
      ),
    );
  }

  private createChatModelNode(position: { x: number; y: number }): CanvasNode {
    const def = NODE_CATALOG.find((n) => n.type === 'chat_model')!;
    const cfg = chatModelConfigForProvider(this.defaultAiProvider());
    const node = createNodeFromDefinition(def, position);
    return { ...node, label: cfg.label, data: { ...node.data, ...cfg.data } };
  }

  addChatMessage(role: 'user' | 'assistant' | 'error', text: string): void {
    this.chatMessages.update((list) => [
      ...list,
      { id: crypto.randomUUID(), role, text },
    ]);
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
