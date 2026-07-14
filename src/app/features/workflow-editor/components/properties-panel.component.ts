import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { WorkflowEditorStore } from '../workflow-editor.store';
import { ExecutionMode } from '../../../core/models/workflow.models';

@Component({
  selector: 'app-properties-panel',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="flex h-full flex-col">
      <p class="text-xs font-medium uppercase tracking-wider text-[#9A9A9A]">
        Properties
      </p>

      @if (!store.selectedNode()) {
        <div class="mt-4 space-y-4">
          <div>
            <label class="block text-xs text-[#757575]">Workflow Name</label>
            <input
              class="mt-1 w-full rounded-lg border border-[#E5DDD4] bg-[#FFF8F4] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#F06225]"
              [ngModel]="store.workflowName()"
              (ngModelChange)="store.workflowName.set($event)"
            />
          </div>
          <div>
            <label class="block text-xs text-[#757575]">Execution Mode</label>
            <select
              class="mt-1 w-full rounded-lg border border-[#E5DDD4] bg-[#FFF8F4] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#F06225]"
              [ngModel]="store.executionMode()"
              (ngModelChange)="onModeChange($event)"
            >
              <option value="LOCAL">LOCAL — Custom engine</option>
              <option value="HYBRID">HYBRID</option>
            </select>
          </div>
          <p class="text-xs text-[#9A9A9A]">
            Nodes: {{ store.nodes().length }} · Connections: {{ store.connections().length }}
          </p>
          <p class="rounded-lg border border-[#FFE8DC] bg-[#E5551A]/5 p-3 text-xs text-[#757575]">
            Nodes ko <strong class="text-[#F06225]">wires se jorain</strong> — order wahi chalega:
            Chat → HTTP → AI Agent. Neeche prompt likh kar <strong class="text-[#F06225]">Chat</strong> dabayein.
            <a routerLink="/settings" class="mt-2 block text-[#F06225] hover:underline">API key →</a>
          </p>
        </div>
      } @else {
        <div class="mt-4 space-y-3 overflow-y-auto">
          <div>
            <label class="block text-xs text-[#757575]">Label</label>
            <input
              class="mt-1 w-full rounded-lg border border-[#E5DDD4] bg-[#FFF8F4] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#F06225]"
              [ngModel]="store.selectedNode()!.label"
              (ngModelChange)="store.updateNodeLabel(store.selectedNode()!.id, $event)"
            />
          </div>
          <div>
            <label class="block text-xs text-[#757575]">Type</label>
            <p class="mt-1 text-sm capitalize text-[#4A4A4A]">{{ store.selectedNode()!.type }}</p>
          </div>

          @if (store.selectedNode()!.type === 'chat_trigger') {
            <div class="rounded-xl border-2 border-rose-500/40 bg-rose-500/10 p-4">
              <p class="text-sm font-semibold text-rose-300">💬 Chat Input (n8n style)</p>
              <p class="mt-1 text-[11px] text-[#757575]">
                Yahan prompt likhein → Run → connected workflow chalega
              </p>

              <label class="mt-3 block text-xs font-medium text-[#4A4A4A]">Your message / prompt</label>
              <textarea
                class="mt-1.5 w-full rounded-lg border border-rose-500/30 bg-white px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-rose-400"
                rows="4"
                [ngModel]="store.chatInput()"
                (ngModelChange)="store.chatInput.set($event)"
                placeholder="e.g. Mujhe refund chahiye order #123 ke liye"
              ></textarea>

              <button
                type="button"
                class="mt-3 w-full rounded-lg bg-rose-600 py-2.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                [disabled]="store.running() || !store.chatInput().trim()"
                (click)="runChat.emit()"
              >
                {{ store.running() ? 'Running...' : '▶ Run Workflow' }}
              </button>

              @if (store.chatMessages().length > 0) {
                <div class="mt-3 max-h-32 space-y-2 overflow-y-auto border-t border-rose-500/20 pt-3">
                  @for (msg of store.chatMessages().slice(-4); track msg.id) {
                    <div
                      class="rounded-lg px-2 py-1.5 text-xs"
                      [class]="
                        msg.role === 'user'
                          ? 'bg-[#F06225]/30 text-[#C94512]'
                          : msg.role === 'error'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-[#FFF8F4] text-[#4A4A4A]'
                      "
                    >
                      {{ msg.text }}
                    </div>
                  }
                </div>
              }

              @if (!hasAgentConnected()) {
                <p class="mt-2 text-[11px] text-amber-600">
                  AI Agent connect karein (Chat → Agent wire) ya template load karein
                </p>
              }
            </div>
          }

          @if (store.selectedNode()!.type === 'ai_agent') {
            <div class="rounded-lg border border-[#FFD0B8] bg-[#FFF8F4] p-3 text-xs">
              <p class="font-medium text-[#F06225]">AI Agent</p>
              <ul class="mt-2 space-y-1 text-[#757575]">
                <li>{{ agentStatus().chatModel ? '✓' : '✗' }} Chat Model</li>
                <li>{{ agentStatus().memory ? '✓' : '○' }} Memory</li>
                <li>{{ agentStatus().flowInput ? '✓' : '✗' }} Trigger connected</li>
              </ul>
              @if (!agentStatus().chatModel) {
                <button
                  type="button"
                  class="mt-3 w-full rounded-lg border border-[#FFD0B8] px-3 py-2 text-[#F06225] hover:bg-[#FFF2EB]"
                  (click)="store.attachAgentDefaults(store.selectedNode()!.id)"
                >
                  Attach Model + Memory
                </button>
              }
            </div>
          }

          @for (field of fields(); track field.key) {
            <div>
              <label class="block text-xs text-[#757575]">{{ field.label }}</label>
              @if (field.type === 'textarea') {
                <textarea
                  class="mt-1 w-full rounded-lg border border-[#E5DDD4] bg-[#FFF8F4] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#F06225]"
                  rows="3"
                  [ngModel]="field.value"
                  (ngModelChange)="updateField(field.key, $event)"
                ></textarea>
              } @else if (field.type === 'select') {
                <select
                  class="mt-1 w-full rounded-lg border border-[#E5DDD4] bg-[#FFF8F4] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#F06225]"
                  [ngModel]="field.value"
                  (ngModelChange)="updateField(field.key, $event)"
                >
                  @for (opt of field.options; track opt) {
                    <option [value]="opt">{{ opt }}</option>
                  }
                </select>
              } @else {
                <input
                  class="mt-1 w-full rounded-lg border border-[#E5DDD4] bg-[#FFF8F4] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#F06225]"
                  [ngModel]="field.value"
                  (ngModelChange)="updateField(field.key, $event)"
                />
              }
            </div>
          }

          <button
            type="button"
            class="mt-2 w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            (click)="store.removeNode(store.selectedNode()!.id)"
          >
            Delete Node
          </button>
        </div>
      }
    </div>
  `,
})
export class PropertiesPanelComponent {
  protected readonly store = inject(WorkflowEditorStore);
  readonly runChat = output<void>();

  protected hasAgentConnected(): boolean {
    return this.store.nodes().some((n) => n.type === 'ai_agent');
  }

  protected agentStatus(): {
    chatModel: boolean;
    memory: boolean;
    tool: boolean;
    flowInput: boolean;
  } {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'ai_agent') {
      return { chatModel: false, memory: false, tool: false, flowInput: false };
    }
    return this.store.getAgentAttachmentStatus(node.id);
  }

  protected fields(): {
    key: string;
    label: string;
    value: string;
    type: 'text' | 'textarea' | 'select';
    options?: string[];
  }[] {
    const node = this.store.selectedNode();
    if (!node) return [];

    const d = node.data;
    switch (node.type) {
      case 'webhook':
        return [
          { key: 'path', label: 'Webhook Path', value: String(d['path'] ?? ''), type: 'text' },
          { key: 'method', label: 'Method', value: String(d['method'] ?? 'POST'), type: 'select', options: ['GET', 'POST', 'PUT'] },
        ];
      case 'chat_trigger':
        return [
          { key: 'channel', label: 'Channel', value: String(d['channel'] ?? 'web'), type: 'select', options: ['web', 'slack', 'whatsapp'] },
        ];
      case 'ai_agent':
        return [
          { key: 'instructions', label: 'Agent Instructions', value: String(d['instructions'] ?? ''), type: 'textarea' },
          { key: 'outputKey', label: 'Output Key', value: String(d['outputKey'] ?? 'aiResponse'), type: 'text' },
        ];
      case 'chat_model':
        return [
          { key: 'provider', label: 'Provider', value: String(d['provider'] ?? 'openai'), type: 'select', options: ['openai', 'gemini'] },
          { key: 'model', label: 'Model', value: String(d['model'] ?? 'gpt-4o-mini'), type: 'text' },
        ];
      case 'memory':
        return [
          { key: 'memoryType', label: 'Type', value: String(d['memoryType'] ?? 'window_buffer'), type: 'text' },
          { key: 'windowSize', label: 'Window Size', value: String(d['windowSize'] ?? '10'), type: 'text' },
        ];
      case 'tool':
        return [
          { key: 'name', label: 'Tool Name', value: String(d['name'] ?? ''), type: 'text' },
          { key: 'toolType', label: 'Tool Type', value: String(d['toolType'] ?? 'workflow'), type: 'select', options: ['workflow', 'http', 'search'] },
        ];
      case 'http':
        return [
          { key: 'url', label: 'URL', value: String(d['url'] ?? ''), type: 'text' },
          { key: 'method', label: 'Method', value: String(d['method'] ?? 'GET'), type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        ];
      case 'ai':
        return [
          { key: 'provider', label: 'Provider', value: String(d['provider'] ?? 'openai'), type: 'select', options: ['openai', 'gemini'] },
          { key: 'prompt', label: 'Prompt', value: String(d['prompt'] ?? ''), type: 'textarea' },
          { key: 'outputKey', label: 'Output Key', value: String(d['outputKey'] ?? 'aiResponse'), type: 'text' },
        ];
      case 'email':
        return [
          { key: 'to', label: 'To', value: String(d['to'] ?? ''), type: 'text' },
          { key: 'subject', label: 'Subject', value: String(d['subject'] ?? ''), type: 'text' },
          { key: 'body', label: 'Body', value: String(d['body'] ?? ''), type: 'textarea' },
        ];
      case 'slack':
        return [
          { key: 'channel', label: 'Channel', value: String(d['channel'] ?? ''), type: 'text' },
          { key: 'message', label: 'Message', value: String(d['message'] ?? ''), type: 'textarea' },
        ];
      case 'spreadsheet':
        return [
          { key: 'action', label: 'Action', value: String(d['action'] ?? 'add_row'), type: 'select', options: ['add_row', 'read', 'sum_column'] },
          { key: 'sheetName', label: 'Sheet Name', value: String(d['sheetName'] ?? 'Sheet1'), type: 'text' },
          { key: 'headers', label: 'Headers (comma-separated)', value: String(d['headers'] ?? 'Name,Value'), type: 'text' },
          { key: 'rowCol1', label: 'Row Col 1', value: String(d['rowCol1'] ?? '{{name}}'), type: 'text' },
          { key: 'rowCol2', label: 'Row Col 2', value: String(d['rowCol2'] ?? '{{aiResponse}}'), type: 'text' },
        ];
      case 'condition':
        return [
          { key: 'field', label: 'Field', value: String(d['field'] ?? ''), type: 'text' },
          { key: 'operator', label: 'Operator', value: String(d['operator'] ?? 'equals'), type: 'select', options: ['equals', 'contains', 'exists'] },
          { key: 'value', label: 'Value', value: String(d['value'] ?? ''), type: 'text' },
        ];
      case 'delay':
        return [
          { key: 'seconds', label: 'Seconds', value: String(d['seconds'] ?? '1'), type: 'text' },
        ];
      case 'schedule':
        return [
          { key: 'cron', label: 'Cron Expression', value: String(d['cron'] ?? ''), type: 'text' },
        ];
      default:
        return [];
    }
  }

  protected updateField(key: string, value: string): void {
    const node = this.store.selectedNode();
    if (!node) return;
    const parsed =
      key === 'seconds' || key === 'windowSize' ? Number(value) : value;
    this.store.updateNodeData(node.id, { [key]: parsed });
  }

  protected onModeChange(mode: ExecutionMode): void {
    this.store.executionMode.set(mode);
  }
}
