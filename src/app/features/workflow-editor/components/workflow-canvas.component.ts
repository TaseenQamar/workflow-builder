import {
  Component,
  ElementRef,
  HostListener,
  inject,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { WorkflowEditorStore } from '../workflow-editor.store';
import { WorkflowChatService } from '../workflow-chat.service';
import {
  NODE_CATALOG,
  NODE_WIDTH,
  PortConfig,
  getNodeHeight,
  getNodeWidth,
  getNodePortLayout,
  getPortPosition,
  horizontalBezierPath,
  isConfigNode,
  isTriggerNode,
  nodeColor,
  nodeIconBg,
  nodeSubtextColor,
  nodeTextColor,
  snapToGrid,
} from '../../../core/constants/node-definitions';
import { NodeDefinition } from '../../../core/constants/node-definitions';
import { CanvasNode } from '../../../core/models/workflow.models';

interface NodeDragState {
  nodeId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface WireDragState {
  fromId: string;
  outputPort: string;
  pointerId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mode: 'flow' | 'config';
}

interface AddNodeMenuState {
  fromId: string;
  outputPort: string;
  screenX: number;
  screenY: number;
}

@Component({
  selector: 'app-workflow-canvas',
  imports: [DragDropModule],
  template: `
    <div
      #scrollContainer
      class="canvas-scroll relative h-full w-full overflow-auto bg-[#F4FAF9]"
      (click)="onCanvasClick($event)"
    >
      <div
        class="pointer-events-none absolute inset-0"
        [style.width.px]="canvasWidth"
        [style.height.px]="canvasHeight"
        style="background-image: radial-gradient(circle, #CDDBD9 1.2px, transparent 1.2px); background-size: 20px 20px; opacity: 0.9;"
      ></div>

      <div
        #canvas
        cdkDropList
        id="canvas-drop"
        [cdkDropListData]="dropData"
        [cdkDropListConnectedTo]="['palette-list']"
        cdkDropListSortingDisabled
        class="canvas-drop-zone relative"
        [style.width.px]="canvasWidth"
        [style.height.px]="canvasHeight"
        (cdkDropListDropped)="onPaletteDrop($any($event))"
      >
        <svg
          class="pointer-events-none absolute inset-0"
          [attr.width]="canvasWidth"
          [attr.height]="canvasHeight"
        >
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2BBFBA" />
            </marker>
          </defs>

          @for (line of connectionLines(); track line.key) {
            <path
              [attr.d]="line.path"
              fill="none"
              [attr.stroke]="line.color"
              stroke-width="2"
              marker-end="url(#flow-arrow)"
            />
          }
          @for (line of configConnectionLines(); track line.key) {
            <path
              [attr.d]="line.path"
              fill="none"
              stroke="#4DD4CE"
              stroke-width="1.75"
              stroke-dasharray="5 4"
              stroke-opacity="0.85"
            />
          }

          @if (wireDrag(); as wire) {
            <path
              [attr.d]="horizontalBezierPath(wire.x1, wire.y1, wire.x2, wire.y2)"
              fill="none"
              stroke="#2BBFBA"
              stroke-width="2.5"
              stroke-dasharray="6 4"
            />
            <circle [attr.cx]="wire.x2" [attr.cy]="wire.y2" r="5" fill="#2BBFBA" />
          }
        </svg>

        @for (node of store.nodes(); track node.id) {
          <div
            class="workflow-node absolute touch-none select-none border shadow-lg"
            [attr.data-node-id]="node.id"
            [class]="nodeClasses(node)"
            [class.ring-2]="store.selectedNodeId() === node.id"
            [class.ring-[#2BBFBA]]="store.selectedNodeId() === node.id"
            [class.is-dragging]="draggingNodeId() === node.id"
            [class.is-trigger]="isTrigger(node)"
            [style.left.px]="node.position.x"
            [style.top.px]="node.position.y"
            [style.width.px]="nodeWidth(node)"
            [style.height.px]="nodeHeight(node)"
            [class.is-config]="isConfigNode(node.type)"
            [class.is-agent]="node.type === 'ai_agent'"
            (pointerdown)="onNodePointerDown($event, node)"
            (click)="onNodeClick($event, node)"
          >
            @if (isConfigNode(node.type)) {
              <div class="flex h-full flex-col items-center justify-center px-1 text-center">
                <span class="text-xl">{{ node.icon }}</span>
                <p class="node-label mt-1 line-clamp-2 text-[10px] font-medium leading-tight text-[#1A1A1A]">
                  {{ node.label }}
                </p>
              </div>
            } @else {
              <div class="flex h-full items-center gap-2.5 px-3.5">
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg"
                  [class]="nodeIconBg(node.type)"
                >{{ node.icon }}</span>
                <div class="min-w-0 flex-1">
                  <p class="node-label truncate text-sm font-semibold" [class]="nodeTextColor(node.type)">{{ node.label }}</p>
                  @if (node.type === 'ai_agent') {
                    <p class="mt-0.5 text-[10px] text-[#2BBFBA]">Tools Agent</p>
                  } @else if (node.type === 'chat_trigger') {
                    <p class="mt-0.5 text-[10px] text-rose-300">Prompt → Run workflow</p>
                  } @else {
                    <p class="node-subtitle mt-0.5 text-xs capitalize" [class]="nodeSubtextColor(node.type)">{{ node.type }}</p>
                  }
                </div>
                <button
                  type="button"
                  data-delete
                  class="rounded p-0.5 text-[#9A9A9A] hover:bg-red-50 hover:text-red-400"
                  (click)="removeNode($event, node.id)"
                >×</button>
              </div>
            }

            @for (port of inputPorts(node); track port.id) {
              <button
                type="button"
                data-port
                data-port-in
                [attr.data-port-id]="port.id"
                class="port port-in absolute left-0 top-0 z-10 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-[#C4B8AE] bg-white transition hover:scale-150 hover:border-[#4DD4CE] hover:bg-[#1FA8A3]/40"
                [style.top.px]="portY(node, port)"
                [class.ring-2]="hoverInputKey() === portKey(node.id, port.id)"
                [class.ring-emerald-500]="hoverInputKey() === portKey(node.id, port.id)"
                (pointerdown)="$event.stopPropagation()"
                (pointerenter)="hoverInputKey.set(portKey(node.id, port.id))"
                (pointerleave)="hoverInputKey.set(null)"
                (click)="onInputPortClick($event, node.id)"
              ></button>
            }

            @for (port of outputPorts(node); track port.id) {
              @if (port.side === 'top') {
                <button
                  type="button"
                  data-port
                  data-port-config-out
                  [attr.data-port-id]="port.id"
                  class="port absolute left-1/2 top-0 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#4DD4CE] bg-[#2BBFBA] transition hover:scale-150"
                  (pointerdown)="onConfigOutPointerDown($event, node)"
                ></button>
              } @else {
              <div
                class="absolute right-0 z-10 flex translate-x-1/2 items-center gap-1"
                [style.top.px]="portY(node, port) - 6"
              >
                @if (port.label) {
                  <span class="mr-1 text-[10px] font-medium text-[#9A9A9A]">{{ port.label }}</span>
                }
                <button
                  type="button"
                  data-port
                  data-port-out
                  [attr.data-port-id]="port.id"
                  class="port port-out h-3 w-3 rounded-full border-2 border-[#4DD4CE] bg-[#1FA8A3] transition hover:scale-150 hover:bg-[#4DD4CE]"
                  [class.bg-[#4DD4CE]]="wireDrag()?.fromId === node.id && wireDrag()?.outputPort === port.id"
                  (pointerdown)="onOutputPortPointerDown($event, node, port.id)"
                  (click)="onOutputPortClick($event, node.id, port.id)"
                ></button>
                @if (!isConfigNode(node.type)) {
                <button
                  type="button"
                  data-add
                  class="flex h-5 w-5 items-center justify-center rounded-full border border-[#CDDBD9] bg-[#F5FBFA] text-xs text-[#4A4A4A] shadow-sm hover:border-[#4DD4CE] hover:bg-[#1FA8A3]/20 hover:text-[#2BBFBA]"
                  (pointerdown)="$event.stopPropagation()"
                  (click)="openAddMenu($event, node.id, port.id)"
                >+</button>
                }
              </div>
              }
            }

            @for (port of configInputPorts(node); track port.id) {
              <div
                class="absolute bottom-0 z-10 flex -translate-x-1/2 flex-col items-center"
                [style.left.px]="configPortX(node, port)"
              >
                <span class="mb-0.5 whitespace-nowrap text-[9px] font-medium text-[#9A9A9A]">{{ port.label }}</span>
                <button
                  type="button"
                  data-port
                  data-config-in
                  [attr.data-port-id]="port.id"
                  class="h-3 w-3 rounded-full border-2 border-[#4DD4CE] bg-white transition hover:scale-150 hover:bg-[#E6F7F6]"
                  [class.ring-2]="hoverConfigPortKey() === portKey(node.id, port.id)"
                  [class.ring-[#2BBFBA]]="hoverConfigPortKey() === portKey(node.id, port.id)"
                  (pointerdown)="$event.stopPropagation()"
                  (pointerenter)="hoverConfigPortKey.set(portKey(node.id, port.id))"
                  (pointerleave)="hoverConfigPortKey.set(null)"
                ></button>
              </div>
            }
          </div>
        }

        @if (selectedChatNode(); as chat) {
          <div
            class="absolute z-40 w-72 rounded-xl border-2 border-rose-500/50 bg-white p-4 shadow-2xl"
            [style.left.px]="chat.position.x + nodeWidth(chat) + 16"
            [style.top.px]="chat.position.y"
            (click)="$event.stopPropagation()"
            (pointerdown)="$event.stopPropagation()"
          >
            <p class="text-sm font-semibold text-rose-300">💬 Chat Message</p>
            <textarea
              class="mt-2 w-full resize-none rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-rose-400"
              rows="3"
              [value]="store.chatInput()"
              (input)="onChatInput($event)"
              placeholder="Type your prompt..."
            ></textarea>
            <button
              type="button"
              class="mt-2 w-full rounded-lg bg-rose-600 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              [disabled]="store.running() || !store.chatInput().trim()"
              (click)="runChat()"
            >
              {{ store.running() ? 'Running...' : '▶ Run' }}
            </button>
          </div>
        }

        @if (store.nodes().length === 0) {
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div class="rounded-2xl border-2 border-dashed border-[#CDDBD9] bg-white/90 px-12 py-10 text-center shadow-sm">
              <p class="text-4xl">⎔</p>
              <p class="mt-3 text-sm font-medium text-[#1A1A1A]">Drag nodes from the palette</p>
              <p class="mt-1 text-xs text-[#9A9A9A]">
                Connect left → right like n8n · drag from output port or click +
              </p>
            </div>
          </div>
        }
      </div>

      @if (wireDrag()) {
        <div class="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-[#2BBFBA] px-4 py-2 text-sm text-white shadow-xl">
          {{ wireDrag()!.mode === 'config' ? 'Drop on AI Agent bottom port (Chat Model / Memory / Tool)' : 'Drop on input port (left side) to connect' }}
        </div>
      }

      @if (addNodeMenu(); as menu) {
        <div
          class="fixed z-50 w-52 rounded-xl border border-[#CDDBD9] bg-white py-1 shadow-2xl"
          [style.left.px]="menu.screenX"
          [style.top.px]="menu.screenY"
          (click)="$event.stopPropagation()"
        >
          <p class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#9A9A9A]">
            Add next node
          </p>
          @for (item of quickAddNodes; track item.label) {
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#1A1A1A] hover:bg-[#1FA8A3]/10"
              (click)="pickQuickNode(item)"
            >
              <span>{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .workflow-node {
      border-radius: 12px;
    }
    .workflow-node.is-trigger {
      border-top-left-radius: 28px;
      border-bottom-left-radius: 28px;
    }
    .workflow-node.is-config {
      border-radius: 9999px;
    }
    .workflow-node.is-agent {
      padding-bottom: 18px;
    }
    .workflow-node.is-dragging {
      opacity: 0.92;
      cursor: grabbing;
      z-index: 30;
    }
  `,
})
export class WorkflowCanvasComponent {
  protected readonly store = inject(WorkflowEditorStore);
  private readonly chatRunner = inject(WorkflowChatService);
  protected readonly horizontalBezierPath = horizontalBezierPath;

  protected readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  protected readonly canvas = viewChild<ElementRef<HTMLElement>>('canvas');

  protected readonly dropData: never[] = [];
  protected readonly canvasWidth = 3200;
  protected readonly canvasHeight = 1800;

  protected readonly draggingNodeId = signal<string | null>(null);
  protected readonly wireDrag = signal<WireDragState | null>(null);
  protected readonly hoverInputKey = signal<string | null>(null);
  protected readonly hoverConfigPortKey = signal<string | null>(null);
  protected readonly addNodeMenu = signal<AddNodeMenuState | null>(null);

  protected readonly isConfigNode = isConfigNode;

  protected readonly quickAddNodes = NODE_CATALOG.filter(
    (n) => !['webhook', 'schedule', 'chat_trigger', 'chat_model', 'memory', 'tool'].includes(n.type),
  ).slice(0, 12);

  protected readonly nodeTextColor = nodeTextColor;
  protected readonly nodeSubtextColor = nodeSubtextColor;
  protected readonly nodeIconBg = nodeIconBg;

  protected readonly selectedChatNode = computed(() => {
    const node = this.store.selectedNode();
    return node?.type === 'chat_trigger' ? node : null;
  });

  private nodeDrag: NodeDragState | null = null;

  protected readonly connectionLines = computed(() => {
    const nodes = this.store.nodes();
    const connections = this.store.connections().filter((c) => c.kind !== 'config');
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    return connections
      .map((conn) => {
        const from = nodeMap.get(conn.from);
        const to = nodeMap.get(conn.to);
        if (!from || !to) return null;

        const outputPort =
          getNodePortLayout(from.type).outputs.find(
            (p) => p.id === (conn.output ?? 'main'),
          ) ?? getNodePortLayout(from.type).outputs[0];
        const inputPort = getNodePortLayout(to.type).inputs[0];
        if (!outputPort || !inputPort) return null;

        const fromPos = getPortPosition(from, outputPort);
        const toPos = getPortPosition(to, inputPort);
        const path = horizontalBezierPath(fromPos.x, fromPos.y, toPos.x, toPos.y);
        const output = conn.output ?? 'main';
        const color =
          output === 'true' ? '#22c55e' : output === 'false' ? '#2bbfba' : '#2BBFBA';

        return { key: `${conn.from}-${output}-${conn.to}`, path, color };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
  });

  protected readonly configConnectionLines = computed(() => {
    const nodes = this.store.nodes();
    const connections = this.store.connections().filter((c) => c.kind === 'config');
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    return connections
      .map((conn) => {
        const from = nodeMap.get(conn.from);
        const to = nodeMap.get(conn.to);
        if (!from || !to) return null;

        const outPort =
          getNodePortLayout(from.type).outputs.find((p) => p.kind === 'config') ??
          getNodePortLayout(from.type).outputs[0];
        const inPort =
          getNodePortLayout(to.type).configInputs?.find(
            (p) => p.id === (conn.targetPort ?? 'chatModel'),
          );
        if (!outPort || !inPort) return null;

        const fromPos = getPortPosition(from, outPort);
        const toPos = getPortPosition(to, inPort);
        const path = horizontalBezierPath(fromPos.x, fromPos.y, toPos.x, toPos.y);

        return {
          key: `cfg-${conn.from}-${conn.targetPort}-${conn.to}`,
          path,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
  });

  protected nodeWidth(node: CanvasNode): number {
    return getNodeWidth(node.type);
  }

  protected nodeHeight(node: CanvasNode): number {
    return getNodeHeight(node.type);
  }

  protected isTrigger(node: CanvasNode): boolean {
    return isTriggerNode(node.type);
  }

  protected nodeClasses(node: CanvasNode): string {
    return `${nodeColor(node.type)} cursor-grab`;
  }

  protected inputPorts(node: CanvasNode): PortConfig[] {
    return getNodePortLayout(node.type).inputs;
  }

  protected outputPorts(node: CanvasNode): PortConfig[] {
    return getNodePortLayout(node.type).outputs;
  }

  protected configInputPorts(node: CanvasNode): PortConfig[] {
    return getNodePortLayout(node.type).configInputs ?? [];
  }

  protected configPortX(node: CanvasNode, port: PortConfig): number {
    return getNodeWidth(node.type) * (port.offsetX ?? 0.5);
  }

  protected portY(node: CanvasNode, port: PortConfig): number {
    return getNodeHeight(node.type) * (port.offsetY ?? 0.5);
  }

  protected portKey(nodeId: string, portId: string): string {
    return `${nodeId}:${portId}`;
  }

  protected onPaletteDrop(event: CdkDragDrop<NodeDefinition[], NodeDefinition[] | never>): void {
    if (event.previousContainer.id !== 'palette-list') return;

    const def = event.item.data as NodeDefinition;
    const pos = this.pointerToCanvasPosition(event.dropPoint.x, event.dropPoint.y);

    this.store.addNode(def, {
      x: snapToGrid(Math.max(0, pos.x - getNodeWidth(def.type) / 2)),
      y: snapToGrid(Math.max(0, pos.y - this.nodeHeightForType(def.type) / 2)),
    });

    event.item.reset();
  }

  protected onNodePointerDown(event: PointerEvent, node: CanvasNode): void {
    const target = event.target as HTMLElement;
    if (target.closest('[data-port]') || target.closest('[data-delete]') || target.closest('[data-add]')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const scrollEl = this.scrollContainer()?.nativeElement;
    const canvasEl = this.canvas()?.nativeElement;
    if (!scrollEl || !canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();

    this.nodeDrag = {
      nodeId: node.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left + scrollEl.scrollLeft - node.position.x,
      offsetY: event.clientY - rect.top + scrollEl.scrollTop - node.position.y,
    };

    this.draggingNodeId.set(node.id);
    this.store.selectNode(node.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected onOutputPortPointerDown(
    event: PointerEvent,
    node: CanvasNode,
    outputPort: string,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.addNodeMenu.set(null);

    const port = getNodePortLayout(node.type).outputs.find((p) => p.id === outputPort);
    if (!port) return;

    const fromPos = getPortPosition(node, port);
    const pos = this.pointerToCanvasPosition(event.clientX, event.clientY);

    this.wireDrag.set({
      fromId: node.id,
      outputPort,
      pointerId: event.pointerId,
      x1: fromPos.x,
      y1: fromPos.y,
      x2: pos.x,
      y2: pos.y,
      mode: 'flow',
    });

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  protected onConfigOutPointerDown(event: PointerEvent, node: CanvasNode): void {
    event.preventDefault();
    event.stopPropagation();

    const port = getNodePortLayout(node.type).outputs[0];
    const fromPos = getPortPosition(node, port);
    const pos = this.pointerToCanvasPosition(event.clientX, event.clientY);

    this.wireDrag.set({
      fromId: node.id,
      outputPort: 'config',
      pointerId: event.pointerId,
      x1: fromPos.x,
      y1: fromPos.y,
      x2: pos.x,
      y2: pos.y,
      mode: 'config',
    });

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  @HostListener('document:pointermove', ['$event'])
  protected onDocumentPointerMove(event: PointerEvent): void {
    if (this.nodeDrag && event.pointerId === this.nodeDrag.pointerId) {
      const pos = this.pointerToCanvasPosition(event.clientX, event.clientY);
      this.store.updateNodePosition(this.nodeDrag.nodeId, {
        x: snapToGrid(Math.max(0, pos.x - this.nodeDrag.offsetX)),
        y: snapToGrid(Math.max(0, pos.y - this.nodeDrag.offsetY)),
      });
      return;
    }

    const wire = this.wireDrag();
    if (wire && event.pointerId === wire.pointerId) {
      const pos = this.pointerToCanvasPosition(event.clientX, event.clientY);
      this.wireDrag.set({ ...wire, x2: pos.x, y2: pos.y });

      const el = document.elementFromPoint(event.clientX, event.clientY);
      if (wire.mode === 'config') {
        const portIn = el?.closest('[data-config-in]') as HTMLElement | null;
        const nodeEl = portIn?.closest('[data-node-id]') as HTMLElement | null;
        const portId = portIn?.dataset['portId'] ?? 'chatModel';
        this.hoverConfigPortKey.set(
          nodeEl?.dataset['nodeId'] ? this.portKey(nodeEl.dataset['nodeId'], portId) : null,
        );
        this.hoverInputKey.set(null);
      } else {
        const portIn = el?.closest('[data-port-in]') as HTMLElement | null;
        const nodeEl = portIn?.closest('[data-node-id]') as HTMLElement | null;
        const portId = portIn?.dataset['portId'] ?? 'main';
        this.hoverInputKey.set(
          nodeEl?.dataset['nodeId'] ? this.portKey(nodeEl.dataset['nodeId'], portId) : null,
        );
        this.hoverConfigPortKey.set(null);
      }
    }
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  protected onDocumentPointerUp(event: PointerEvent): void {
    if (this.nodeDrag && event.pointerId === this.nodeDrag.pointerId) {
      this.nodeDrag = null;
      this.draggingNodeId.set(null);
      return;
    }

    const wire = this.wireDrag();
    if (wire && event.pointerId === wire.pointerId) {
      const el = document.elementFromPoint(event.clientX, event.clientY);

      if (wire.mode === 'config') {
        const portIn = el?.closest('[data-config-in]') as HTMLElement | null;
        const nodeEl = portIn?.closest('[data-node-id]') as HTMLElement | null;
        const targetId = nodeEl?.dataset['nodeId'];
        const targetPort = portIn?.dataset['portId'];
        if (targetId && targetPort && targetId !== wire.fromId) {
          this.store.addConfigConnection(wire.fromId, targetId, targetPort);
        }
        this.hoverConfigPortKey.set(null);
      } else {
        const portIn = el?.closest('[data-port-in]') as HTMLElement | null;
        const nodeEl = portIn?.closest('[data-node-id]') as HTMLElement | null;
        const targetId = nodeEl?.dataset['nodeId'];
        if (targetId && targetId !== wire.fromId) {
          this.store.addConnection(wire.fromId, targetId, wire.outputPort);
        }
        this.hoverInputKey.set(null);
      }

      this.wireDrag.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.wireDrag.set(null);
    this.hoverInputKey.set(null);
    this.hoverConfigPortKey.set(null);
    this.addNodeMenu.set(null);
    this.store.connectSourceId.set(null);
  }

  protected onNodeClick(event: MouseEvent, node: CanvasNode): void {
    event.stopPropagation();
    this.store.selectNode(node.id);
  }

  protected onCanvasClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.workflow-node') || target.closest('[data-add-menu]')) return;
    this.store.selectNode(null);
    this.addNodeMenu.set(null);
    this.store.connectSourceId.set(null);
  }

  protected onOutputPortClick(event: MouseEvent, nodeId: string, portId: string): void {
    event.stopPropagation();
    const source = this.store.connectSourceId();
    if (source?.startsWith(nodeId)) {
      this.store.connectSourceId.set(null);
      return;
    }
    this.store.connectSourceId.set(`${nodeId}:${portId}`);
  }

  protected onInputPortClick(event: MouseEvent, nodeId: string): void {
    event.stopPropagation();
    const source = this.store.connectSourceId();
    if (!source) return;

    const [fromId, outputPort = 'main'] = source.split(':');
    if (fromId !== nodeId) {
      this.store.addConnection(fromId, nodeId, outputPort);
    }
    this.store.connectSourceId.set(null);
  }

  protected openAddMenu(event: MouseEvent, fromId: string, outputPort: string): void {
    event.stopPropagation();
    this.addNodeMenu.set({
      fromId,
      outputPort,
      screenX: event.clientX,
      screenY: event.clientY,
    });
  }

  protected pickQuickNode(def: NodeDefinition): void {
    const menu = this.addNodeMenu();
    if (!menu) return;
    this.store.addNodeAfter(def, menu.fromId, menu.outputPort);
    this.addNodeMenu.set(null);
  }

  protected onChatInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.store.chatInput.set(value);
  }

  protected runChat(): void {
    this.chatRunner.run();
  }

  protected removeNode(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.store.removeNode(id);
  }

  private nodeHeightForType(type: CanvasNode['type']): number {
    return getNodeHeight(type);
  }

  private pointerToCanvasPosition(clientX: number, clientY: number): { x: number; y: number } {
    const scrollEl = this.scrollContainer()?.nativeElement;
    const canvasEl = this.canvas()?.nativeElement;
    if (!scrollEl || !canvasEl) return { x: 0, y: 0 };

    const rect = canvasEl.getBoundingClientRect();
    return {
      x: clientX - rect.left + scrollEl.scrollLeft,
      y: clientY - rect.top + scrollEl.scrollTop,
    };
  }
}
