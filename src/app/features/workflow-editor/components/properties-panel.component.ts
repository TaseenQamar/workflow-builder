import { Component, OnInit, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of, timeout } from 'rxjs';
import { WorkflowEditorStore } from '../workflow-editor.store';
import { WorkflowChatService } from '../workflow-chat.service';
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
      <p class="hidden text-xs font-medium uppercase tracking-wider text-[#9A9A9A] lg:block">
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
          <div class="space-y-1.5 rounded-lg border border-violet-200 bg-violet-50 p-3">
            <p class="text-[10px] font-semibold uppercase text-violet-900">
              LLM automation (recommended)
            </p>
            <p class="text-[10px] text-[#575757]">
              Schedule → AI Agent → Facebook/LinkedIn (flow). Sheets = Agent tool only (loads row).
            </p>
            <label class="block text-[10px] font-medium text-[#757575]">Post to (after Agent)</label>
            <select
              class="w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs"
              [(ngModel)]="dailySocialTarget"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="slack">Slack</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
            </select>
            <button
              type="button"
              class="w-full rounded-lg bg-violet-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-violet-800"
              (click)="buildScheduleAgentDailySheet()"
            >
              Build Schedule → Agent → {{ dailySocialTargetLabel() }} (Sheets tool)
            </button>
            <button
              type="button"
              class="w-full rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-[11px] font-medium text-violet-900 hover:bg-violet-100"
              (click)="buildScheduleAgent()"
            >
              Build Schedule → Agent only (add tools yourself)
            </button>
          </div>
          <div class="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p class="text-[10px] font-semibold uppercase text-amber-800">
              Direct (no LLM)
            </p>
            <p class="text-[10px] text-[#575757]">
              Schedule → Sheet → Social — Agent skip. Use only if you do not want LLM.
            </p>
            <label class="block text-[10px] font-medium text-[#757575]">Post to</label>
            <select
              class="w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs"
              [(ngModel)]="dailySocialTarget"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="slack">Slack</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
            </select>
            <button
              type="button"
              class="w-full rounded-lg bg-amber-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-amber-800"
              (click)="buildScheduleDailySheetSocial()"
            >
              Build Schedule → Sheet → {{ dailySocialTargetLabel() }}
            </button>
          </div>
        </div>
      } @else {
        <div class="mt-4 space-y-3 overflow-y-auto">
          <div>
            <label class="block text-xs text-[#757575]">Label</label>
            <input
              class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#2BBFBA]"
              [ngModel]="store.selectedNode()!.label"
              (ngModelChange)="onNodeLabelChange($event)"
            />
          </div>
          <div>
            <label class="block text-xs text-[#757575]">Type</label>
            <p class="mt-1 text-sm capitalize text-[#4A4A4A]">{{ store.selectedNode()!.type }}</p>
            @if (store.selectedNode()!.type === 'slack' && store.selectedNode()!.label !== 'Slack') {
              <p class="mt-1 text-[10px] text-amber-700">
                Ye <strong>Slack</strong> node hai (label rename se type nahi badalta). Time set karne ke liye canvas pe clock wala
                <strong>Schedule</strong> node select karo.
              </p>
            }
            @if (store.selectedNode()!.type === 'schedule') {
              <p class="mt-1 text-[10px] text-amber-800">
                Time / interval neeche set karo, phir top <strong>Save</strong>.
              </p>
            }
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
                <strong>Chat flow:</strong> Chat → Agent (main). Tools on dashed Tool port.
                <strong>Schedule flow:</strong> Schedule → Agent; Agent runs the Schedule Prompt below (no chat).
              </p>
              <ul class="mt-2 space-y-1 text-[#757575]">
                <li>{{ agentStatus().chatModel ? '✓' : '✗' }} Chat Model (API key in Settings)</li>
                <li>{{ agentStatus().memory ? '✓' : '○' }} Memory (Window Buffer)</li>
                <li>{{ agentStatus().tool ? '✓' : '○' }} Tool(s) — Sheets / Email / Slack</li>
                <li>{{ agentStatus().flowInput ? '✓' : '✗' }} Trigger connected</li>
              </ul>

              <div class="mt-3 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p class="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  Schedule Prompt (when cron fires)
                </p>
                <textarea
                  class="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-[11px] text-[#1A1A1A] outline-none focus:border-amber-500"
                  rows="4"
                  [ngModel]="String(store.selectedNode()!.data['scheduledPrompt'] ?? '')"
                  (ngModelChange)="updateField('scheduledPrompt', $event)"
                  placeholder="e.g. Read the next Google Sheet row for today, then post Message to Slack. If ImagePrompt exists, generate that image and post it too."
                ></textarea>
                <p class="text-[10px] text-[#757575]">
                  Schedule time pe chat ki zaroorat nahi — ye prompt Agent ko milta hai, phir woh tools call karta hai.
                </p>
              </div>

              @if (agentStatus().memory) {
                <p class="mt-2 text-[11px] text-emerald-700">
                  Memory on — saved in <strong>PostgreSQL</strong>. <strong>New chat</strong> clears the session.
                </p>
              } @else {
                <p class="mt-2 text-[11px] text-amber-600">
                  No Memory attached — optional for Schedule jobs.
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

          @if (store.selectedNode()!.type === 'slack') {
            <div class="space-y-3 rounded-lg border border-pink-200 bg-pink-50 p-3 text-xs text-[#4A4A4A]">
              <p class="font-semibold text-pink-900">Slack</p>
              <p class="text-[10px] text-[#757575]">
                Bot token in <a routerLink="/settings" class="font-medium text-pink-700 underline">Settings → Slack</a>.
                Here set <strong>channel</strong> + optional message.
              </p>

              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Channel</label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-pink-500"
                  [ngModel]="String(store.selectedNode()!.data['channel'] ?? '#general')"
                  (ngModelChange)="updateField('channel', $event)"
                  placeholder="#general"
                />
              </div>

              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Message (optional)</label>
                <textarea
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-pink-500"
                  rows="3"
                  [ngModel]="String(store.selectedNode()!.data['message'] ?? '')"
                  (ngModelChange)="updateField('message', $event)"
                  placeholder="Blank = sheet row / auto summary"
                ></textarea>
              </div>

              <label class="flex items-center justify-between gap-2 rounded-lg border border-pink-200 bg-white px-3 py-2">
                <span class="text-[11px] text-[#1A1A1A]">Generate AI image with post</span>
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-pink-600"
                  [ngModel]="String(store.selectedNode()!.data['generateImage'] ?? 'false') === 'true'"
                  (ngModelChange)="updateField('generateImage', $event ? 'true' : 'false')"
                />
              </label>
              @if (String(store.selectedNode()!.data['generateImage'] ?? 'false') === 'true') {
                <textarea
                  class="w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-[11px] outline-none focus:border-pink-500"
                  rows="2"
                  [ngModel]="String(store.selectedNode()!.data['imagePrompt'] ?? '')"
                  (ngModelChange)="updateField('imagePrompt', $event)"
                  placeholder="Image prompt (or use sheet ImagePrompt)"
                ></textarea>
              }
            </div>
          }

          @if (store.selectedNode()!.type === 'linkedin') {
            <div class="space-y-3 rounded-lg border-2 border-sky-500 bg-sky-50 p-3 text-xs text-[#4A4A4A]">
              <p class="text-sm font-bold text-sky-950">LinkedIn Post</p>
              <p class="text-[10px] text-sky-900">
                Neeche se <strong>Description column</strong> choose karo — usi sheet column ki value LinkedIn pe caption banegi.
              </p>

              <div class="rounded-lg border border-sky-400 bg-white p-2 space-y-2">
                <label class="block text-[11px] font-bold uppercase tracking-wide text-sky-900">
                  Description column (Google Sheet)
                </label>
                <select
                  class="w-full rounded-lg border-2 border-sky-500 bg-[#F5FBFA] px-3 py-2.5 text-sm font-medium text-[#1A1A1A] outline-none focus:border-sky-700"
                  [ngModel]="linkedinDescriptionColumn()"
                  (ngModelChange)="onLinkedInDescriptionColumn($event)"
                >
                  @for (col of linkedinDescriptionOptions(); track col) {
                    <option [value]="col">{{ col }}</option>
                  }
                </select>
                <p class="text-[10px] text-[#575757]">
                  Selected: <strong>{{ linkedinDescriptionColumn() }}</strong> — isi column se daily post text aayega.
                </p>

                <label class="mt-2 block text-[10px] font-semibold uppercase text-[#757575]">
                  ImagePrompt column (optional)
                </label>
                <select
                  class="w-full rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500"
                  [ngModel]="String(store.selectedNode()!.data['imagePromptColumn'] ?? '')"
                  (ngModelChange)="updateField('imagePromptColumn', $event)"
                >
                  <option value="">— none / auto —</option>
                  @for (col of linkedinDescriptionOptions(); track col) {
                    <option [value]="col">{{ col }}</option>
                  }
                </select>

                <button
                  type="button"
                  class="mt-1 w-full rounded-lg bg-sky-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
                  [disabled]="loadingLiColumns"
                  (click)="refreshLinkedInSheetColumns()"
                >
                  {{ loadingLiColumns ? 'Loading…' : '↻ Refresh columns from Google Sheets' }}
                </button>
                @if (liColumnsMsg()) {
                  <p class="text-[10px] text-emerald-700">{{ liColumnsMsg() }}</p>
                }
                @if (liColumnsErr()) {
                  <p class="text-[10px] text-red-600">{{ liColumnsErr() }}</p>
                }
              </div>

              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Access Token</label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                  [ngModel]="String(store.selectedNode()!.data['accessToken'] ?? '')"
                  (ngModelChange)="updateField('accessToken', $event)"
                  placeholder="LinkedIn OAuth access token"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Post as</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500"
                  [ngModel]="String(store.selectedNode()!.data['postAs'] ?? 'person')"
                  (ngModelChange)="updateField('postAs', $event)"
                >
                  <option value="person">person</option>
                  <option value="organization">organization</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Author URN</label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                  [ngModel]="String(store.selectedNode()!.data['authorUrn'] ?? '')"
                  (ngModelChange)="updateField('authorUrn', $event)"
                  placeholder="urn:li:person:XXX"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Dry Run</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-sky-500"
                  [ngModel]="String(store.selectedNode()!.data['dryRun'] ?? 'false')"
                  (ngModelChange)="updateField('dryRun', $event)"
                >
                  <option value="false">false (live post)</option>
                  <option value="true">true (preview only)</option>
                </select>
              </div>
            </div>
          }

          @if (store.selectedNode()!.type === 'facebook') {
            <div class="space-y-3 rounded-lg border-2 border-blue-500 bg-blue-50 p-3 text-xs text-[#4A4A4A]">
              <p class="text-sm font-bold text-blue-950">Facebook Page Post</p>
              <p class="text-[10px] text-blue-900">
                Wire: <strong>AI Agent → Facebook</strong> (main flow). Sheets is Agent <strong>tool</strong> only — Agent loads the row, then Facebook posts it.
                Description column = caption (usually <strong>Message</strong>, not Date).
              </p>

              <div class="rounded-lg border border-blue-400 bg-white p-2 space-y-2">
                <label class="block text-[11px] font-bold uppercase tracking-wide text-blue-900">
                  Description column (Google Sheet)
                </label>
                <select
                  class="w-full rounded-lg border-2 border-blue-500 bg-[#F5FBFA] px-3 py-2.5 text-sm font-medium text-[#1A1A1A] outline-none focus:border-blue-700"
                  [ngModel]="facebookDescriptionColumn()"
                  (ngModelChange)="onFacebookDescriptionColumn($event)"
                >
                  @for (col of facebookDescriptionOptions(); track col) {
                    <option [value]="col">{{ col }}</option>
                  }
                </select>
                <p class="text-[10px] text-[#575757]">
                  Selected: <strong>{{ facebookDescriptionColumn() }}</strong> — isi column se daily post text aayega.
                </p>

                <label class="mt-2 block text-[10px] font-semibold uppercase text-[#757575]">
                  ImagePrompt column (optional)
                </label>
                <select
                  class="w-full rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                  [ngModel]="String(store.selectedNode()!.data['imagePromptColumn'] ?? '')"
                  (ngModelChange)="updateField('imagePromptColumn', $event)"
                >
                  <option value="">— none / auto —</option>
                  @for (col of facebookDescriptionOptions(); track col) {
                    <option [value]="col">{{ col }}</option>
                  }
                </select>

                <button
                  type="button"
                  class="mt-1 w-full rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  [disabled]="loadingFbColumns"
                  (click)="refreshFacebookSheetColumns()"
                >
                  {{ loadingFbColumns ? 'Loading…' : '↻ Refresh columns from Google Sheets' }}
                </button>
                @if (fbColumnsMsg()) {
                  <p class="text-[10px] text-emerald-700">{{ fbColumnsMsg() }}</p>
                }
                @if (fbColumnsErr()) {
                  <p class="text-[10px] text-red-600">{{ fbColumnsErr() }}</p>
                }
              </div>

              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Facebook Page ID
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  [ngModel]="String(store.selectedNode()!.data['pageId'] ?? '')"
                  (ngModelChange)="updateField('pageId', $event)"
                  placeholder="Page ID from your public Page URL"
                />
                <p class="mt-1 text-[10px] text-amber-900">
                  Public link jaisa ID hona chahiye. Example:
                  <code class="rounded bg-white px-1">facebook.com/profile.php?id=61591984531067</code>
                  → Page ID = <strong>61591984531067</strong>. Galat ID pe posts sirf admin ko dikhti hain / dusri page pe chali jati hain.
                </p>
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Page Access Token
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  [ngModel]="String(store.selectedNode()!.data['accessToken'] ?? '')"
                  (ngModelChange)="updateField('accessToken', $event)"
                  placeholder="Long-lived Page token from /me/accounts"
                />
                <p class="mt-1 text-[10px] text-[#575757]">
                  <strong>Page</strong> token chahiye (User token nahi). Steps:
                  Graph Explorer → permissions
                  <code class="rounded bg-white px-1">pages_manage_posts</code> +
                  <code class="rounded bg-white px-1">pages_read_engagement</code>
                  → Generate User token →
                  <code class="rounded bg-white px-1">GET /me/accounts</code>
                  → Page wala <code class="rounded bg-white px-1">access_token</code> copy → yahan paste.
                  User token se <code class="rounded bg-white px-1">publish_actions</code> error aata hai.
                </p>
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Link (optional, text posts)
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  [ngModel]="String(store.selectedNode()!.data['link'] ?? '')"
                  (ngModelChange)="updateField('link', $event)"
                  placeholder="https://… or leave blank for sheet link"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Dry Run</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                  [ngModel]="String(store.selectedNode()!.data['dryRun'] ?? 'false')"
                  (ngModelChange)="updateField('dryRun', $event)"
                >
                  <option value="false">false (live post)</option>
                  <option value="true">true (preview only)</option>
                </select>
              </div>
            </div>
          }

          @if (store.selectedNode()!.type === 'instagram') {
            <div class="space-y-3 rounded-lg border-2 border-pink-500 bg-pink-50 p-3 text-xs text-[#4A4A4A]">
              <p class="text-sm font-bold text-pink-950">Instagram Post</p>
              <p class="text-[10px] text-pink-900">
                Wire: <strong>AI Agent → Instagram</strong> (main flow). Sheets = Agent <strong>tool</strong> only —
                Agent loads the row, then Instagram posts it.
                Description column = caption (usually <strong>Message</strong>, not Date).
              </p>

              <div class="rounded-lg border border-pink-400 bg-white p-2 space-y-2">
                <label class="block text-[11px] font-bold uppercase tracking-wide text-pink-900">
                  Description column (Google Sheet)
                </label>
                <select
                  class="w-full rounded-lg border-2 border-pink-500 bg-[#FDF5F8] px-3 py-2.5 text-sm font-medium text-[#1A1A1A] outline-none focus:border-pink-700"
                  [ngModel]="instagramDescriptionColumn()"
                  (ngModelChange)="onInstagramDescriptionColumn($event)"
                >
                  @for (col of instagramDescriptionOptions(); track col) {
                    <option [value]="col">{{ col }}</option>
                  }
                </select>
                <p class="text-[10px] text-[#575757]">
                  Selected: <strong>{{ instagramDescriptionColumn() }}</strong> — isi column se Instagram caption aayega.
                </p>

                <label class="mt-2 block text-[10px] font-semibold uppercase text-[#757575]">
                  ImagePrompt column (optional)
                </label>
                <select
                  class="w-full rounded-lg border border-pink-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-pink-500"
                  [ngModel]="String(store.selectedNode()!.data['imagePromptColumn'] ?? '')"
                  (ngModelChange)="updateField('imagePromptColumn', $event)"
                >
                  <option value="">— none / auto —</option>
                  @for (col of instagramDescriptionOptions(); track col) {
                    <option [value]="col">{{ col }}</option>
                  }
                </select>

                <button
                  type="button"
                  class="mt-1 w-full rounded-lg bg-pink-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-pink-800 disabled:opacity-50"
                  [disabled]="loadingIgColumns"
                  (click)="refreshInstagramSheetColumns()"
                >
                  {{ loadingIgColumns ? 'Loading…' : '↻ Refresh columns from Google Sheets' }}
                </button>
                @if (igColumnsMsg()) {
                  <p class="text-[10px] text-emerald-700">{{ igColumnsMsg() }}</p>
                }
                @if (igColumnsErr()) {
                  <p class="text-[10px] text-red-600">{{ igColumnsErr() }}</p>
                }
              </div>

              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Instagram Business User ID
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-pink-500"
                  [ngModel]="String(store.selectedNode()!.data['igUserId'] ?? '')"
                  (ngModelChange)="updateField('igUserId', $event)"
                  placeholder="IG Business/Creator ID (not username)"
                />
                <p class="mt-1 text-[10px] text-amber-900">
                  Graph Explorer:
                  <code class="rounded bg-white px-1">GET /me/accounts?fields=id,name,access_token,instagram_business_account</code>
                  → nested <code class="rounded bg-white px-1">instagram_business_account.id</code> copy (Page id nahi).
                </p>
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Page Access Token (linked Facebook Page)
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-pink-500"
                  [ngModel]="String(store.selectedNode()!.data['accessToken'] ?? '')"
                  (ngModelChange)="updateField('accessToken', $event)"
                  placeholder="Same Page token that owns the IG account"
                />
                <p class="mt-1 text-[10px] text-[#575757]">
                  Permissions:
                  <code class="rounded bg-white px-1">instagram_basic</code>,
                  <code class="rounded bg-white px-1">instagram_content_publish</code>,
                  <code class="rounded bg-white px-1">pages_show_list</code>.
                </p>
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Dry Run</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-pink-500"
                  [ngModel]="String(store.selectedNode()!.data['dryRun'] ?? 'false')"
                  (ngModelChange)="updateField('dryRun', $event)"
                >
                  <option value="false">false (live post)</option>
                  <option value="true">true (preview only)</option>
                </select>
              </div>
            </div>
          }


          @if (store.selectedNode()!.type === 'whatsapp') {
            <div class="space-y-3 rounded-lg border-2 border-emerald-600 bg-emerald-50 p-3 text-xs text-[#4A4A4A]">
              <p class="text-sm font-bold text-emerald-950">WhatsApp Message</p>
              <p class="text-[10px] text-emerald-900">
                Wire: <strong>AI Agent → WhatsApp</strong> (main flow). Sheets = Agent <strong>tool</strong> only —
                Agent loads the row, then WhatsApp sends it (Cloud API).
                Description column = message text (usually <strong>Message</strong>).
              </p>

              <div class="rounded-lg border border-emerald-500 bg-white p-2 space-y-2">
                <label class="block text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                  Description column (Google Sheet)
                </label>
                <select
                  class="w-full rounded-lg border-2 border-emerald-600 bg-[#F0FDF4] px-3 py-2.5 text-sm font-medium text-[#1A1A1A] outline-none focus:border-emerald-800"
                  [ngModel]="whatsappDescriptionColumn()"
                  (ngModelChange)="onWhatsAppDescriptionColumn($event)"
                >
                  @for (col of whatsappDescriptionOptions(); track col) {
                    <option [value]="col">{{ col }}</option>
                  }
                </select>
                <p class="text-[10px] text-[#575757]">
                  Selected: <strong>{{ whatsappDescriptionColumn() }}</strong> — isi column se WhatsApp text aayega.
                </p>

                <label class="mt-2 block text-[10px] font-semibold uppercase text-[#757575]">
                  ImagePrompt column (optional)
                </label>
                <select
                  class="w-full rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
                  [ngModel]="String(store.selectedNode()!.data['imagePromptColumn'] ?? '')"
                  (ngModelChange)="updateField('imagePromptColumn', $event)"
                >
                  <option value="">— none / auto —</option>
                  @for (col of whatsappDescriptionOptions(); track col) {
                    <option [value]="col">{{ col }}</option>
                  }
                </select>

                <button
                  type="button"
                  class="mt-1 w-full rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  [disabled]="loadingWaColumns"
                  (click)="refreshWhatsAppSheetColumns()"
                >
                  {{ loadingWaColumns ? 'Loading…' : '↻ Refresh columns from Google Sheets' }}
                </button>
                @if (waColumnsMsg()) {
                  <p class="text-[10px] text-emerald-700">{{ waColumnsMsg() }}</p>
                }
                @if (waColumnsErr()) {
                  <p class="text-[10px] text-red-600">{{ waColumnsErr() }}</p>
                }
              </div>

              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Phone Number ID
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  [ngModel]="String(store.selectedNode()!.data['phoneNumberId'] ?? '')"
                  (ngModelChange)="updateField('phoneNumberId', $event)"
                  placeholder="From Meta → WhatsApp → API Setup"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Access Token
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  [ngModel]="String(store.selectedNode()!.data['accessToken'] ?? '')"
                  (ngModelChange)="updateField('accessToken', $event)"
                  placeholder="Temporary or permanent Cloud API token"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  To (recipient)
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  [ngModel]="String(store.selectedNode()!.data['to'] ?? '')"
                  (ngModelChange)="updateField('to', $event)"
                  placeholder="923001234567 (country code, digits only)"
                />
                <p class="mt-1 text-[10px] text-[#575757]">
                  E.164 without +. Test number must be added in Meta if app is in Development mode.
                </p>
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Template Name (optional)
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  [ngModel]="String(store.selectedNode()!.data['templateName'] ?? '')"
                  (ngModelChange)="updateField('templateName', $event)"
                  placeholder="hello_world — required outside 24h window"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">
                  Template Language
                </label>
                <input
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                  [ngModel]="String(store.selectedNode()!.data['templateLanguage'] ?? 'en_US')"
                  (ngModelChange)="updateField('templateLanguage', $event)"
                  placeholder="en_US"
                />
              </div>
              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Dry Run</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
                  [ngModel]="String(store.selectedNode()!.data['dryRun'] ?? 'false')"
                  (ngModelChange)="updateField('dryRun', $event)"
                >
                  <option value="false">false (live send)</option>
                  <option value="true">true (preview only)</option>
                </select>
              </div>
            </div>
          }

          @if (store.selectedNode()!.type === 'schedule') {
            <div class="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-[#4A4A4A]">
              <p class="font-semibold text-amber-900">Schedule</p>
              <p class="text-[10px] text-[#575757]">
                Wire: <strong>Schedule → Sheets → Slack</strong>. After changing time, click top
                <strong>Save</strong>.
              </p>

              <label class="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2">
                <span class="text-[11px] font-medium text-[#1A1A1A]">
                  {{ store.active() ? 'Posting ON (cron Active)' : 'Posting OFF (paused)' }}
                </span>
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[#2BBFBA]"
                  [ngModel]="store.active()"
                  (ngModelChange)="onScheduleActiveToggle($event)"
                />
              </label>
              <p class="text-[10px] text-[#575757]">
                Off = stop auto posts. Toggle + Save, or use Stop / Resume below (instant).
              </p>

              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                  [disabled]="pausingSchedule || !store.workflowId() || !store.active()"
                  (click)="pauseSchedule()"
                >
                  {{ pausingSchedule ? 'Stopping…' : 'Stop posting' }}
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  [disabled]="pausingSchedule || !store.workflowId() || store.active()"
                  (click)="resumeSchedule()"
                >
                  {{ pausingSchedule ? '…' : 'Resume posting' }}
                </button>
              </div>

              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">When</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-500"
                  [ngModel]="String(store.selectedNode()!.data['interval'] ?? 'daily')"
                  (ngModelChange)="updateScheduleField('interval', $event)"
                >
                  <option value="daily">Every day at…</option>
                  <option value="hourly">Every hour</option>
                  <option value="every_minute">Every minute (test)</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-semibold uppercase text-[#757575]">Hour (0–23)</label>
                  <select
                    class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-500"
                    [ngModel]="String(store.selectedNode()!.data['hour'] ?? 9)"
                    (ngModelChange)="updateScheduleField('hour', $event)"
                    [disabled]="(store.selectedNode()!.data['interval'] ?? 'daily') !== 'daily'"
                  >
                    @for (h of scheduleHours; track h) {
                      <option [value]="h">{{ h < 10 ? '0' + h : h }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-semibold uppercase text-[#757575]">Minute</label>
                  <select
                    class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-500"
                    [ngModel]="String(store.selectedNode()!.data['minute'] ?? 0)"
                    (ngModelChange)="updateScheduleField('minute', $event)"
                    [disabled]="(store.selectedNode()!.data['interval'] ?? 'daily') !== 'daily'"
                  >
                    @for (m of scheduleMinutes; track m) {
                      <option [value]="m">{{ m < 10 ? '0' + m : m }}</option>
                    }
                  </select>
                </div>
              </div>
              <p class="text-[10px] text-[#757575]">
                Hour / Minute use hote hain jab When = Every day. Every minute / hour pe disable.
              </p>

              @if ((store.selectedNode()!.data['interval'] ?? '') === 'every_minute') {
                <p class="rounded border border-amber-300 bg-white px-2 py-1.5 text-[10px] text-amber-900">
                  Every minute: backend cron fires once per clock minute. Each LinkedIn/Facebook/Slack
                  caption gets live time like <code>07/20 8:51 PM</code> (avoids duplicate).
                  Need multiple sheet rows (Post ≠ success) for continuous posts. Top
                  <strong>Save</strong> + Active, keep editor open to see results in Chat.
                </p>
              }

              <div>
                <label class="block text-[10px] font-semibold uppercase text-[#757575]">Timezone</label>
                <select
                  class="mt-1 w-full rounded-lg border border-[#CDDBD9] bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-500"
                  [ngModel]="String(store.selectedNode()!.data['timezone'] ?? 'Asia/Karachi')"
                  (ngModelChange)="updateScheduleField('timezone', $event)"
                >
                  <option value="Asia/Karachi">Asia/Karachi (PKT)</option>
                  <option value="UTC">UTC</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>

              <p class="rounded border border-amber-200 bg-white px-2 py-1.5 font-mono text-[10px] text-[#575757]">
                Cron: {{ store.selectedNode()!.data['cron'] || '—' }}
              </p>

              <div class="space-y-1.5 border-t border-amber-200 pt-2">
                <button
                  type="button"
                  class="w-full rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  [disabled]="runningSchedule || !store.workflowId()"
                  (click)="runScheduleNow()"
                >
                  {{ runningSchedule ? 'Running…' : 'Run now (test)' }}
                </button>
                @if (scheduleRunMsg()) {
                  <p class="text-[10px] text-emerald-700">{{ scheduleRunMsg() }}</p>
                }
                @if (scheduleRunErr()) {
                  <p class="text-[10px] text-red-600">{{ scheduleRunErr() }}</p>
                }
                <p class="text-[10px] text-[#757575]">
                  Sheets: Document + tab · Slack: <strong>#channel</strong> · then top <strong>Save</strong>.
                </p>
              </div>
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
                @if (googleSheetsConfigured() && !googleSheetsReplacing()) {
                  <p class="mt-1 text-[11px] text-emerald-700">
                    ✓ Google Sheets account
                    @if (googleSheetsEmail()) {
                      <span class="block truncate text-[10px] text-[#757575]">{{ googleSheetsEmail() }}</span>
                    }
                  </p>
                  <div class="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      class="flex-1 rounded border border-green-600 bg-white py-1.5 text-[11px] font-medium text-green-800 hover:bg-green-50 disabled:opacity-50"
                      [disabled]="removingGoogleSheets"
                      (click)="startReplaceGoogleSheetsCredential()"
                    >
                      Replace JSON
                    </button>
                    <button
                      type="button"
                      class="flex-1 rounded border border-red-300 bg-white py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      [disabled]="removingGoogleSheets"
                      (click)="removeGoogleSheetsCredential()"
                    >
                      {{ removingGoogleSheets ? 'Removing…' : 'Remove' }}
                    </button>
                  </div>
                } @else {
                  <p class="mt-1 text-[11px] text-amber-700">
                    {{
                      googleSheetsReplacing()
                        ? 'Paste a new Service Account JSON to replace the current one'
                        : 'No credential — paste Service Account JSON below'
                    }}
                  </p>
                  <textarea
                    class="mt-1 w-full rounded border border-[#CDDBD9] px-2 py-1 font-mono text-[10px] outline-none focus:border-green-500"
                    rows="3"
                    [(ngModel)]="googleSheetsJson"
                    placeholder='{"type":"service_account","client_email":"...","private_key":"..."}'
                  ></textarea>
                  <div class="mt-1 flex gap-1.5">
                    <button
                      type="button"
                      class="flex-1 rounded bg-green-700 py-1.5 text-[11px] text-white disabled:opacity-50"
                      [disabled]="savingGoogleSheets || !googleSheetsJson.trim()"
                      (click)="saveGoogleSheetsFromPanel()"
                    >
                      {{ savingGoogleSheets ? 'Saving…' : 'Save credential' }}
                    </button>
                    @if (googleSheetsReplacing()) {
                      <button
                        type="button"
                        class="rounded border border-[#CDDBD9] bg-white px-2 py-1.5 text-[11px] text-[#575757] hover:bg-gray-50"
                        (click)="cancelReplaceGoogleSheetsCredential()"
                      >
                        Cancel
                      </button>
                    }
                  </div>
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
                  <option value="read_next_daily">Daily next row → Slack</option>
                </select>
                @if (gsOperation() === 'read_next_daily') {
                  <div class="mt-2 space-y-2 rounded border border-green-200 bg-white p-2 text-[10px] text-[#575757]">
                    <p>
                      Loads the sheet, takes the <strong>first row where Post ≠ success</strong>,
                      posts to social, then writes <code>success</code> or <code>failed</code>
                      in the <strong>Post</strong> column.
                      Default headers: <code>Message</code> | <code>ImagePrompt</code> | <code>Post</code>
                    </p>
                    <label class="block font-medium text-[#757575]">Pick mode</label>
                    <select
                      class="w-full rounded border border-[#CDDBD9] px-2 py-1 text-xs"
                      [ngModel]="String(store.selectedNode()!.data['dailyPickMode'] ?? 'unposted')"
                      (ngModelChange)="updateField('dailyPickMode', $event)"
                    >
                      <option value="unposted">Unposted queue (Post column) — recommended</option>
                      <option value="sequential">Sequential cursor</option>
                      <option value="day_of_month">Calendar day of month</option>
                      <option value="day_of_year">Day of year rotate</option>
                    </select>
                    <label class="mt-1 block font-medium text-[#757575]">Caption / Message column</label>
                    <input
                      class="w-full rounded border border-[#CDDBD9] px-2 py-1 text-xs"
                      [ngModel]="String(store.selectedNode()!.data['messageColumn'] ?? 'Message')"
                      (ngModelChange)="updateField('messageColumn', $event)"
                      placeholder="Message"
                    />
                    <label class="mt-1 block font-medium text-[#757575]">ImagePrompt column</label>
                    <input
                      class="w-full rounded border border-[#CDDBD9] px-2 py-1 text-xs"
                      [ngModel]="String(store.selectedNode()!.data['imagePromptColumn'] ?? 'ImagePrompt')"
                      (ngModelChange)="updateField('imagePromptColumn', $event)"
                      placeholder="ImagePrompt"
                    />
                    <label class="mt-1 block font-medium text-[#757575]">Post status column</label>
                    <input
                      class="w-full rounded border border-[#CDDBD9] px-2 py-1 text-xs"
                      [ngModel]="String(store.selectedNode()!.data['postStatusColumn'] ?? 'Post')"
                      (ngModelChange)="updateField('postStatusColumn', $event)"
                      placeholder="Post"
                    />
                  </div>
                }
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
                @if (gsOperation() !== 'read_next_daily') {
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
                } @else {
                  <p class="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-900">
                    Daily queue: Schedule → this Sheet → Slack (solid wires). No Agent needed.
                  </p>
                }
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
                      : gsOperation() === 'read_next_daily'
                        ? 'Execute — pick next row'
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
                  Save node settings here. For every-minute test: Schedule → Every minute → top Save → Run now.
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
  private readonly chat = inject(WorkflowChatService);
  readonly runChat = output<void>();

  /** Allow String(...) in template bindings (Angular strict template check). */
  protected readonly String = String;

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
  protected removingGoogleSheets = false;
  protected loadingSheets = false;
  protected loadingHeaders = false;
  protected readonly googleSheetsConfigured = signal(false);
  protected readonly googleSheetsEmail = signal<string | null>(null);
  protected readonly googleSheetsMsg = signal<string | null>(null);
  protected readonly googleSheetsErr = signal<string | null>(null);
  protected readonly googleSheetsReplacing = signal(false);
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

  protected loadingSlackChannels = false;
  protected readonly slackConfigured = signal(false);
  protected readonly slackChannelOptions = signal<
    { id: string; name: string; isPrivate?: boolean }[]
  >([]);
  protected readonly slackChannelSelectValue = signal('');
  protected readonly slackChannelMsg = signal<string | null>(null);
  private lastSlackNodeId: string | null = null;
  private lastScheduleNodeId: string | null = null;
  private lastLinkedInNodeId: string | null = null;
  private lastFacebookNodeId: string | null = null;
  private lastInstagramNodeId: string | null = null;
  private lastWhatsAppNodeId: string | null = null;

  protected readonly liSheetColumns = signal<string[]>([]);
  protected readonly liColumnsMsg = signal<string | null>(null);
  protected readonly liColumnsErr = signal<string | null>(null);
  protected loadingLiColumns = false;

  protected readonly fbSheetColumns = signal<string[]>([]);
  protected readonly fbColumnsMsg = signal<string | null>(null);
  protected readonly fbColumnsErr = signal<string | null>(null);
  protected loadingFbColumns = false;

  protected readonly igSheetColumns = signal<string[]>([]);
  protected readonly igColumnsMsg = signal<string | null>(null);
  protected readonly igColumnsErr = signal<string | null>(null);
  protected loadingIgColumns = false;

  protected readonly waSheetColumns = signal<string[]>([]);
  protected readonly waColumnsMsg = signal<string | null>(null);
  protected readonly waColumnsErr = signal<string | null>(null);
  protected loadingWaColumns = false;

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

    if (node?.type === 'slack') {
      if (node.id !== this.lastSlackNodeId) {
        this.lastSlackNodeId = node.id;
        if (node.label === 'Schedule' || !String(node.label ?? '').trim()) {
          this.store.updateNodeLabel(node.id, 'Slack');
        }
        this.hydrateSlackUi();
      }
    } else {
      this.lastSlackNodeId = null;
    }

    if (node?.type === 'linkedin') {
      if (node.id !== this.lastLinkedInNodeId) {
        this.lastLinkedInNodeId = node.id;
        this.hydrateLinkedInSheetColumns();
      }
    } else {
      this.lastLinkedInNodeId = null;
    }

    if (node?.type === 'facebook') {
      if (node.id !== this.lastFacebookNodeId) {
        this.lastFacebookNodeId = node.id;
        this.hydrateFacebookSheetColumns();
      }
    } else {
      this.lastFacebookNodeId = null;
    }

    if (node?.type === 'instagram') {
      if (node.id !== this.lastInstagramNodeId) {
        this.lastInstagramNodeId = node.id;
        this.hydrateInstagramSheetColumns();
      }
    } else {
      this.lastInstagramNodeId = null;
    }

    if (node?.type === 'whatsapp') {
      if (node.id !== this.lastWhatsAppNodeId) {
        this.lastWhatsAppNodeId = node.id;
        this.hydrateWhatsAppSheetColumns();
      }
    } else {
      this.lastWhatsAppNodeId = null;
    }

    if (node?.type === 'schedule') {
      if (node.id !== this.lastScheduleNodeId) {
        this.lastScheduleNodeId = node.id;
        if (
          !node.label ||
          node.label === 'Google Sheets' ||
          node.label === 'Slack'
        ) {
          this.store.updateNodeLabel(node.id, 'Schedule');
        }
      }
    } else {
      this.lastScheduleNodeId = null;
    }
  });

  ngOnInit(): void {
    this.refreshAiStatus();
    this.refreshGoogleSheetsStatus();
    this.refreshEmailMailerStatus();
    this.refreshSlackStatus();
  }

  protected refreshEmailMailerStatus(): void {
    this.api.getEmailStatus().subscribe((s) => {
      this.emailMailerConfigured.set(!!s.configured);
      this.emailMailerFrom.set(s.fromEmail);
      this.emailMailerMsg.set(s.message);
    });
  }

  protected refreshSlackStatus(): void {
    this.api.getSlackStatus().subscribe((s) => {
      this.slackConfigured.set(!!s.configured);
    });
  }

  protected hydrateSlackUi(): void {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'slack') return;
    this.refreshSlackStatus();
    const ch = String(node.data['channel'] ?? '').trim();
    if (!ch) {
      this.api.getSlackStatus().subscribe((s) => {
        const def = (s.defaultChannel || '#general').trim();
        if (def) {
          this.updateField('channel', def);
          this.slackChannelSelectValue.set(def.startsWith('#') ? def : `#${def}`);
        }
      });
    } else {
      this.slackChannelSelectValue.set(ch.startsWith('#') || ch.startsWith('C') ? ch : `#${ch}`);
    }
    // Auto-load channel list when bot is ready
    this.loadSlackChannels(true);
  }

  protected loadSlackChannels(silent = false): void {
    if (!silent) this.slackChannelMsg.set(null);
    this.loadingSlackChannels = true;
    this.api.listSlackChannels().subscribe((res) => {
      this.loadingSlackChannels = false;
      if (!res.ok) {
        this.slackChannelOptions.set([]);
        this.slackChannelMsg.set(
          res.message ||
            'Could not list channels — type #name manually. Bot needs channels:read scope.',
        );
        return;
      }
      this.slackChannelOptions.set(res.channels ?? []);
      const current = String(
        this.store.selectedNode()?.data['channel'] ?? '',
      ).trim();
      if (current) {
        const name = current.replace(/^#/, '').toLowerCase();
        const match = (res.channels ?? []).find(
          (c) => c.name.toLowerCase() === name || c.id === current,
        );
        this.slackChannelSelectValue.set(
          match ? `#${match.name}` : '__custom__',
        );
      }
      if (!silent) {
        this.slackChannelMsg.set(
          `${res.channels?.length ?? 0} channel(s) loaded`,
        );
      }
    });
  }

  protected onSlackChannelPick(value: string): void {
    this.slackChannelSelectValue.set(value);
    if (!value || value === '__custom__') return;
    this.updateField('channel', value);
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
          this.googleSheetsReplacing.set(false);
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

  protected startReplaceGoogleSheetsCredential(): void {
    this.googleSheetsReplacing.set(true);
    this.googleSheetsJson = '';
    this.googleSheetsMsg.set(null);
    this.googleSheetsErr.set(null);
  }

  protected cancelReplaceGoogleSheetsCredential(): void {
    this.googleSheetsReplacing.set(false);
    this.googleSheetsJson = '';
    this.googleSheetsErr.set(null);
  }

  protected removeGoogleSheetsCredential(): void {
    if (
      !confirm(
        'Remove Google Sheets credential? You can paste a new Service Account JSON after this.',
      )
    ) {
      return;
    }
    this.removingGoogleSheets = true;
    this.googleSheetsMsg.set(null);
    this.googleSheetsErr.set(null);
    this.api.clearGoogleSheetsCredentials().subscribe({
      next: (res) => {
        this.removingGoogleSheets = false;
        this.googleSheetsReplacing.set(false);
        this.googleSheetsJson = '';
        if (res.stillConfigured) {
          this.googleSheetsErr.set(res.message ?? 'Still configured via .env');
        } else {
          this.googleSheetsMsg.set(
            res.message ?? 'Credential removed. Paste a new JSON to connect.',
          );
        }
        this.refreshGoogleSheetsStatus();
      },
      error: (err) => {
        this.removingGoogleSheets = false;
        this.googleSheetsErr.set(
          err?.error?.message ?? 'Remove failed — is the backend online?',
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
          {
            key: 'instructions',
            label: 'Agent Instructions (chat personality)',
            value: String(d['instructions'] ?? ''),
            type: 'textarea',
          },
          {
            key: 'outputKey',
            label: 'Output Key',
            value: String(d['outputKey'] ?? 'aiResponse'),
            type: 'text',
          },
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
        // Channel + message are in the Slack panel above
        return [];
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
        // Custom Schedule UI above — no generic fields
        return [];
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
        // Custom Facebook panel above (Description column + credentials)
        return [];
      case 'instagram':
        // Custom Instagram panel above
        return [];
      case 'whatsapp':
        // Custom WhatsApp panel above
        return [];
      case 'linkedin':
        // Custom LinkedIn panel above (Description column + credentials)
        return [];
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
          {
            key: 'webhookUrl',
            label: 'Discord Channel Webhook URL (server channel, not personal DM)',
            value: String(d['webhookUrl'] ?? ''),
            type: 'text',
          },
          {
            key: 'content',
            label: 'Message',
            value: String(d['content'] ?? '{{message}}'),
            type: 'textarea',
          },
        ];
      case 'telegram':
        return [
          {
            key: 'botToken',
            label: 'Bot Token (from @BotFather)',
            value: String(d['botToken'] ?? ''),
            type: 'text',
          },
          {
            key: 'chatId',
            label:
              'Chat ID — personal: your user id · channel: -100… · group: -…',
            value: String(d['chatId'] ?? ''),
            type: 'text',
          },
          {
            key: 'text',
            label: 'Text / caption',
            value: String(d['text'] ?? '{{message}}'),
            type: 'textarea',
          },
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

  protected readonly scheduleHours = Array.from({ length: 24 }, (_, i) => i);
  protected readonly scheduleMinutes = [0, 5, 10, 15, 20, 30, 45];
  protected runningSchedule = false;
  protected pausingSchedule = false;
  protected readonly scheduleRunMsg = signal<string | null>(null);
  protected readonly scheduleRunErr = signal<string | null>(null);

  protected onScheduleActiveToggle(on: boolean): void {
    this.store.active.set(on);
    this.store.message.set(
      on
        ? 'Schedule ON — click top Save to resume auto posts'
        : 'Schedule OFF — click top Save (or Stop posting) to pause',
    );
  }

  protected pauseSchedule(): void {
    const id = this.store.workflowId();
    if (!id) {
      this.scheduleRunErr.set('Save the workflow first, then Stop posting.');
      return;
    }
    this.pausingSchedule = true;
    this.scheduleRunErr.set(null);
    this.scheduleRunMsg.set(null);
    this.api.pauseSchedule(id).subscribe({
      next: (res) => {
        this.pausingSchedule = false;
        if (res.ok === false) {
          this.scheduleRunErr.set(res.error ?? 'Could not pause schedule');
          return;
        }
        this.store.active.set(false);
        this.scheduleRunMsg.set('Posting stopped — schedule paused');
        this.store.message.set('Schedule paused — no more auto posts');
      },
      error: (err) => {
        this.pausingSchedule = false;
        this.scheduleRunErr.set(
          err?.error?.message ?? err?.error?.error ?? 'Pause failed',
        );
      },
    });
  }

  protected resumeSchedule(): void {
    const id = this.store.workflowId();
    if (!id) {
      this.scheduleRunErr.set('Save the workflow first, then Resume.');
      return;
    }
    this.pausingSchedule = true;
    this.scheduleRunErr.set(null);
    this.scheduleRunMsg.set(null);
    this.api.resumeSchedule(id).subscribe({
      next: (res) => {
        this.pausingSchedule = false;
        if (res.ok === false) {
          this.scheduleRunErr.set(res.error ?? 'Could not resume schedule');
          return;
        }
        this.store.active.set(true);
        this.scheduleRunMsg.set('Posting resumed — cron Active');
        this.store.message.set('Schedule resumed — auto posts on');
      },
      error: (err) => {
        this.pausingSchedule = false;
        this.scheduleRunErr.set(
          err?.error?.message ?? err?.error?.error ?? 'Resume failed',
        );
      },
    });
  }

  protected updateScheduleField(key: string, value: string): void {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'schedule') return;
    const parsed =
      key === 'hour' || key === 'minute' ? Number(value) : value;
    const next = { ...node.data, [key]: parsed };
    const interval = String(next['interval'] ?? 'daily');
    const hour = Math.min(23, Math.max(0, Number(next['hour'] ?? 9)));
    const minute = Math.min(59, Math.max(0, Number(next['minute'] ?? 0)));
    let cron = `${minute} ${hour} * * *`;
    if (interval === 'hourly') cron = '0 * * * *';
    if (interval === 'every_minute') cron = '* * * * *';
    this.store.updateNodeData(node.id, {
      [key]: parsed,
      interval,
      hour,
      minute,
      cron,
    });
    // Keep label correct (users sometimes rename by mistake)
    if (node.label !== 'Schedule') {
      this.store.updateNodeLabel(node.id, 'Schedule');
    }
  }

  protected linkedinDescriptionColumn(): string {
    const node = this.store.selectedNode();
    const current = String(node?.data['captionColumn'] ?? '').trim();
    return current || 'Message';
  }

  protected linkedinDescriptionOptions(): string[] {
    const defaults = ['Message', 'Caption', 'Description', 'Text', 'Body', 'Content'];
    const fromSheet = this.liSheetColumns();
    const merged = [...fromSheet];
    for (const d of defaults) {
      if (!merged.some((h) => h.toLowerCase() === d.toLowerCase())) {
        merged.push(d);
      }
    }
    const selected = this.linkedinDescriptionColumn();
    if (selected && !merged.some((h) => h === selected)) {
      merged.unshift(selected);
    }
    return merged;
  }

  protected onLinkedInDescriptionColumn(column: string): void {
    const col = String(column ?? '').trim();
    this.updateField('captionColumn', col || 'Message');
    // Keep text template pointing at message; Sheets sync fills message from this column
    this.updateField('text', '{{message}}');
    const sheets = this.findWorkflowSheetsNode();
    if (sheets && col) {
      this.store.updateNodeData(sheets.id, { messageColumn: col });
    }
  }

  protected refreshLinkedInSheetColumns(): void {
    this.hydrateLinkedInSheetColumns(true);
  }

  private findWorkflowSheetsNode() {
    return this.store.nodes().find((n) => n.type === 'google_sheets') ?? null;
  }

  private hydrateLinkedInSheetColumns(forceApi = false): void {
    this.liColumnsErr.set(null);
    this.liColumnsMsg.set(null);
    const sheets = this.findWorkflowSheetsNode();
    if (!sheets) {
      this.liSheetColumns.set([]);
      this.liColumnsErr.set(
        'Is workflow mein Google Sheets node nahi mila — pehle Sheets add/connect karo.',
      );
      return;
    }

    const cached = sheets.data['headersList'];
    if (Array.isArray(cached) && cached.length && !forceApi) {
      const headers = cached.map(String).filter(Boolean);
      this.liSheetColumns.set(headers);
      this.ensureLinkedInColumnDefaults(headers);
      this.liColumnsMsg.set(
        `${headers.length} column(s) Sheets node se (cached)`,
      );
      return;
    }

    const spreadsheetId = String(
      sheets.data['spreadsheetId'] ?? sheets.data['documentId'] ?? '',
    ).trim();
    const sheetName = String(sheets.data['sheetName'] ?? '').trim();
    if (!spreadsheetId || !sheetName) {
      this.liSheetColumns.set([]);
      this.liColumnsErr.set(
        'Google Sheets pe Document URL + sheet tab set karke pehle columns load karo.',
      );
      return;
    }

    this.loadingLiColumns = true;
    this.api.getGoogleSheetHeaders(spreadsheetId, sheetName).subscribe((res) => {
      this.loadingLiColumns = false;
      if (!res.ok) {
        this.liSheetColumns.set([]);
        this.liColumnsErr.set(res.message ?? 'Columns load failed');
        return;
      }
      const headers = (res.headers ?? []).map(String).filter(Boolean);
      this.liSheetColumns.set(headers);
      this.store.updateNodeData(sheets.id, { headersList: headers });
      this.ensureLinkedInColumnDefaults(headers);
      this.liColumnsMsg.set(`${headers.length} column(s) loaded from sheet`);
    });
  }

  private ensureLinkedInColumnDefaults(headers: string[]): void {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'linkedin' || !headers.length) return;
    const current = String(node.data['captionColumn'] ?? '').trim();
    if (!current || !headers.includes(current)) {
      const preferred =
        headers.find((h) =>
          /^(message|caption|description|text|body|content)$/i.test(h.trim()),
        ) ?? headers[0];
      this.onLinkedInDescriptionColumn(preferred);
    }
    const imgCol = String(node.data['imagePromptColumn'] ?? '').trim();
    if (!imgCol || !headers.includes(imgCol)) {
      const imgPreferred =
        headers.find((h) => /imageprompt|image.?prompt|prompt/i.test(h)) ?? '';
      this.updateField('imagePromptColumn', imgPreferred);
    }
  }

  protected facebookDescriptionColumn(): string {
    const node = this.store.selectedNode();
    const current = String(node?.data['captionColumn'] ?? '').trim();
    return current || 'Message';
  }

  protected facebookDescriptionOptions(): string[] {
    const defaults = ['Message', 'Caption', 'Description', 'Text', 'Body', 'Content'];
    const fromSheet = this.fbSheetColumns();
    const merged = [...fromSheet];
    for (const d of defaults) {
      if (!merged.some((h) => h.toLowerCase() === d.toLowerCase())) {
        merged.push(d);
      }
    }
    const selected = this.facebookDescriptionColumn();
    if (selected && !merged.some((h) => h === selected)) {
      merged.unshift(selected);
    }
    return merged;
  }

  protected onFacebookDescriptionColumn(column: string): void {
    const col = String(column ?? '').trim();
    this.updateField('captionColumn', col || 'Message');
    this.updateField('message', '{{message}}');
    const sheets = this.findWorkflowSheetsNode();
    if (sheets && col) {
      this.store.updateNodeData(sheets.id, { messageColumn: col });
    }
  }

  protected refreshFacebookSheetColumns(): void {
    this.hydrateFacebookSheetColumns(true);
  }

  private hydrateFacebookSheetColumns(forceApi = false): void {
    this.fbColumnsErr.set(null);
    this.fbColumnsMsg.set(null);
    const sheets = this.findWorkflowSheetsNode();
    if (!sheets) {
      this.fbSheetColumns.set([]);
      this.fbColumnsErr.set(
        'Is workflow mein Google Sheets node nahi mila — pehle Sheets add/connect karo.',
      );
      return;
    }

    const cached = sheets.data['headersList'];
    if (Array.isArray(cached) && cached.length && !forceApi) {
      const headers = cached.map(String).filter(Boolean);
      this.fbSheetColumns.set(headers);
      this.ensureFacebookColumnDefaults(headers);
      this.fbColumnsMsg.set(
        `${headers.length} column(s) Sheets node se (cached)`,
      );
      return;
    }

    const spreadsheetId = String(
      sheets.data['spreadsheetId'] ?? sheets.data['documentId'] ?? '',
    ).trim();
    const sheetName = String(sheets.data['sheetName'] ?? '').trim();
    if (!spreadsheetId || !sheetName) {
      this.fbSheetColumns.set([]);
      this.fbColumnsErr.set(
        'Google Sheets pe Document URL + sheet tab set karke pehle columns load karo.',
      );
      return;
    }

    this.loadingFbColumns = true;
    this.api.getGoogleSheetHeaders(spreadsheetId, sheetName).subscribe((res) => {
      this.loadingFbColumns = false;
      if (!res.ok) {
        this.fbSheetColumns.set([]);
        this.fbColumnsErr.set(res.message ?? 'Columns load failed');
        return;
      }
      const headers = (res.headers ?? []).map(String).filter(Boolean);
      this.fbSheetColumns.set(headers);
      this.store.updateNodeData(sheets.id, { headersList: headers });
      this.ensureFacebookColumnDefaults(headers);
      this.fbColumnsMsg.set(`${headers.length} column(s) loaded from sheet`);
    });
  }

  private ensureFacebookColumnDefaults(headers: string[]): void {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'facebook' || !headers.length) return;
    const current = String(node.data['captionColumn'] ?? '').trim();
    if (!current || !headers.includes(current)) {
      const preferred =
        headers.find((h) =>
          /^(message|caption|description|text|body|content)$/i.test(h.trim()),
        ) ?? headers[0];
      this.onFacebookDescriptionColumn(preferred);
    }
    const imgCol = String(node.data['imagePromptColumn'] ?? '').trim();
    if (!imgCol || !headers.includes(imgCol)) {
      const imgPreferred =
        headers.find((h) => /imageprompt|image.?prompt|prompt/i.test(h)) ?? '';
      this.updateField('imagePromptColumn', imgPreferred);
    }
  }

  protected instagramDescriptionColumn(): string {
    const node = this.store.selectedNode();
    const current = String(node?.data['captionColumn'] ?? '').trim();
    return current || 'Message';
  }

  protected instagramDescriptionOptions(): string[] {
    const defaults = [
      'Message',
      'Caption',
      'Description',
      'Text',
      'Body',
      'Content',
      'ImagePrompt',
    ];
    const fromSheet = this.igSheetColumns();
    const merged = [...fromSheet];
    for (const d of defaults) {
      if (!merged.some((h) => h.toLowerCase() === d.toLowerCase())) {
        merged.push(d);
      }
    }
    const selected = this.instagramDescriptionColumn();
    if (selected && !merged.some((h) => h === selected)) {
      merged.unshift(selected);
    }
    return merged;
  }

  protected onInstagramDescriptionColumn(column: string): void {
    const col = String(column ?? '').trim();
    this.updateField('captionColumn', col || 'Message');
    this.updateField('caption', '{{message}}');
    const sheets = this.findWorkflowSheetsNode();
    if (sheets && col) {
      this.store.updateNodeData(sheets.id, { messageColumn: col });
    }
  }

  /** @deprecated alias — keep old call sites working */
  protected instagramCaptionColumn(): string {
    return this.instagramDescriptionColumn();
  }

  protected instagramColumnOptions(): string[] {
    return this.instagramDescriptionOptions();
  }

  protected onInstagramCaptionColumn(column: string): void {
    this.onInstagramDescriptionColumn(column);
  }

  protected refreshInstagramSheetColumns(): void {
    this.hydrateInstagramSheetColumns(true);
  }

  private hydrateInstagramSheetColumns(forceApi = false): void {
    this.igColumnsErr.set(null);
    this.igColumnsMsg.set(null);
    const sheets = this.findWorkflowSheetsNode();
    if (!sheets) {
      this.igSheetColumns.set([]);
      this.igColumnsErr.set(
        'Is workflow mein Google Sheets node nahi mila — pehle Sheets add/connect karo.',
      );
      return;
    }

    const cached = sheets.data['headersList'];
    if (Array.isArray(cached) && cached.length && !forceApi) {
      const headers = cached.map(String).filter(Boolean);
      this.igSheetColumns.set(headers);
      this.ensureInstagramColumnDefaults(headers);
      this.igColumnsMsg.set(
        `${headers.length} column(s) Sheets node se (cached)`,
      );
      return;
    }

    const spreadsheetId = String(
      sheets.data['spreadsheetId'] ?? sheets.data['documentId'] ?? '',
    ).trim();
    const sheetName = String(sheets.data['sheetName'] ?? '').trim();
    if (!spreadsheetId || !sheetName) {
      this.igSheetColumns.set([]);
      this.igColumnsErr.set(
        'Google Sheets pe Document URL + sheet tab set karke pehle columns load karo.',
      );
      return;
    }

    this.loadingIgColumns = true;
    this.api.getGoogleSheetHeaders(spreadsheetId, sheetName).subscribe((res) => {
      this.loadingIgColumns = false;
      if (!res.ok) {
        this.igSheetColumns.set([]);
        this.igColumnsErr.set(res.message ?? 'Columns load failed');
        return;
      }
      const headers = (res.headers ?? []).map(String).filter(Boolean);
      this.igSheetColumns.set(headers);
      this.store.updateNodeData(sheets.id, { headersList: headers });
      this.ensureInstagramColumnDefaults(headers);
      this.igColumnsMsg.set(`${headers.length} column(s) loaded from sheet`);
    });
  }

  private ensureInstagramColumnDefaults(headers: string[]): void {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'instagram' || !headers.length) return;
    const current = String(node.data['captionColumn'] ?? '').trim();
    if (!current || !headers.includes(current)) {
      const preferred =
        headers.find((h) =>
          /^(message|caption|description|text|body|content)$/i.test(h.trim()),
        ) ?? headers[0];
      this.onInstagramDescriptionColumn(preferred);
    }
    const imgCol = String(node.data['imagePromptColumn'] ?? '').trim();
    if (!imgCol || !headers.includes(imgCol)) {
      const imgPreferred =
        headers.find((h) => /imageprompt|image.?prompt|prompt/i.test(h)) ??
        'ImagePrompt';
      this.updateField('imagePromptColumn', imgPreferred);
    }
  }

  protected whatsappDescriptionColumn(): string {
    const node = this.store.selectedNode();
    const current = String(node?.data['captionColumn'] ?? '').trim();
    return current || 'Message';
  }

  protected whatsappDescriptionOptions(): string[] {
    const defaults = [
      'Message',
      'Caption',
      'Description',
      'Text',
      'Body',
      'Content',
      'ImagePrompt',
    ];
    const fromSheet = this.waSheetColumns();
    const merged = [...fromSheet];
    for (const d of defaults) {
      if (!merged.some((h) => h.toLowerCase() === d.toLowerCase())) {
        merged.push(d);
      }
    }
    const selected = this.whatsappDescriptionColumn();
    if (selected && !merged.some((h) => h === selected)) {
      merged.unshift(selected);
    }
    return merged;
  }

  protected onWhatsAppDescriptionColumn(column: string): void {
    const col = String(column ?? '').trim();
    this.updateField('captionColumn', col || 'Message');
    this.updateField('message', '{{message}}');
    const sheets = this.findWorkflowSheetsNode();
    if (sheets && col) {
      this.store.updateNodeData(sheets.id, { messageColumn: col });
    }
  }

  protected refreshWhatsAppSheetColumns(): void {
    this.hydrateWhatsAppSheetColumns(true);
  }

  private hydrateWhatsAppSheetColumns(forceApi = false): void {
    this.waColumnsErr.set(null);
    this.waColumnsMsg.set(null);
    const sheets = this.findWorkflowSheetsNode();
    if (!sheets) {
      this.waSheetColumns.set([]);
      this.waColumnsErr.set(
        'Is workflow mein Google Sheets node nahi mila — pehle Sheets add/connect karo.',
      );
      return;
    }

    const cached = sheets.data['headersList'];
    if (Array.isArray(cached) && cached.length && !forceApi) {
      const headers = cached.map(String).filter(Boolean);
      this.waSheetColumns.set(headers);
      this.ensureWhatsAppColumnDefaults(headers);
      this.waColumnsMsg.set(
        `${headers.length} column(s) Sheets node se (cached)`,
      );
      return;
    }

    const spreadsheetId = String(
      sheets.data['spreadsheetId'] ?? sheets.data['documentId'] ?? '',
    ).trim();
    const sheetName = String(sheets.data['sheetName'] ?? '').trim();
    if (!spreadsheetId || !sheetName) {
      this.waSheetColumns.set([]);
      this.waColumnsErr.set(
        'Google Sheets pe Document URL + sheet tab set karke pehle columns load karo.',
      );
      return;
    }

    this.loadingWaColumns = true;
    this.api.getGoogleSheetHeaders(spreadsheetId, sheetName).subscribe((res) => {
      this.loadingWaColumns = false;
      if (!res.ok) {
        this.waSheetColumns.set([]);
        this.waColumnsErr.set(res.message ?? 'Columns load failed');
        return;
      }
      const headers = (res.headers ?? []).map(String).filter(Boolean);
      this.waSheetColumns.set(headers);
      this.store.updateNodeData(sheets.id, { headersList: headers });
      this.ensureWhatsAppColumnDefaults(headers);
      this.waColumnsMsg.set(`${headers.length} column(s) loaded from sheet`);
    });
  }

  private ensureWhatsAppColumnDefaults(headers: string[]): void {
    const node = this.store.selectedNode();
    if (!node || node.type !== 'whatsapp' || !headers.length) return;
    const current = String(node.data['captionColumn'] ?? '').trim();
    if (!current || !headers.includes(current)) {
      const preferred =
        headers.find((h) =>
          /^(message|caption|description|text|body|content)$/i.test(h.trim()),
        ) ?? headers[0];
      this.onWhatsAppDescriptionColumn(preferred);
    }
    const imgCol = String(node.data['imagePromptColumn'] ?? '').trim();
    if (!imgCol || !headers.includes(imgCol)) {
      const imgPreferred =
        headers.find((h) => /imageprompt|image.?prompt|prompt/i.test(h)) ??
        'ImagePrompt';
      this.updateField('imagePromptColumn', imgPreferred);
    }
  }

  protected buildScheduleSlack(): void {
    this.store.insertScheduleSlackTemplate(true);
  }

  protected dailySocialTarget:
    | 'slack'
    | 'facebook'
    | 'instagram'
    | 'whatsapp'
    | 'telegram'
    | 'discord'
    | 'linkedin' = 'linkedin';

  protected dailySocialTargetLabel(): string {
    const map: Record<string, string> = {
      slack: 'Slack',
      facebook: 'Facebook',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      telegram: 'Telegram',
      discord: 'Discord',
      linkedin: 'LinkedIn',
    };
    return map[this.dailySocialTarget] ?? 'Social';
  }

  protected buildScheduleDailySheetSlack(): void {
    this.store.insertScheduleDailySheetSocialTemplate('slack', true);
  }

  protected buildScheduleDailySheetSocial(): void {
    this.store.insertScheduleDailySheetSocialTemplate(
      this.dailySocialTarget,
      true,
    );
  }

  protected buildScheduleAgentDailySheet(): void {
    this.store.insertScheduleAgentDailySheetTemplate(
      true,
      this.dailySocialTarget,
    );
  }

  protected buildScheduleAgent(): void {
    this.store.insertScheduleAgentTemplate(true);
  }

  protected runScheduleNow(): void {
    const id = this.store.workflowId();
    if (!id) {
      this.scheduleRunErr.set('Save the workflow first, then Run now.');
      return;
    }
    this.runningSchedule = true;
    this.scheduleRunMsg.set(null);
    this.scheduleRunErr.set(null);
    this.api.runScheduleNow(id).subscribe({
      next: (res) => {
        this.runningSchedule = false;
        if (res?.ok === false) {
          const err =
            res.error ?? 'Schedule not registered — Save with Schedule node first.';
          this.scheduleRunErr.set(err);
          this.store.addChatMessage('user', '⏱ Schedule — Run now');
          this.store.addChatMessage('error', `❌ ${err}`);
          return;
        }
        const exec = (res.result ?? {}) as Record<string, unknown>;
        this.chat.announceExecutionToChat(exec, {
          title: '⏱ Schedule — Run now',
        });
        this.scheduleRunMsg.set('Done — result is in the Chat panel below.');
        this.store.message.set('Schedule ran — see Chat for post status');
      },
      error: (err) => {
        this.runningSchedule = false;
        const msg =
          err?.error?.message ?? err?.error?.error ?? 'Run now failed';
        this.scheduleRunErr.set(msg);
        this.store.addChatMessage('user', '⏱ Schedule — Run now');
        this.store.addChatMessage('error', `❌ ${msg}`);
      },
    });
  }

  protected onNodeLabelChange(label: string): void {
    const node = this.store.selectedNode();
    if (!node) return;
    // Don't let Slack be renamed to "Schedule" (hides time settings confusion)
    if (node.type === 'slack' && label.trim().toLowerCase() === 'schedule') {
      this.store.updateNodeLabel(node.id, 'Slack');
      return;
    }
    if (node.type === 'schedule' && label.trim().toLowerCase() === 'slack') {
      this.store.updateNodeLabel(node.id, 'Schedule');
      return;
    }
    this.store.updateNodeLabel(node.id, label);
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
