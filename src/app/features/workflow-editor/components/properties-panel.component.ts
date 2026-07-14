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
              class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
              [ngModel]="store.workflowName()"
              (ngModelChange)="store.workflowName.set($event)"
            />
          </div>
          <div>
            <label class="block text-xs text-[#757575]">Execution Mode</label>
            <select
              class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
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
          <p class="rounded-lg border border-[#D5F2F0] bg-[#1FA8A3]/5 p-3 text-xs text-[#757575]">
            Connect nodes with <strong class="text-[#2BBFBA]">wires</strong> — they run in that order:
            Chat → HTTP → AI Agent. Type a prompt below and click <strong class="text-[#2BBFBA]">Chat</strong>.
            <a routerLink="/settings" class="mt-2 block text-[#2BBFBA] hover:underline">API key →</a>
          </p>
        </div>
      } @else {
        <div class="mt-4 space-y-3 overflow-y-auto">
          <div>
            <label class="block text-xs text-[#757575]">Label</label>
            <input
              class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
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
                Enter a prompt → Run → the connected workflow executes
              </p>

              <label class="mt-3 block text-xs font-medium text-[#4A4A4A]">Your message / prompt</label>
              <textarea
                class="mt-1.5 w-full rounded-lg border border-rose-500/30 bg-white px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-rose-400"
                rows="4"
                [ngModel]="store.chatInput()"
                (ngModelChange)="store.chatInput.set($event)"
                placeholder="e.g. I need a refund for order #123"
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
                          ? 'bg-[#2BBFBA]/30 text-[#17807C]'
                          : msg.role === 'error'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-[#F5FBFA] text-[#4A4A4A]'
                      "
                    >
                      {{ msg.text }}
                    </div>
                  }
                </div>
              }

              @if (!hasAgentConnected()) {
                <p class="mt-2 text-[11px] text-amber-600">
                  Connect an AI Agent (Chat → Agent wire) or load the template
                </p>
              }
            </div>
          }

          @if (store.selectedNode()!.type === 'ai_agent') {
            <div class="rounded-lg border border-[#9FE0DC] bg-[#F5FBFA] p-3 text-xs">
              <p class="font-medium text-[#2BBFBA]">AI Agent</p>
              <ul class="mt-2 space-y-1 text-[#757575]">
                <li>{{ agentStatus().chatModel ? '✓' : '✗' }} Chat Model</li>
                <li>{{ agentStatus().memory ? '✓' : '○' }} Memory</li>
                <li>{{ agentStatus().flowInput ? '✓' : '✗' }} Trigger connected</li>
              </ul>
              @if (!agentStatus().chatModel) {
                <button
                  type="button"
                  class="mt-3 w-full rounded-lg border border-[#9FE0DC] px-3 py-2 text-[#2BBFBA] hover:bg-[#E6F7F6]"
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
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
                  rows="3"
                  [ngModel]="field.value"
                  (ngModelChange)="updateField(field.key, $event)"
                ></textarea>
              } @else if (field.type === 'select') {
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
                  [ngModel]="field.value"
                  (ngModelChange)="updateField(field.key, $event)"
                >
                  @for (opt of field.options; track opt) {
                    <option [value]="opt">{{ opt }}</option>
                  }
                </select>
              } @else {
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
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
      case 'condition':
        return [
          { key: 'field', label: 'Field', value: String(d['field'] ?? ''), type: 'text' },
          { key: 'operator', label: 'Operator', value: String(d['operator'] ?? 'equals'), type: 'select', options: ['equals', 'contains', 'exists'] },
          { key: 'value', label: 'Value', value: String(d['value'] ?? ''), type: 'text' },
        ];
      case 'switch':
        return [
          { key: 'field', label: 'Field', value: String(d['field'] ?? ''), type: 'text' },
          { key: 'case0', label: 'Case 0', value: String(d['case0'] ?? ''), type: 'text' },
          { key: 'case1', label: 'Case 1', value: String(d['case1'] ?? ''), type: 'text' },
        ];
      case 'delay':
        return [
          { key: 'seconds', label: 'Seconds', value: String(d['seconds'] ?? '1'), type: 'text' },
        ];
      case 'schedule':
        return [
          { key: 'hour', label: 'Hour (0-23, Karachi)', value: String(d['hour'] ?? '9'), type: 'text' },
          { key: 'minute', label: 'Minute (0-59)', value: String(d['minute'] ?? '0'), type: 'text' },
          { key: 'timezone', label: 'Timezone', value: String(d['timezone'] ?? 'Asia/Karachi'), type: 'text' },
          { key: 'cron', label: 'Cron (optional override)', value: String(d['cron'] ?? ''), type: 'text' },
        ];
      case 'spreadsheet':
        return [
          { key: 'action', label: 'Action', value: String(d['action'] ?? 'load_posts'), type: 'select', options: ['load_posts', 'add_row', 'read', 'sum_column'] },
          { key: 'postsCsv', label: 'Posts CSV (Message,Link,ImageUrl)', value: String(d['postsCsv'] ?? ''), type: 'textarea' },
          { key: 'pickMode', label: 'Pick Mode', value: String(d['pickMode'] ?? 'rotate_daily'), type: 'select', options: ['rotate_daily', 'first'] },
          { key: 'sheetName', label: 'Sheet Name', value: String(d['sheetName'] ?? 'Posts'), type: 'text' },
          { key: 'rowCol1', label: 'Row Col 1 (add_row)', value: String(d['rowCol1'] ?? '{{name}}'), type: 'text' },
          { key: 'rowCol2', label: 'Row Col 2 (add_row)', value: String(d['rowCol2'] ?? '{{aiResponse}}'), type: 'text' },
        ];
      case 'facebook':
        return [
          { key: 'pageId', label: 'Facebook Page ID', value: String(d['pageId'] ?? ''), type: 'text' },
          { key: 'accessToken', label: 'Page Access Token', value: String(d['accessToken'] ?? ''), type: 'text' },
          { key: 'message', label: 'Message', value: String(d['message'] ?? '{{nextPost.message}}'), type: 'textarea' },
          { key: 'link', label: 'Link (optional)', value: String(d['link'] ?? '{{nextPost.link}}'), type: 'text' },
          { key: 'dryRun', label: 'Dry Run (true/false)', value: String(d['dryRun'] ?? 'true'), type: 'select', options: ['true', 'false'] },
        ];
      case 'instagram':
        return [
          { key: 'igUserId', label: 'Instagram Business User ID', value: String(d['igUserId'] ?? ''), type: 'text' },
          { key: 'accessToken', label: 'Access Token', value: String(d['accessToken'] ?? ''), type: 'text' },
          { key: 'caption', label: 'Caption', value: String(d['caption'] ?? '{{nextPost.message}}'), type: 'textarea' },
          { key: 'imageUrl', label: 'Image URL (required)', value: String(d['imageUrl'] ?? '{{nextPost.imageUrl}}'), type: 'text' },
          { key: 'dryRun', label: 'Dry Run (true/false)', value: String(d['dryRun'] ?? 'true'), type: 'select', options: ['true', 'false'] },
        ];
      case 'linkedin':
        return [
          { key: 'accessToken', label: 'Access Token', value: String(d['accessToken'] ?? ''), type: 'text' },
          { key: 'authorUrn', label: 'Author URN', value: String(d['authorUrn'] ?? ''), type: 'text' },
          { key: 'text', label: 'Post Text', value: String(d['text'] ?? '{{nextPost.message}}'), type: 'textarea' },
          { key: 'dryRun', label: 'Dry Run (true/false)', value: String(d['dryRun'] ?? 'true'), type: 'select', options: ['true', 'false'] },
        ];
      case 'set':
        return [
          {
            key: 'assignments',
            label: 'Assignments (key=value per line)',
            value: String(d['assignments'] ?? ''),
            type: 'textarea',
          },
        ];
      case 'filter':
        return [
          { key: 'field', label: 'Field', value: String(d['field'] ?? ''), type: 'text' },
          { key: 'operator', label: 'Operator', value: String(d['operator'] ?? 'equals'), type: 'select', options: ['equals', 'contains', 'exists', 'notEmpty'] },
          { key: 'value', label: 'Value', value: String(d['value'] ?? ''), type: 'text' },
        ];
      case 'merge':
        return [
          { key: 'outputKey', label: 'Output Key', value: String(d['outputKey'] ?? 'merged'), type: 'text' },
        ];
      case 'split_out':
        return [
          { key: 'field', label: 'Array Field', value: String(d['field'] ?? 'items'), type: 'text' },
        ];
      case 'aggregate':
        return [
          { key: 'field', label: 'Field', value: String(d['field'] ?? 'items'), type: 'text' },
          { key: 'operation', label: 'Operation', value: String(d['operation'] ?? 'count'), type: 'select', options: ['count', 'join', 'sum'] },
        ];
      case 'stop_and_error':
        return [
          { key: 'message', label: 'Error Message', value: String(d['message'] ?? ''), type: 'textarea' },
        ];
      case 'respond_webhook':
        return [
          { key: 'statusCode', label: 'Status Code', value: String(d['statusCode'] ?? '200'), type: 'text' },
          { key: 'body', label: 'Response Body', value: String(d['body'] ?? ''), type: 'textarea' },
        ];
      case 'discord':
        return [
          { key: 'webhookUrl', label: 'Discord Webhook URL', value: String(d['webhookUrl'] ?? ''), type: 'text' },
          { key: 'content', label: 'Message', value: String(d['content'] ?? ''), type: 'textarea' },
        ];
      case 'telegram':
        return [
          { key: 'botToken', label: 'Bot Token', value: String(d['botToken'] ?? ''), type: 'text' },
          { key: 'chatId', label: 'Chat ID', value: String(d['chatId'] ?? ''), type: 'text' },
          { key: 'text', label: 'Text', value: String(d['text'] ?? ''), type: 'textarea' },
        ];
      case 'graphql':
        return [
          { key: 'url', label: 'Endpoint URL', value: String(d['url'] ?? ''), type: 'text' },
          { key: 'query', label: 'Query', value: String(d['query'] ?? ''), type: 'textarea' },
          { key: 'variables', label: 'Variables JSON', value: String(d['variables'] ?? '{}'), type: 'textarea' },
        ];
      case 'datetime':
        return [
          { key: 'outputKey', label: 'Output Key', value: String(d['outputKey'] ?? 'now'), type: 'text' },
          { key: 'format', label: 'Format', value: String(d['format'] ?? 'iso'), type: 'select', options: ['iso', 'unix', 'locale'] },
        ];
      case 'crypto':
        return [
          { key: 'algorithm', label: 'Algorithm', value: String(d['algorithm'] ?? 'sha256'), type: 'select', options: ['sha256', 'md5'] },
          { key: 'value', label: 'Value', value: String(d['value'] ?? ''), type: 'text' },
          { key: 'outputKey', label: 'Output Key', value: String(d['outputKey'] ?? 'hash'), type: 'text' },
        ];
      case 'html':
        return [
          { key: 'field', label: 'HTML Field', value: String(d['field'] ?? 'htmlData'), type: 'text' },
          { key: 'outputKey', label: 'Output Key', value: String(d['outputKey'] ?? 'htmlText'), type: 'text' },
        ];
      case 'rss':
        return [
          { key: 'url', label: 'Feed URL', value: String(d['url'] ?? ''), type: 'text' },
          { key: 'limit', label: 'Limit', value: String(d['limit'] ?? '5'), type: 'text' },
        ];
      case 'postgres':
        return [
          { key: 'mode', label: 'Mode', value: String(d['mode'] ?? 'select'), type: 'select', options: ['select', 'raw'] },
          { key: 'query', label: 'SQL Query', value: String(d['query'] ?? ''), type: 'textarea' },
        ];
      case 'code':
        return [
          { key: 'code', label: 'JavaScript', value: String(d['code'] ?? ''), type: 'textarea' },
        ];
      default:
        return [];
    }
  }

  protected updateField(key: string, value: string): void {
    const node = this.store.selectedNode();
    if (!node) return;
    const parsed =
      key === 'seconds' ||
      key === 'windowSize' ||
      key === 'limit' ||
      key === 'statusCode' ||
      key === 'hour' ||
      key === 'minute'
        ? Number(value)
        : value;

    const patch: Record<string, unknown> = { [key]: parsed };

    // Keep cron in sync when editing Schedule hour/minute
    if (node.type === 'schedule' && (key === 'hour' || key === 'minute')) {
      const hour = key === 'hour' ? Number(value) : Number(node.data['hour'] ?? 9);
      const minute =
        key === 'minute' ? Number(value) : Number(node.data['minute'] ?? 0);
      patch['cron'] = `${minute} ${hour} * * *`;
    }

    this.store.updateNodeData(node.id, patch);
  }

  protected onModeChange(mode: ExecutionMode): void {
    this.store.executionMode.set(mode);
  }
}
