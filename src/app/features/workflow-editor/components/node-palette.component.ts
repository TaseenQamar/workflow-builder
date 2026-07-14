import { Component, inject } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { WorkflowEditorStore } from '../workflow-editor.store';
import { NODE_CATALOG, nodeColor } from '../../../core/constants/node-definitions';
import { NodeDefinition } from '../../../core/constants/node-definitions';

@Component({
  selector: 'app-node-palette',
  imports: [DragDropModule],
  template: `
    <div class="flex h-full flex-col">
      <p class="text-xs font-medium uppercase tracking-wider text-[#9A9A9A]">
        Node Palette
      </p>
      <p class="mt-1 text-xs text-[#9A9A9A]">
        Drag onto canvas · double-click to add
      </p>

      <!-- Flat drop list — cdkDrag items MUST be direct children -->
      <div
        cdkDropList
        id="palette-list"
        [cdkDropListData]="paletteData"
        [cdkDropListConnectedTo]="['canvas-drop']"
        cdkDropListSortingDisabled
        class="mt-3 flex-1 space-y-1 overflow-y-auto"
      >
        @for (group of grouped; track group.name) {
          <p class="mb-1 mt-3 first:mt-0 text-xs font-semibold uppercase tracking-wide text-[#9A9A9A]">
            {{ group.name }}
          </p>
          @for (node of group.nodes; track node.label) {
            <div
              cdkDrag
              [cdkDragData]="node"
              class="palette-item mb-1.5 cursor-grab rounded-lg border px-3 py-2.5 text-sm active:cursor-grabbing"
              [class]="nodeColor(node.type)"
              (dblclick)="addToCanvas(node)"
            >
              <div class="flex items-center gap-2">
                <span class="text-base">{{ node.icon }}</span>
                <div class="min-w-0">
                  <p class="font-medium leading-tight text-[#1A1A1A]">{{ node.label }}</p>
                  <p class="mt-0.5 truncate text-xs text-[#757575]">{{ node.description }}</p>
                </div>
              </div>

              <!-- Custom drag preview (follows cursor) -->
              <div
                *cdkDragPreview
                class="rounded-xl border border-[#4DD4CE] bg-[#F5FBFA] px-4 py-3 shadow-2xl"
              >
                <span class="mr-2">{{ node.icon }}</span>
                <span class="font-medium text-[#1A1A1A]">{{ node.label }}</span>
              </div>

              <!-- Placeholder left in palette while dragging -->
              <div
                *cdkDragPlaceholder
                class="mb-1.5 rounded-lg border border-dashed border-[#4DD4CE]/60 bg-[#1FA8A3]/5 px-3 py-2.5 text-sm opacity-50"
              >
                {{ node.label }}
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class NodePaletteComponent {
  protected readonly store = inject(WorkflowEditorStore);
  protected readonly paletteData = NODE_CATALOG;
  protected readonly nodeColor = nodeColor;

  protected readonly grouped = [
    'Triggers',
    'Actions',
    'AI',
    'Logic',
    'Integrations',
  ].map((name) => ({
    name,
    nodes: NODE_CATALOG.filter((n) => n.category === name),
  }));

  protected addToCanvas(node: NodeDefinition): void {
    const nodes = this.store.nodes();
    if (nodes.length === 0) {
      this.store.addNode(node, { x: 120, y: 200 });
      return;
    }
    const last = [...nodes]
      .filter((n) => !['chat_model', 'memory', 'tool'].includes(n.type))
      .sort((a, b) => b.position.x - a.position.x || a.position.y - b.position.y)[0];
    this.store.addNodeAfter(node, last.id, 'main');
  }
}
