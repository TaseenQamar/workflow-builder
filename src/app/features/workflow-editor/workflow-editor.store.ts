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
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly chatMessages = signal<{ id: string; role: 'user' | 'assistant' | 'error'; text: string }[]>([]);
  readonly chatInput = signal('');
  readonly chatPanelHighlight = signal(false);
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

  attachAgentDefaults(agentId: string): void {
    const agent = this.nodes().find((n) => n.id === agentId);
    if (!agent || agent.type !== 'ai_agent') return;

    const status = this.getAgentAttachmentStatus(agentId);
    const newNodes = [...this.nodes()];
    const newConns = [...this.connections()];

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
    }

    if (!status.memory) {
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
    }

    this.nodes.set(newNodes);
    this.connections.set(newConns);
    const p = this.defaultAiProvider();
    this.message.set(
      `Attached ${p === 'gemini' ? 'Gemini' : 'OpenAI'} Chat Model + Memory to AI Agent`,
    );
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
      (n) => n.type === 'webhook' || n.type === 'chat_trigger' || n.type === 'schedule',
    );
    if (!hasTrigger) {
      errors.push('Add a trigger: Chat Message Received or Webhook');
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
        'Nodes wire nahi hain — Chat se HTTP / AI Agent par connection drag karein (left → right)',
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
      this.attachAgentDefaults(agent.id);
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
          : n.type === 'ai'
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
      const filtered = list.filter(
        (c) => !(c.kind === 'config' && c.to === to && c.targetPort === targetPort),
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
