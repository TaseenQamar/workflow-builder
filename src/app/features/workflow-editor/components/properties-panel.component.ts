import { Component, OnInit, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of, timeout } from 'rxjs';
import { WorkflowEditorStore } from '../workflow-editor.store';
import { ApiService } from '../../../core/services/api.service';
import {
  AiIntegrationStatus,
  ExecutionMode,
} from '../../../core/models/workflow.models';
import {
  AiProviderChoice,
  getLlmPreset,
  LLM_PROVIDER_PRESETS,
  readStoredAiProvider,
  storeAiProvider,
} from '../../../core/constants/node-definitions';

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

          @if (store.selectedNode()!.type === 'chat_model') {
            <section class="rounded-xl border border-[#D9E5E3] bg-[#F5FBFA] p-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-semibold uppercase tracking-wide text-[#2BBFBA]">
                  Chat Models
                </p>
                <button
                  type="button"
                  class="text-[10px] text-[#757575] hover:text-[#2BBFBA]"
                  (click)="refreshAiStatus()"
                >
                  Refresh
                </button>
              </div>
              <p class="mt-1 text-[11px] text-[#757575]">
                Free: Gemini · Groq · OpenRouter · Ollama · Custom URL
              </p>

              <label class="mt-2 block text-[10px] font-medium text-[#757575]">Active provider</label>
              <select
                class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
                [ngModel]="activeProvider()"
                (ngModelChange)="onProviderPick($event)"
                [disabled]="savingProvider"
              >
                @for (p of presets; track p.id) {
                  <option [value]="p.id">
                    {{ p.label }}{{ p.free ? ' (free)' : '' }}
                  </option>
                }
              </select>

              <label class="mt-2 block text-[10px] font-medium text-[#757575]">API Base URL</label>
              <input
                class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
                [(ngModel)]="endpointBaseUrl"
                [disabled]="activeProvider() === 'gemini'"
                placeholder="https://api.groq.com/openai/v1"
              />

              <label class="mt-2 block text-[10px] font-medium text-[#757575]">API Key</label>
              <input
                type="password"
                class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
                [(ngModel)]="endpointKey"
                placeholder="Paste key (optional for Ollama)"
              />

              <label class="mt-2 block text-[10px] font-medium text-[#757575]">Model</label>
              <input
                class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
                [(ngModel)]="endpointModel"
                placeholder="llama-3.1-8b-instant"
              />
              @if (modelHints().length) {
                <div class="mt-1 flex flex-wrap gap-1">
                  @for (m of modelHints(); track m) {
                    <button
                      type="button"
                      class="rounded border border-[#CDDBD9] bg-white px-1.5 py-0.5 text-[9px] text-[#4A4A4A] hover:border-[#2BBFBA]"
                      (click)="endpointModel = m"
                    >
                      {{ m.split('/').pop() }}
                    </button>
                  }
                </div>
              }

              <button
                type="button"
                class="mt-3 w-full rounded-lg bg-[#2BBFBA] py-1.5 text-[11px] font-medium text-white hover:bg-[#1FA8A3] disabled:opacity-50"
                [disabled]="savingEndpoint"
                (click)="saveEndpoint()"
              >
                {{ savingEndpoint ? 'Saving…' : 'Save & use' }}
              </button>

              @if (aiMessage()) {
                <p class="mt-2 text-[10px] text-emerald-700">{{ aiMessage() }}</p>
              }
              @if (aiError()) {
                <p class="mt-2 text-[10px] text-red-600">{{ aiError() }}</p>
              }
              <a
                routerLink="/settings"
                class="mt-2 block text-[10px] text-[#2BBFBA] hover:underline"
              >
                Full Settings →
              </a>
            </section>
          }

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
              <p class="font-medium text-[#2BBFBA]">AI Agent (n8n Tools Agent)</p>
              <p class="mt-1 text-[10px] text-[#4A4A4A]">
                <strong>Like n8n:</strong> Chat → Agent (main).
                Connect Google Sheets / Email to the Agent’s bottom <strong>Tool</strong> port.
                The agent calls Sheets when asked; after a sheet write it also sends Email (tool port).
              </p>
              <ul class="mt-2 space-y-1 text-[#757575]">
                <li>{{ agentStatus().chatModel ? '✓' : '✗' }} Chat Model (API key in Settings)</li>
                <li>{{ agentStatus().memory ? '✓' : '○' }} Memory (Window Buffer)</li>
                <li>{{ agentStatus().tool ? '✓' : '○' }} Tool(s) — Sheets / Email</li>
                <li>{{ agentStatus().flowInput ? '✓' : '✗' }} Trigger connected</li>
              </ul>
              @if (agentStatus().memory) {
                <p class="mt-2 text-[11px] text-emerald-700">
                  Memory on — saved in <strong>PostgreSQL</strong> (n8n-style window buffer). Select the Memory node for window length / session key. <strong>New chat</strong> clears the session.
                </p>
              } @else {
                <p class="mt-2 text-[11px] text-amber-600">
                  No Memory attached — each message is forgotten. Click “Attach Model + Memory” or wire a Window Buffer Memory node.
                </p>
              }
              @if (!agentStatus().chatModel) {
                <button
                  type="button"
                  class="mt-3 w-full rounded-lg border border-[#9FE0DC] px-3 py-2 text-[#2BBFBA] hover:bg-[#E6F7F6]"
                  (click)="
                    store.attachAgentDefaults(store.selectedNode()!.id, {
                      includeMemory: true,
                    })
                  "
                >
                  Attach Model + Memory
                </button>
              }
            </div>
          }

          @if (store.selectedNode()!.type === 'spreadsheet') {
            <div class="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-[#4A4A4A]">
              <p class="font-semibold text-emerald-800">How to use Spreadsheet (Excel-like)</p>
              <p class="mt-1 text-[11px] text-[#757575]">
                Not a desktop Excel file picker — paste/fill data here; it is saved in <strong>PostgreSQL</strong> (by sheet name).
              </p>
              <ol class="mt-2 list-decimal space-y-1 pl-4 text-[11px] text-[#575757]">
                <li>Enter a <strong>Sheet Name</strong> (e.g. Posts)</li>
                <li>First time: Action = <strong>import_csv</strong> → paste CSV below → Run/Chat</li>
                <li>New data: Action = <strong>add_row</strong> → Col 1 AI output template (aiResponse)</li>
                <li>Existing row: Action = <strong>update_row</strong> → Row # + Cell value</li>
                <li>For Facebook: Action = <strong>load_posts</strong> → next node uses nextPost fields</li>
              </ol>
              <p class="mt-2 rounded border border-emerald-200 bg-white px-2 py-1.5 font-mono text-[10px] text-[#333]">
                Message,Link,ImageUrl<br />
                Hello world,,https://picsum.photos/800<br />
                Second post,https://example.com,
              </p>
            </div>
          }

          @if (store.selectedNode()!.type === 'email') {
            <div class="rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] p-3 text-xs text-[#4A4A4A]">
              <p class="font-medium text-[#1A1A1A]">Recipient only — no Gmail password here</p>
              <p class="mt-1">
                Put any email in <strong>To</strong> (recipient). Do not use placeholders like
                <code>your_email@example.com</code> — use a real inbox.
                Platform sends From the address in Settings → Outbound Email (must be SendGrid-verified).
              </p>
              @if (emailMailerConfigured()) {
                <p class="mt-2 text-emerald-700">
                  ✓ Platform mailer ready
                  @if (emailMailerFrom()) {
                    <span class="text-[#757575]"> (from {{ emailMailerFrom() }})</span>
                  }
                </p>
              } @else {
                <p class="mt-2 text-amber-700">
                  {{ emailMailerMsg() || 'Configure Outbound Email in Settings once for the whole app.' }}
                </p>
              }
            </div>
          }

          @if (store.selectedNode()!.type === 'google_sheets') {
            <div class="space-y-3 rounded-lg border border-green-300 bg-green-50 p-3 text-xs text-[#4A4A4A]">
              <p class="font-semibold text-green-800">Google Sheets (this workflow)</p>
              <p class="text-[10px] text-[#757575]">
                Credentials + document/tab are set here on the node — not in Settings. Each workflow can use a different sheet.
              </p>

              <!-- 1) Credential -->
              <div class="rounded-lg border border-green-200 bg-white p-2">
                <p class="text-[10px] font-semibold uppercase text-[#757575]">Credential to connect with</p>
                @if (googleSheetsConfigured()) {
                  <p class="mt-1 text-[11px] text-emerald-700">
                    ✓ Google Sheets account
                    @if (googleSheetsEmail()) {
                      <span class="block truncate text-[10px] text-[#757575]">{{ googleSheetsEmail() }}</span>
                    }
                  </p>
                } @else {
                  <p class="mt-1 text-[11px] text-amber-700">No credential — paste Service Account JSON below</p>
                  <textarea
                    class="mt-1 w-full rounded border border-[#CDDBD9] px-2 py-1 font-mono text-[10px] outline-none focus:border-green-500"
                    rows="3"
                    [(ngModel)]="googleSheetsJson"
                    placeholder='{"type":"service_account","client_email":"...","private_key":"..."}'
                  ></textarea>
                  <button
                    type="button"
                    class="mt-1 w-full rounded bg-green-700 py-1.5 text-[11px] text-white disabled:opacity-50"
                    [disabled]="savingGoogleSheets || !googleSheetsJson.trim()"
                    (click)="saveGoogleSheetsFromPanel()"
                  >
                    {{ savingGoogleSheets ? 'Saving…' : 'Save credential' }}
                  </button>
                }
                @if (googleSheetsMsg()) {
                  <p class="mt-1 text-[10px] text-emerald-700">{{ googleSheetsMsg() }}</p>
                }
                @if (googleSheetsErr()) {
                  <p class="mt-1 text-[10px] text-red-600">{{ googleSheetsErr() }}</p>
                }
              </div>

              <!-- 2) Document -->
              <div>
                <label class="block text-[10px] font-medium text-[#757575]">Document (By URL / ID)</label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-green-500"
                  [ngModel]="gsDocInput()"
                  (ngModelChange)="gsDocInput.set($event)"
                  placeholder="https://docs.google.com/spreadsheets/d/...."
                />
                <button
                  type="button"
                  class="mt-1.5 w-full rounded-lg border border-green-600 bg-white py-1.5 text-[11px] font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
                  [disabled]="loadingSheets || !gsDocInput().trim() || !googleSheetsConfigured()"
                  (click)="loadGoogleSheetTabs()"
                >
                  {{ loadingSheets ? 'Loading sheets…' : 'Load sheets (From list)' }}
                </button>
              </div>

              <!-- 3) Sheet From list -->
              <div>
                <label class="block text-[10px] font-medium text-[#757575]">Sheet (From list)</label>
                @if (gsSheetOptions().length) {
                  <select
                    class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-green-500"
                    [ngModel]="gsSelectedSheet()"
                    (ngModelChange)="onGoogleSheetTabPick($event)"
                  >
                    <option value="">Select sheet…</option>
                    @for (t of gsSheetOptions(); track t.title) {
                      <option [value]="t.title">{{ t.title }}</option>
                    }
                  </select>
                } @else {
                  <p class="mt-1 text-[10px] text-[#9A9A9A]">
                    Save credential + Document URL first → Load sheets
                  </p>
                }
              </div>

              <!-- 4) Operation -->
              <div>
                <label class="block text-[10px] font-medium text-[#757575]">Operation</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-green-500"
                  [ngModel]="gsOperation()"
                  (ngModelChange)="onGsOperation($event)"
                >
                  <option value="auto">Chat driven (understands intent)</option>
                  <option value="append">Add / Append new row</option>
                  <option value="update_matching">Update by filter (any column)</option>
                  <option value="delete_matching">Delete by filter (any column)</option>
                  <option value="update">Update fixed range (A2:F2)</option>
                  <option value="read">Get Row(s) / Read</option>
                </select>
                @if (gsOperation() === 'auto' || gsOperation() === 'chat') {
                  <p class="mt-1 text-[10px] text-green-800">
                    In chat say: “update the sheet” / “add a new row”. Values come from the right sidebar columns. Saying “hi” will not change the sheet.
                  </p>
                }
              </div>

              <!-- Filter update / delete (n8n-like) -->
              @if (
                gsOperation() === 'update_matching' ||
                gsOperation() === 'delete_matching' ||
                gsOperation() === 'auto' ||
                gsOperation() === 'chat'
              ) {
                <div class="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
                  <p class="text-[10px] font-semibold text-amber-900">
                    {{ gsOperation() === 'delete_matching' ? 'Delete matching rows' : 'Update matching rows' }}
                  </p>
                  <div>
                    <label class="block text-[10px] text-[#757575]">Lookup column (from sheet)</label>
                    <select
                      class="mt-0.5 w-full rounded border border-[#CDDBD9] bg-white px-2 py-1 text-xs"
                      [ngModel]="gsLookupColumn()"
                      (ngModelChange)="setGsLookupColumn($event)"
                    >
                      @if (!gsHeaders().length) {
                        <option value="">Load columns first…</option>
                      }
                      @for (h of gsHeaders(); track h) {
                        <option [value]="h">{{ h }}</option>
                      }
                    </select>
                    <p class="mt-0.5 text-[10px] text-[#757575]">
                      Columns from your sheet appear here — pick any one.
                    </p>
                  </div>
                  <div>
                    <label class="block text-[10px] text-[#757575]">Which rows</label>
                    <select
                      class="mt-0.5 w-full rounded border border-[#CDDBD9] bg-white px-2 py-1 text-xs"
                      [ngModel]="gsMatchMode()"
                      (ngModelChange)="setGsMatchMode($event)"
                    >
                      <option value="all_rows">All non-empty in lookup column</option>
                      <option value="all">All rows matching value</option>
                      <option value="first">First match only</option>
                    </select>
                  </div>
                  @if (gsMatchMode() !== 'all_rows') {
                    <div>
                      <label class="block text-[10px] text-[#757575]">Lookup value</label>
                      <input
                        class="mt-0.5 w-full rounded border border-[#CDDBD9] bg-white px-2 py-1 text-xs"
                        [ngModel]="gsLookupValue()"
                        (ngModelChange)="setGsLookupValue($event)"
                        placeholder="Exact cell value to match"
                      />
                      <p class="mt-0.5 text-[10px] text-amber-700">
                        Exact value to match in the selected lookup column. For every non-empty row, choose “All non-empty…” above.
                      </p>
                    </div>
                  } @else {
                    <p class="text-[10px] text-amber-700">
                      All rows where the Lookup column is not empty will be updated/deleted.
                    </p>
                  }
                  @if (gsOperation() !== 'delete_matching') {
                    <p class="text-[10px] text-amber-800">
                      Only fill columns you want to change (2, 3, or as many as you need). Leave blank = skip.
                    </p>
                  } @else {
                    <p class="text-[10px] text-red-700">
                      Matching rows will be deleted. Set Dry Run=true before Execute to preview.
                    </p>
                  }
                </div>
              }

              <!-- 5) Columns -->
              @if (gsHeaders().length) {
                <div class="rounded-lg border border-green-200 bg-white p-2">
                  <div class="flex items-center justify-between">
                    <p class="text-[10px] font-semibold uppercase text-[#757575]">Columns</p>
                    <button
                      type="button"
                      class="text-[10px] text-green-700 hover:underline"
                      (click)="loadGoogleSheetHeaders()"
                    >
                      Refresh
                    </button>
                  </div>
                  @if (isGsChatOrFilterOp()) {
                    <div class="mt-1 flex flex-wrap gap-1">
                      <button
                        type="button"
                        class="rounded border border-green-600 px-1.5 py-0.5 text-[10px] text-green-800"
                        (click)="selectAllGsColumns()"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        class="rounded border border-[#CDDBD9] px-1.5 py-0.5 text-[10px] text-[#757575]"
                        (click)="clearGsColumnSelection()"
                      >
                        Clear selection
                      </button>
                    </div>
                  }
                  @if (gsOperation() !== 'read' && gsOperation() !== 'delete_matching') {
                    <p class="mt-2 text-[10px] text-[#757575]">
                      @if (isGsChatOrFilterOp()) {
                        Tick columns to update + value (chat “update” uses this data)
                      } @else {
                        Values to write
                      }
                    </p>
                    @for (h of gsHeaders(); track h) {
                      <div class="mt-1.5 rounded border border-[#E8F0EF] bg-[#F9FCFB] p-1.5">
                        <label class="flex items-center gap-1.5 text-[10px] font-medium text-[#4A4A4A]">
                          @if (isGsChatOrFilterOp()) {
                            <input
                              type="checkbox"
                              [checked]="isGsColumnSelected(h)"
                              (change)="toggleGsColumn(h, $any($event.target).checked)"
                            />
                          }
                          {{ h }}
                        </label>
                        <input
                          class="mt-0.5 w-full rounded border border-[#CDDBD9] bg-white px-2 py-1 text-xs outline-none focus:border-green-500"
                          [ngModel]="gsColumnValues()[h] ?? ''"
                          (ngModelChange)="setGsColumnValue(h, $event)"
                          [placeholder]="columnPlaceholder(h)"
                          [disabled]="isGsChatOrFilterOp() && !isGsColumnSelected(h)"
                        />
                      </div>
                    }
                  } @else {
                    <div class="mt-1 flex flex-wrap gap-1">
                      @for (h of gsHeaders(); track h) {
                        <span class="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-900">{{ h }}</span>
                      }
                    </div>
                  }
                </div>
              } @else if (gsSelectedSheet()) {
                <button
                  type="button"
                  class="w-full rounded border border-dashed border-green-500 py-2 text-[11px] text-green-800"
                  [disabled]="loadingHeaders"
                  (click)="loadGoogleSheetHeaders()"
                >
                  {{ loadingHeaders ? 'Loading columns…' : 'Load columns from sheet' }}
                </button>
              }

              @if (gsOperation() === 'update') {
                <div>
                  <label class="block text-[10px] font-medium text-[#757575]">Update range (e.g. A8:F8)</label>
                  <input
                    class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-green-500"
                    [ngModel]="gsRange()"
                    (ngModelChange)="gsRange.set($event); updateField('range', $event)"
                    placeholder="A8:F8"
                  />
                </div>
              }

              <div>
                <label class="block text-[10px] font-medium text-[#757575]">Dry Run</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-green-500"
                  [ngModel]="gsDryRun()"
                  (ngModelChange)="gsDryRun.set($event); updateField('dryRun', $event)"
                >
                  <option value="true">true (preview only)</option>
                  <option value="false">false (write to Google)</option>
                </select>
              </div>

              <!-- Save settings + Execute now (sidebar, without chat) -->
              <div class="space-y-2 rounded-lg border border-green-400 bg-white p-2">
                <p class="text-[10px] font-semibold uppercase text-[#757575]">Actions</p>
                <button
                  type="button"
                  class="w-full rounded-lg border border-teal-600 bg-teal-50 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100"
                  (click)="attachSheetsAsAgentTool()"
                >
                  Attach as AI Agent Tool (n8n)
                </button>
                <p class="text-[10px] text-teal-800">
                  Ya Sheets ke <strong>top teal dot</strong> se drag karke Agent ke neeche <strong>Tool</strong> port pe drop karo.
                </p>
                <button
                  type="button"
                  class="w-full rounded-lg border border-green-700 bg-white py-2 text-xs font-semibold text-green-900 hover:bg-green-50"
                  (click)="saveGoogleSheetsNodeSettings()"
                >
                  Save settings
                </button>
                <button
                  type="button"
                  class="w-full rounded-lg bg-green-700 py-2.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                  [disabled]="executingGs || !gsDocInput().trim() || !gsSelectedSheet()"
                  (click)="executeGoogleSheetsFromPanel()"
                >
                  {{
                    executingGs
                      ? 'Executing…'
                      : gsOperation() === 'delete_matching'
                        ? 'Execute — Delete rows'
                        : gsOperation() === 'append'
                          ? 'Execute — Add row'
                          : gsOperation() === 'update_matching' || gsOperation() === 'update'
                            ? 'Execute — Update'
                            : gsOperation() === 'read'
                              ? 'Execute — Read'
                              : 'Execute'
                  }}
                </button>
                <p class="text-[10px] text-[#757575]">
                  Save = store node settings. Execute = run the Google Sheet operation now (no chat needed).
                </p>
                @if (gsExecuteMsg()) {
                  <p class="text-[10px] text-emerald-700 whitespace-pre-wrap">{{ gsExecuteMsg() }}</p>
                }
                @if (gsExecuteErr()) {
                  <p class="text-[10px] text-red-600 whitespace-pre-wrap">{{ gsExecuteErr() }}</p>
                }
              </div>
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

          @if (
            store.selectedNode()!.type === 'email' ||
            store.selectedNode()!.type === 'slack' ||
            store.selectedNode()!.type === 'http'
          ) {
            <button
              type="button"
              class="mt-2 w-full rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-100"
              (click)="attachSelectedAsAgentTool()"
            >
              Attach as AI Agent Tool
            </button>
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
export class PropertiesPanelComponent implements OnInit {
  protected readonly store = inject(WorkflowEditorStore);
  private readonly api = inject(ApiService);
  readonly runChat = output<void>();

  protected readonly presets = LLM_PROVIDER_PRESETS;
  protected readonly aiStatus = signal<AiIntegrationStatus>({
    openai: { configured: false, source: 'none' },
    gemini: { configured: false, source: 'none' },
    defaultProvider: readStoredAiProvider(),
    demoMode: true,
    message: '',
  });
  protected readonly aiMessage = signal<string | null>(null);
  protected readonly aiError = signal<string | null>(null);
  protected readonly activeProvider = signal<AiProviderChoice>(
    readStoredAiProvider(),
  );

  protected endpointKey = '';
  protected endpointBaseUrl = '';
  protected endpointModel = '';
  protected savingEndpoint = false;
  protected savingProvider = false;

  protected googleSheetsJson = '';
  protected savingGoogleSheets = false;
  protected loadingSheets = false;
  protected loadingHeaders = false;
  protected readonly googleSheetsConfigured = signal(false);
  protected readonly googleSheetsEmail = signal<string | null>(null);
  protected readonly googleSheetsMsg = signal<string | null>(null);
  protected readonly googleSheetsErr = signal<string | null>(null);
  protected readonly gsDocInput = signal('');
  protected readonly gsSheetOptions = signal<{ title: string; sheetId: number }[]>(
    [],
  );
  protected readonly gsSelectedSheet = signal('');
  protected readonly gsHeaders = signal<string[]>([]);
  protected readonly gsColumnValues = signal<Record<string, string>>({});
  protected readonly gsOperation = signal('auto');
  protected readonly gsRange = signal('');
  protected readonly gsDryRun = signal('true');
  protected readonly gsLookupColumn = signal('');
  protected readonly gsLookupValue = signal('*');
  protected readonly gsMatchMode = signal('all_rows');
  protected readonly gsSelectedColumns = signal<string[]>([]);
  protected readonly gsExecuteMsg = signal<string | null>(null);
  protected readonly gsExecuteErr = signal<string | null>(null);
  protected executingGs = false;

  protected readonly emailMailerConfigured = signal(false);
  protected readonly emailMailerFrom = signal<string | null>(null);
  protected readonly emailMailerMsg = signal<string | null>(null);

  private lastGsNodeId: string | null = null;
  private readonly _gsSelectEffect = effect(() => {
    const node = this.store.selectedNode();
    if (node?.type === 'google_sheets') {
      if (node.id !== this.lastGsNodeId) {
        this.lastGsNodeId = node.id;
        this.hydrateGoogleSheetsUi();
      }
    } else {
      this.lastGsNodeId = null;
    }
  });

  ngOnInit(): void {
    this.refreshAiStatus();
    this.refreshGoogleSheetsStatus();
    this.refreshEmailMailerStatus();
  }

  protected refreshEmailMailerStatus(): void {
    this.api.getEmailStatus().subscribe((s) => {
      this.emailMailerConfigured.set(!!s.configured);
      this.emailMailerFrom.set(s.fromEmail);
      this.emailMailerMsg.set(s.message);
    });
  }

  protected refreshGoogleSheetsStatus(): void {
    this.api.getGoogleSheetsStatus().subscribe((s) => {
      this.googleSheetsConfigured.set(!!s.configured);
      this.googleSheetsEmail.set(s.clientEmail);
    });
  }

  protected hydrateGoogleSheetsUi(): void {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'google_sheets') return;
    this.gsDocInput.set(String(node.data['spreadsheetId'] ?? ''));
    this.gsSelectedSheet.set(String(node.data['sheetName'] ?? ''));
    const savedOp = String(node.data['operation'] ?? 'auto');
    // Old append-only nodes used to write on every "hi" — migrate to chat-driven
    this.gsOperation.set(savedOp === 'append' ? 'auto' : savedOp);
    if (savedOp === 'append') {
      this.updateField('operation', 'auto');
      this.updateField('requireChatIntent', 'true');
    }
    this.gsRange.set(String(node.data['range'] ?? ''));
    this.gsDryRun.set(String(node.data['dryRun'] ?? 'true'));
    this.gsLookupColumn.set(String(node.data['lookupColumn'] ?? ''));
    const savedLookup = String(node.data['lookupValue'] ?? '*');
    // Old default {{message}} was wrong for bulk updates — coerce to *
    const badMsgDefault =
      savedLookup === '{{message}}' || savedLookup.includes('{{message}}');
    this.gsLookupValue.set(badMsgDefault ? '*' : savedLookup);
    const savedMode = String(node.data['matchMode'] ?? 'all_rows');
    // Prefer all_rows when previous default was "all" + chat message lookup
    const mode =
      badMsgDefault && (savedMode === 'all' || !node.data['matchMode'])
        ? 'all_rows'
        : savedMode === 'all' && (!savedLookup || savedLookup === '*')
          ? 'all_rows'
          : savedMode;
    this.gsMatchMode.set(mode);
    if (badMsgDefault || mode !== savedMode) {
      this.updateField('lookupValue', this.gsLookupValue());
      this.updateField('matchMode', mode);
    }
    const headers = node.data['headersList'];
    if (Array.isArray(headers)) this.gsHeaders.set(headers.map(String));
    const map = node.data['columnMap'];
    if (map && typeof map === 'object') {
      this.gsColumnValues.set({ ...(map as Record<string, string>) });
    }
    const cols = node.data['columnsToUpdate'];
    if (Array.isArray(cols)) this.gsSelectedColumns.set(cols.map(String));
  }

  protected saveGoogleSheetsFromPanel(): void {
    const json = this.googleSheetsJson.trim();
    if (!json) return;
    // Prevent pasting sheet URL into JSON box
    if (json.startsWith('http') || json.includes('docs.google.com')) {
      this.googleSheetsErr.set(
        'That is a sheet URL — paste Service Account JSON in the credentials box. Put the URL in the Document field below.',
      );
      return;
    }
    this.savingGoogleSheets = true;
    this.googleSheetsMsg.set(null);
    this.googleSheetsErr.set(null);
    this.api.saveGoogleSheetsCredentials(json).subscribe({
      next: (res) => {
        this.savingGoogleSheets = false;
        if (res.saved) {
          this.googleSheetsJson = '';
          this.googleSheetsMsg.set(
            (res.message ?? 'Saved') +
              ' — Share the sheet with this email as Editor, then Load sheets.',
          );
          this.refreshGoogleSheetsStatus();
        } else {
          this.googleSheetsErr.set(res.message ?? 'Save failed');
        }
      },
      error: (err) => {
        this.savingGoogleSheets = false;
        this.googleSheetsErr.set(
          err?.error?.message ??
            'Save failed — backend online? Settings → Backend API URL set?',
        );
      },
    });
  }

  protected loadGoogleSheetTabs(): void {
    const doc = this.gsDocInput().trim();
    if (!doc) return;
    this.loadingSheets = true;
    this.googleSheetsErr.set(null);
    this.updateField('spreadsheetId', doc);
    this.api.listGoogleSheetTabs(doc).subscribe((res) => {
      this.loadingSheets = false;
      if (!res.ok) {
        this.googleSheetsErr.set(
          res.message ??
            'Failed to load sheets — check credential and sheet share (Editor)',
        );
        this.gsSheetOptions.set([]);
        return;
      }
      this.gsSheetOptions.set(res.sheets ?? []);
      this.googleSheetsMsg.set(
        `${res.sheets?.length ?? 0} sheet(s) found — select one from the list`,
      );
      if (res.spreadsheetId) {
        this.updateField('spreadsheetId', res.spreadsheetId);
      }
    });
  }

  protected onGoogleSheetTabPick(title: string): void {
    this.gsSelectedSheet.set(title);
    this.updateField('sheetName', title);
    this.gsHeaders.set([]);
    if (title) this.loadGoogleSheetHeaders();
  }

  protected loadGoogleSheetHeaders(): void {
    const doc =
      String(this.store.selectedNode()?.data['spreadsheetId'] ?? '') ||
      this.gsDocInput();
    const sheet = this.gsSelectedSheet();
    if (!doc || !sheet) return;
    this.loadingHeaders = true;
    this.api.getGoogleSheetHeaders(doc, sheet).subscribe((res) => {
      this.loadingHeaders = false;
      if (!res.ok) {
        this.googleSheetsErr.set(res.message ?? 'Columns load failed');
        return;
      }
      const headers = res.headers ?? [];
      this.gsHeaders.set(headers);
      // Lookup = koi bhi sheet column; invalid/old "Ticket" default clear
      const currentLookup = this.gsLookupColumn();
      if (
        headers.length &&
        (!currentLookup || !headers.includes(currentLookup))
      ) {
        this.gsLookupColumn.set(headers[0]);
        this.updateField('lookupColumn', headers[0]);
      }
      this.store.updateNodeData(this.store.selectedNode()!.id, {
        headersList: headers,
        lookupColumn: this.gsLookupColumn() || headers[0] || '',
      });
      const prev = { ...this.gsColumnValues() };
      for (const h of headers) {
        if (prev[h] === undefined) {
          prev[h] =
            /task|message|caption/i.test(h) ? '{{aiResponse}}' : '';
        }
      }
      this.gsColumnValues.set(prev);
      this.persistGsColumnMap();
      this.googleSheetsMsg.set(`${headers.length} column(s) loaded`);
    });
  }

  protected setGsColumnValue(header: string, value: string): void {
    this.gsColumnValues.update((m) => ({ ...m, [header]: value }));
    this.persistGsColumnMap();
  }

  protected persistGsColumnMap(): void {
    const node = this.store.selectedNode();
    if (!node) return;
    this.store.updateNodeData(node.id, {
      columnMap: this.gsColumnValues(),
      headersList: this.gsHeaders(),
      columnsToUpdate: this.gsSelectedColumns(),
      lookupColumn: this.gsLookupColumn(),
      lookupValue: this.gsLookupValue(),
      matchMode: this.gsMatchMode(),
    });
  }

  protected onGsOperation(op: string): void {
    this.gsOperation.set(op);
    this.updateField('operation', op);
  }

  protected setGsLookupColumn(v: string): void {
    this.gsLookupColumn.set(v);
    this.updateField('lookupColumn', v);
  }

  protected setGsLookupValue(v: string): void {
    this.gsLookupValue.set(v);
    this.updateField('lookupValue', v);
  }

  protected setGsMatchMode(v: string): void {
    this.gsMatchMode.set(v);
    this.updateField('matchMode', v);
    if (v === 'all_rows') {
      this.gsLookupValue.set('*');
      this.updateField('lookupValue', '*');
    }
  }

  protected isGsChatOrFilterOp(): boolean {
    const op = this.gsOperation();
    return (
      op === 'update_matching' ||
      op === 'delete_matching' ||
      op === 'auto' ||
      op === 'chat'
    );
  }

  protected attachSheetsAsAgentTool(): void {
    const err = this.store.attachNodeAsAgentTool();
    if (err) {
      this.gsExecuteErr.set(err);
      this.gsExecuteMsg.set(null);
    } else {
      this.gsExecuteMsg.set('Attached to AI Agent Tool port ✓');
      this.gsExecuteErr.set(null);
    }
  }

  protected attachSelectedAsAgentTool(): void {
    const err = this.store.attachNodeAsAgentTool();
    if (err) this.store.error.set(err);
  }

  /** Persist Document / Operation / columns to the node (workflow editor). */
  protected saveGoogleSheetsNodeSettings(): void {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'google_sheets') return;

    const spreadsheetId = this.gsDocInput().trim();
    this.store.updateNodeData(node.id, {
      spreadsheetId,
      sheetName: this.gsSelectedSheet(),
      operation: this.gsOperation(),
      range: this.gsRange(),
      dryRun: this.gsDryRun(),
      lookupColumn: this.gsLookupColumn(),
      lookupValue: this.gsLookupValue(),
      matchMode: this.gsMatchMode(),
      columnMap: this.gsColumnValues(),
      headersList: this.gsHeaders(),
      columnsToUpdate: this.gsSelectedColumns(),
      requireChatIntent: this.gsOperation() === 'auto' ? 'true' : 'false',
    });
    this.gsExecuteMsg.set('Settings saved on node ✓');
    this.gsExecuteErr.set(null);
    this.store.message.set('Google Sheets node settings saved');
  }

  /** Run Add / Update / Delete on Google Sheet from sidebar (no chat). */
  protected executeGoogleSheetsFromPanel(): void {
    this.saveGoogleSheetsNodeSettings();
    this.gsExecuteMsg.set(null);
    this.gsExecuteErr.set(null);

    const op = this.gsOperation();
    if (op === 'auto' || op === 'chat') {
      this.gsExecuteErr.set(
        'Pick an Operation to Execute: Add row / Update by filter / Delete by filter (Chat driven is for chat only).',
      );
      return;
    }

    if (op === 'delete_matching' && this.gsDryRun() === 'false') {
      const ok = confirm(
        'Delete matching rows from Google Sheet? This cannot be undone.',
      );
      if (!ok) return;
    }

    this.executingGs = true;
    const data: Record<string, unknown> = {
      spreadsheetId: this.gsDocInput().trim(),
      sheetName: this.gsSelectedSheet(),
      operation: op,
      range: this.gsRange(),
      dryRun: this.gsDryRun(),
      lookupColumn: this.gsLookupColumn(),
      lookupValue: this.gsLookupValue(),
      matchMode: this.gsMatchMode(),
      columnMap: this.gsColumnValues(),
      headersList: this.gsHeaders(),
      columnsToUpdate: this.gsSelectedColumns(),
      panelDirect: 'true',
      requireChatIntent: 'false',
    };

    this.api
      .executeGoogleSheetsPanel({
        data,
        dryRun: this.gsDryRun(),
        message: 'panel-execute',
      })
      .subscribe({
        next: (res) => {
          this.executingGs = false;
          if (!res.ok) {
            this.gsExecuteErr.set(
              String(res.error ?? res.googleSheets?.['message'] ?? 'Failed'),
            );
            return;
          }
          const gs = res.googleSheets ?? {};
          if (gs['dryRun'] === true) {
            this.gsExecuteMsg.set(
              `Dry-run OK — would affect ${gs['matchedRows'] ?? gs['rowsToAppend'] ?? gs['rowsAppended'] ?? 1} row(s).\nSet Dry Run = false, then Execute again to write.`,
            );
            return;
          }
          const opDone = String(gs['operation'] ?? op);
          if (opDone === 'delete_matching') {
            this.gsExecuteMsg.set(
              `Deleted ${gs['matchedRows'] ?? 0} row(s) from ${gs['sheetName'] ?? 'sheet'}`,
            );
          } else if (opDone === 'append') {
            this.gsExecuteMsg.set(
              `Added ${gs['rowsAppended'] ?? 1} row(s) → ${gs['updatedRange'] ?? gs['sheetName'] ?? 'sheet'}`,
            );
          } else if (opDone === 'update_matching') {
            this.gsExecuteMsg.set(
              `Updated ${gs['matchedRows'] ?? 0} row(s) on ${gs['sheetName'] ?? 'sheet'}`,
            );
          } else if (opDone === 'read') {
            this.gsExecuteMsg.set(
              `Read ${gs['rows'] ?? 0} row(s) from ${gs['sheetName'] ?? 'sheet'}`,
            );
          } else {
            this.gsExecuteMsg.set(`Execute OK (${opDone})`);
          }
          this.store.message.set('Google Sheets Execute completed');
        },
        error: (err) => {
          this.executingGs = false;
          this.gsExecuteErr.set(err?.message ?? 'Execute failed');
        },
      });
  }

  protected isGsColumnSelected(header: string): boolean {
    const sel = this.gsSelectedColumns();
    if (!sel.length && this.isGsChatOrFilterOp()) {
      // Auto: any column with a value counts as selected
      return !!(this.gsColumnValues()[header] ?? '').trim();
    }
    return sel.includes(header);
  }

  protected toggleGsColumn(header: string, on: boolean): void {
    this.gsSelectedColumns.update((list) => {
      const set = new Set(list);
      if (on) set.add(header);
      else set.delete(header);
      return [...set];
    });
    this.persistGsColumnMap();
  }

  protected selectAllGsColumns(): void {
    this.gsSelectedColumns.set([...this.gsHeaders()]);
    this.persistGsColumnMap();
  }

  protected clearGsColumnSelection(): void {
    this.gsSelectedColumns.set([]);
    this.persistGsColumnMap();
  }

  protected columnPlaceholder(header: string): string {
    if (/task|message|caption/i.test(header)) return 'aiResponse template';
    return '';
  }

  protected modelHints(): string[] {
    return getLlmPreset(this.activeProvider()).models.slice(0, 4);
  }

  protected refreshAiStatus(): void {
    this.api.getAiIntegrationStatus().subscribe((s) => {
      const offline =
        s.message === 'Backend offline' ||
        !!s.message?.includes('Backend API URL not set');
      if (offline) {
        this.aiStatus.set({
          ...s,
          defaultProvider: readStoredAiProvider(),
        });
        this.syncFormFromStatus(readStoredAiProvider());
        return;
      }
      this.aiStatus.set(s);
      const provider = s.defaultProvider ?? readStoredAiProvider();
      storeAiProvider(provider);
      this.syncFormFromStatus(provider);
    });
  }

  private syncFormFromStatus(provider: AiProviderChoice): void {
    this.activeProvider.set(provider);
    const preset = getLlmPreset(provider);
    const status =
      this.aiStatus().providers?.[provider] ?? this.aiStatus()[provider];
    this.endpointBaseUrl = status?.baseUrl || preset.defaultBaseUrl;
    this.endpointModel = status?.defaultModel || preset.defaultModel;
  }

  protected onProviderPick(provider: AiProviderChoice): void {
    this.activeProvider.set(provider);
    const preset = getLlmPreset(provider);
    const status =
      this.aiStatus().providers?.[provider] ?? this.aiStatus()[provider];
    this.endpointBaseUrl = status?.baseUrl || preset.defaultBaseUrl;
    this.endpointModel = status?.defaultModel || preset.defaultModel;
    this.selectProvider(provider);
  }

  protected selectProvider(provider: AiProviderChoice): void {
    if (this.savingProvider) return;

    storeAiProvider(provider);
    this.store.setDefaultAiProvider(provider);
    this.aiStatus.update((s) => ({
      ...s,
      defaultProvider: provider,
    }));
    this.aiMessage.set(`Active: ${getLlmPreset(provider).label}`);
    this.aiError.set(null);
    this.savingProvider = true;

    this.api
      .setDefaultAiProvider(provider)
      .pipe(
        timeout(8000),
        catchError(() =>
          of({ defaultProvider: provider, saved: false as boolean }),
        ),
        finalize(() => {
          this.savingProvider = false;
        }),
      )
      .subscribe((res) => {
        storeAiProvider(provider);
        const label = getLlmPreset(provider).label;
        if (res.saved) {
          this.aiMessage.set(`${label} selected`);
        } else {
          this.aiMessage.set(
            `${label} selected on this device. Backend sync failed.`,
          );
        }
      });
  }

  protected saveEndpoint(): void {
    const provider = this.activeProvider();
    const preset = getLlmPreset(provider);
    const body: {
      provider: AiProviderChoice;
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
    } = { provider };

    if (this.endpointKey.trim()) body.apiKey = this.endpointKey.trim();
    if (provider !== 'gemini') {
      body.baseUrl = this.endpointBaseUrl.trim() || preset.defaultBaseUrl;
    }
    if (this.endpointModel.trim()) {
      body.defaultModel = this.endpointModel.trim();
    }

    if (provider === 'custom' && !body.baseUrl) {
      this.aiError.set('Enter a Custom API base URL');
      return;
    }

    this.savingEndpoint = true;
    this.aiMessage.set(null);
    this.aiError.set(null);
    this.api.saveLlmEndpoint(body).subscribe({
      next: () => {
        this.savingEndpoint = false;
        this.endpointKey = '';
        this.aiMessage.set(`${preset.label} saved`);
        this.selectProvider(provider);
        this.refreshAiStatus();
      },
      error: (err) => {
        this.savingEndpoint = false;
        this.aiError.set(
          err?.error?.message ?? 'Save failed — is the backend running?',
        );
      },
    });
  }

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
          {
            key: 'provider',
            label: 'Provider',
            value: String(d['provider'] ?? 'openai'),
            type: 'select',
            options: [
              'openai',
              'gemini',
              'groq',
              'openrouter',
              'ollama',
              'custom',
            ],
          },
          {
            key: 'model',
            label: 'Model',
            value: String(d['model'] ?? 'gpt-4o-mini'),
            type: 'text',
          },
        ];
      case 'memory':
        return [
          {
            key: 'memoryType',
            label: 'Memory Type',
            value: String(d['memoryType'] ?? 'window_buffer'),
            type: 'select',
            options: ['window_buffer'],
          },
          {
            key: 'windowSize',
            label: 'Context Window Length (past interactions)',
            value: String(d['windowSize'] ?? '10'),
            type: 'text',
          },
          {
            key: 'sessionKey',
            label: 'Session Key',
            value: String(d['sessionKey'] ?? '{{sessionId}}'),
            type: 'text',
          },
          {
            key: 'storage',
            label: 'Storage',
            value: String(d['storage'] ?? 'postgresql'),
            type: 'select',
            options: ['postgresql'],
          },
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
          {
            key: 'provider',
            label: 'Provider',
            value: String(d['provider'] ?? 'openai'),
            type: 'select',
            options: [
              'openai',
              'gemini',
              'groq',
              'openrouter',
              'ollama',
              'custom',
            ],
          },
          {
            key: 'model',
            label: 'Model',
            value: String(d['model'] ?? ''),
            type: 'text',
          },
          { key: 'prompt', label: 'Prompt', value: String(d['prompt'] ?? ''), type: 'textarea' },
          { key: 'outputKey', label: 'Output Key', value: String(d['outputKey'] ?? 'aiResponse'), type: 'text' },
        ];
      case 'email':
        return [
          {
            key: 'to',
            label: 'To (any email — notification recipient)',
            value: String(d['to'] ?? ''),
            type: 'text',
          },
          {
            key: 'subject',
            label: 'Subject',
            value: String(d['subject'] ?? '{{emailSubject}}'),
            type: 'text',
          },
          {
            key: 'body',
            label: 'Body (auto: sheet name + link + summary via {{emailNotifyBody}})',
            value: String(d['body'] ?? '{{emailNotifyBody}}'),
            type: 'textarea',
          },
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
      case 'google_sheets':
        // Custom n8n-style UI above — no generic fields
        return [];
      case 'spreadsheet':
        return [
          {
            key: 'action',
            label: 'Action',
            value: String(d['action'] ?? 'add_row'),
            type: 'select',
            options: [
              'add_row',
              'update_row',
              'read',
              'load_posts',
              'import_csv',
              'sum_column',
            ],
          },
          {
            key: 'sheetName',
            label: 'Sheet Name (saved in PostgreSQL)',
            value: String(d['sheetName'] ?? 'Posts'),
            type: 'text',
          },
          {
            key: 'headers',
            label: 'Headers (new sheet)',
            value: String(d['headers'] ?? 'Message,Link,ImageUrl'),
            type: 'text',
          },
          {
            key: 'rowCol1',
            label: 'Add row — Col 1',
            value: String(d['rowCol1'] ?? '{{aiResponse}}'),
            type: 'text',
          },
          {
            key: 'rowCol2',
            label: 'Add row — Col 2',
            value: String(d['rowCol2'] ?? ''),
            type: 'text',
          },
          {
            key: 'rowCol3',
            label: 'Add row — Col 3 (ImageUrl)',
            value: String(d['rowCol3'] ?? ''),
            type: 'text',
          },
          {
            key: 'rowIndex',
            label: 'Update — Row # (1 = first data row)',
            value: String(d['rowIndex'] ?? '1'),
            type: 'text',
          },
          {
            key: 'columnIndex',
            label: 'Update — Column index (0 = first)',
            value: String(d['columnIndex'] ?? '0'),
            type: 'text',
          },
          {
            key: 'cellValue',
            label: 'Update — Cell value',
            value: String(d['cellValue'] ?? '{{aiResponse}}'),
            type: 'text',
          },
          {
            key: 'columnUpdates',
            label: 'Update — Named cols (Message={{aiResponse}}|ImageUrl=...)',
            value: String(d['columnUpdates'] ?? ''),
            type: 'textarea',
          },
          {
            key: 'postsCsv',
            label: 'CSV import / load_posts fallback',
            value: String(d['postsCsv'] ?? ''),
            type: 'textarea',
          },
          {
            key: 'pickMode',
            label: 'Pick Mode (load_posts)',
            value: String(d['pickMode'] ?? 'rotate_daily'),
            type: 'select',
            options: ['rotate_daily', 'first'],
          },
        ];
      case 'facebook':
        return [
          { key: 'pageId', label: 'Facebook Page ID', value: String(d['pageId'] ?? ''), type: 'text' },
          { key: 'accessToken', label: 'Page Access Token', value: String(d['accessToken'] ?? ''), type: 'text' },
          { key: 'message', label: 'Caption / Message', value: String(d['message'] ?? '{{nextPost.message}}'), type: 'textarea' },
          { key: 'imageUrl', label: 'Image URL (public HTTPS — for photo post)', value: String(d['imageUrl'] ?? '{{nextPost.imageUrl}}'), type: 'text' },
          { key: 'link', label: 'Link (optional, text post only)', value: String(d['link'] ?? '{{nextPost.link}}'), type: 'text' },
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
