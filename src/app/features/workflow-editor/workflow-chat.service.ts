import { Injectable, inject } from '@angular/core';
import { catchError, of, Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import {
  AiProviderChoice,
  readStoredAiProvider,
} from '../../core/constants/node-definitions';
import { WorkflowEditorStore } from './workflow-editor.store';
import { formatChatStamp } from '../../core/utils/chat-stamp';

@Injectable()
export class WorkflowChatService {
  private readonly api = inject(ApiService);
  private readonly store = inject(WorkflowEditorStore);
  private scheduleWatchSub: Subscription | null = null;
  private scheduleWatchTimer: ReturnType<typeof setInterval> | null = null;
  private seenExecutionIds = new Set<string>();
  private scheduleWatchReady = false;

  /** Poll backend executions so every-minute cron results appear in Chat. */
  startScheduleChatWatch(): void {
    this.stopScheduleChatWatch();
    this.seenExecutionIds.clear();
    this.scheduleWatchReady = false;

    const tick = () => {
      const id = this.store.workflowId();
      if (!id) return;
      this.scheduleWatchSub?.unsubscribe();
      this.scheduleWatchSub = this.api.getExecutions(id).subscribe({
        next: (list) => {
          const sorted = [...(list ?? [])].sort(
            (a, b) =>
              new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
          );
          if (!this.scheduleWatchReady) {
            for (const ex of sorted) this.seenExecutionIds.add(ex.id);
            this.scheduleWatchReady = true;
            return;
          }
          for (const ex of sorted) {
            if (this.seenExecutionIds.has(ex.id)) continue;
            this.seenExecutionIds.add(ex.id);

            const trigger = (ex.triggerData ?? {}) as Record<string, unknown>;
            const outRaw = (ex.output ?? {}) as Record<string, unknown>;
            // Merge trigger into output so schedule markers + post status both survive
            const out: Record<string, unknown> = { ...trigger, ...outRaw };

            const isScheduled =
              out['triggerType'] === 'schedule' ||
              out['_scheduled'] === true ||
              trigger['triggerType'] === 'schedule' ||
              trigger['_scheduled'] === true ||
              !!String(out['scheduledAtLocal'] ?? out['postStamp'] ?? '').trim();
            if (!isScheduled) continue;

            // Still running — wait for next poll with finished output
            if (
              String(ex.status).toUpperCase() === 'RUNNING' ||
              String(ex.status).toUpperCase() === 'QUEUED'
            ) {
              this.seenExecutionIds.delete(ex.id);
              continue;
            }

            const stamp =
              String(out['scheduledAtLocal'] ?? out['postStamp'] ?? '').trim() ||
              formatChatStamp(
                new Date(ex.finishedAt || ex.startedAt),
                String(
                  this.store
                    .nodes()
                    .find((n) => n.type === 'schedule')?.data['timezone'] ??
                    'Asia/Karachi',
                ),
              );
            this.announceExecutionToChat(
              {
                status: ex.status,
                error: ex.error,
                output: out,
              },
              { title: `⏱ Schedule ${stamp}` },
            );
          }
        },
        error: () => {
          /* ignore poll errors */
        },
      });
    };

    tick();
    // Every-minute schedule → poll often so each post shows quickly in chat
    this.scheduleWatchTimer = setInterval(tick, 5_000);
  }

  stopScheduleChatWatch(): void {
    if (this.scheduleWatchTimer) {
      clearInterval(this.scheduleWatchTimer);
      this.scheduleWatchTimer = null;
    }
    this.scheduleWatchSub?.unsubscribe();
    this.scheduleWatchSub = null;
  }

  /** Wire auto-save of UI chat threads to Postgres (per workflow). */
  bindChatPersistence(): void {
    this.store.registerChatPersist(() => this.saveActiveChat());
  }

  unbindChatPersistence(): void {
    this.store.registerChatPersist(null);
  }

  /** Load thread list + open latest (or create empty) when a workflow is opened. */
  loadChatsForWorkflow(workflowId: string | null): void {
    if (!workflowId) {
      this.store.chatThreads.set([]);
      this.store.activeChatId.set(null);
      return;
    }
    this.api.listWorkflowChats(workflowId).subscribe((list) => {
      this.store.chatThreads.set(list);
      if (!list.length) {
        this.createNewChat(false);
        return;
      }
      const current = this.store.activeChatId();
      const pick =
        (current && list.find((t) => t.id === current)?.id) || list[0].id;
      this.switchChat(pick);
    });
  }

  createNewChat(clearAgentMemory = true): void {
    const wfId = this.store.workflowId();
    const oldSession = this.store.chatSessionId();
    if (clearAgentMemory) {
      this.api.clearChatMemory(oldSession).subscribe();
    }
    if (!wfId) {
      this.store.newChatSession();
      this.store.message.set('Save the workflow to keep chats permanently.');
      return;
    }
    // Persist current thread first
    this.saveActiveChat();
    this.api.createWorkflowChat(wfId, { title: 'New chat', messages: [] }).subscribe({
      next: (created) => {
        this.store.setActiveChat(
          created.id,
          [],
          created.sessionKey,
          created.title,
        );
        this.refreshThreadList();
        this.store.message.set('New chat started — messages will auto-save');
      },
      error: () => {
        this.store.newChatSession();
        this.store.message.set('Could not create chat on server — local only');
      },
    });
  }

  switchChat(chatId: string): void {
    const wfId = this.store.workflowId();
    if (!wfId || !chatId) return;
    this.saveActiveChat();
    this.api.getWorkflowChat(wfId, chatId).subscribe({
      next: (chat) => {
        if (!chat) return;
        const msgs = (chat.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'error',
          text: m.text,
          at: m.at,
        }));
        this.store.setActiveChat(chat.id, msgs, chat.sessionKey, chat.title);
      },
    });
  }

  deleteActiveChat(): void {
    const wfId = this.store.workflowId();
    const chatId = this.store.activeChatId();
    if (!wfId || !chatId) {
      this.store.newChatSession();
      return;
    }
    const session = this.store.chatSessionId();
    this.api.deleteWorkflowChat(wfId, chatId).subscribe({
      next: () => {
        this.api.clearChatMemory(session).subscribe();
        this.api.listWorkflowChats(wfId).subscribe((list) => {
          this.store.chatThreads.set(list);
          if (list.length) {
            this.switchChat(list[0].id);
          } else {
            this.createNewChat(false);
          }
          this.store.message.set('Chat deleted');
        });
      },
    });
  }

  deleteChatById(chatId: string): void {
    const wfId = this.store.workflowId();
    if (!wfId || !chatId) return;
    const wasActive = this.store.activeChatId() === chatId;
    const session = wasActive ? this.store.chatSessionId() : null;
    this.api.deleteWorkflowChat(wfId, chatId).subscribe({
      next: () => {
        if (session) this.api.clearChatMemory(session).subscribe();
        this.refreshThreadList(() => {
          if (wasActive) {
            const list = this.store.chatThreads();
            if (list.length) this.switchChat(list[0].id);
            else this.createNewChat(false);
          }
          this.store.message.set('Chat deleted');
        });
      },
    });
  }

  private refreshThreadList(done?: () => void): void {
    const wfId = this.store.workflowId();
    if (!wfId) {
      done?.();
      return;
    }
    this.api.listWorkflowChats(wfId).subscribe((list) => {
      this.store.chatThreads.set(list);
      done?.();
    });
  }

  /** Flush current chat messages to the server. */
  saveActiveChat(): void {
    const wfId = this.store.workflowId();
    const chatId = this.store.activeChatId();
    const messages = this.store.chatMessages();
    if (!wfId) return;

    if (!chatId) {
      if (!messages.length) return;
      this.api
        .createWorkflowChat(wfId, {
          title: this.store.chatTitle(),
          messages,
        })
        .subscribe({
          next: (created) => {
            this.store.activeChatId.set(created.id);
            this.store.chatSessionId.set(created.sessionKey);
            this.refreshThreadList();
          },
        });
      return;
    }

    this.api
      .saveWorkflowChat(wfId, chatId, {
        title: this.store.chatTitle(),
        messages,
      })
      .subscribe({
        next: () => this.refreshThreadList(),
      });
  }

  run(message?: string): void {
    const text = (message ?? this.store.chatInput()).trim();
    if (!text || this.store.running()) return;

    // Always re-read Settings provider before calling the API
    this.api
      .getAiIntegrationStatus()
      .pipe(
        catchError(() =>
          of({
            defaultProvider: readStoredAiProvider() as AiProviderChoice,
          }),
        ),
      )
      .subscribe((status) => {
        const raw = status.defaultProvider;
        const provider: AiProviderChoice =
          raw === 'gemini' ||
          raw === 'groq' ||
          raw === 'openrouter' ||
          raw === 'ollama' ||
          raw === 'custom' ||
          raw === 'openai'
            ? raw
            : readStoredAiProvider();
        this.store.setDefaultAiProvider(provider);
        this.executeChat(text);
      });
  }

  private executeChat(text: string): void {
    // "connection / workflow banao" → canvas wires banaye, execute mat karo
    const built = this.store.tryBuildFlowFromChat(text);
    if (built) {
      this.store.addChatMessage('user', text);
      this.store.chatInput.set('');
      this.store.addChatMessage('assistant', built);
      this.store.message.set('Canvas updated from chat');
      return;
    }

    this.store.ensureChatWorkflow();
    this.store.ensureConversationAgent(); // Chat → AI Agent
    this.store.ensureAgentCentricFlow(); // Agent → Sheets → Email (no bypass)
    this.store.ensureConnections();
    this.store.applyDefaultProviderToChatModels();

    const validationErrors = this.store.validateWorkflowForRun();
    if (validationErrors.length) {
      this.store.error.set(validationErrors.join(' · '));
      return;
    }

    // Sirf jab Memory node wired ho — warna pehli baatein AI ko mat bhejo
    const memoryOn = this.store.hasMemoryAttached();
    const priorHistory = memoryOn ? this.store.chatHistoryForAgent() : [];

    this.store.addChatMessage('user', text);
    this.store.chatInput.set('');
    this.store.running.set(true);
    this.store.error.set(null);
    this.store.clearNodeRunStatuses();

    const triggerData = {
      message: text,
      body: text,
      name: 'User',
      sessionId: this.store.chatSessionId(),
      _chatHistory: priorHistory,
      workflowName: this.store.workflowName(),
      workflowDescription: this.store.description(),
    };

    void this.api
      .executeWorkflowStream(this.store.toApiDefinition(), triggerData, {
        workflowId: this.store.workflowId(),
        name: this.store.workflowName(),
        onEvent: (event) => this.applyNodeRunEvent(event),
      })
      .then((result) => {
        this.store.running.set(false);
        const savedId = result['workflowId'];
        if (typeof savedId === 'string' && savedId) {
          this.store.workflowId.set(savedId);
        }
        const status = String(result['status'] ?? '');

        if (status === 'FAILED' || result['error']) {
          const errText = String(result['error'] ?? 'Workflow failed');
          this.store.addChatMessage('error', errText);
          this.store.error.set(errText);
          return;
        }

        const reply = this.extractChatResponse(result);
        // Prefer error bubble when social/sheet post clearly failed
        const postBlock = this.formatSocialPostStatus(
          (result['output'] as Record<string, unknown>) ?? {},
        );
        const postFailed =
          !!postBlock &&
          /❌/.test(postBlock) &&
          !/✅\s+(LinkedIn|Slack|Facebook|Instagram)/.test(postBlock);
        this.store.addChatMessage(postFailed ? 'error' : 'assistant', reply);

        const output = result['output'] as Record<string, unknown> | undefined;
        const agent = output?.['agent'] as Record<string, unknown> | undefined;
        const demo = agent?.['demoMode'];
        const usedProvider = String(agent?.['provider'] ?? '');
        const persisted = result['persisted'] === true;
        this.store.message.set(
          demo
            ? 'Demo mode — save an OpenAI/Gemini API key in Settings'
            : persisted
              ? `Workflow completed via ${usedProvider || 'AI'} · saved to PostgreSQL`
              : `Workflow completed via ${usedProvider || 'AI'}`,
        );
      })
      .catch((err: unknown) => {
        this.store.running.set(false);
        const errText =
          err instanceof Error
            ? err.message
            : 'Chat failed — is the backend running? Is an API key set in Settings?';
        this.store.addChatMessage('error', errText);
        this.store.error.set(errText);
      });
  }

  private applyNodeRunEvent(event: Record<string, unknown>): void {
    const type = String(event['type'] ?? '');
    const nodeId = String(event['nodeId'] ?? '');
    if (!nodeId) return;
    if (type === 'node_start') {
      this.store.setNodeRunStatus(nodeId, 'running');
    } else if (type === 'node_success') {
      this.store.setNodeRunStatus(nodeId, 'success');
    } else if (type === 'node_error') {
      this.store.setNodeRunStatus(
        nodeId,
        'error',
        String(event['error'] ?? 'Failed'),
      );
    }
  }

  private extractChatResponse(result: Record<string, unknown>): string {
    const output = result['output'] as Record<string, unknown> | undefined;
    if (!output) return 'No response from workflow';

    const aiText =
      (typeof output['aiResponse'] === 'string' && output['aiResponse']) ||
      (typeof (output['agent'] as Record<string, unknown> | undefined)?.[
        'response'
      ] === 'string'
        ? String((output['agent'] as Record<string, unknown>)['response'])
        : '');

    const gs = output['googleSheets'] as Record<string, unknown> | undefined;
    const email = output['email'] as Record<string, unknown> | undefined;
    const parts: string[] = [];

    // Normal baatcheet pehle — Sheets skip AI jawab dabae nahi
    if (aiText) parts.push(aiText);

    if (gs) {
      if (gs['skipped'] === true) {
        // skip = no sheet action; don't replace the conversation
        if (!aiText) {
          parts.push(
            String(
              gs['message'] ??
                'Sheet was not changed. For sheets say: update the sheet / add 5 rows',
            ),
          );
        }
      } else if (gs['dryRun'] === true) {
        if (gs['operation'] === 'update_matching') {
          parts.push(
            `[Sheets dry-run] ${gs['matchedRows'] ?? 0} row(s) · ` +
              `${gs['lookupColumn']}=${gs['lookupValue']} · set Dry Run=false to write`,
          );
        } else {
          parts.push(
            `[Sheets dry-run] ${gs['rowsToAppend'] ?? 1} row(s) preview — set Dry Run=false to write`,
          );
        }
      } else if (gs['ok'] === true) {
        const op = String(gs['operation'] ?? 'done');
        const sheet = String(gs['sheetName'] ?? 'sheet');
        if (op === 'update_matching') {
          parts.push(
            `[Sheets] Updated ${gs['matchedRows'] ?? 0} row(s) on ${sheet}`,
          );
        } else if (op === 'append') {
          parts.push(
            `[Sheets] Appended ${gs['rowsAppended'] ?? 1} row(s) on ${sheet}` +
              `${gs['updatedRange'] ? ` (${gs['updatedRange']})` : ''}`,
          );
        } else {
          parts.push(
            `[Sheets] ${op} OK → ${sheet}` +
              `${gs['updatedRange'] ? ` (${gs['updatedRange']})` : ''}`,
          );
        }
      } else if (!aiText) {
        parts.push(
          `Google Sheets failed: ${String(gs['hint'] ?? gs['message'] ?? 'unknown')}`,
        );
      }
    }

    if (email) {
      if (email['skipped'] === true) {
        parts.push(`[Email skipped] ${String(email['reason'] ?? 'no recipient')}`);
      } else if (email['demoMode'] === true || email['provider'] === 'demo') {
        parts.push(
          `[Email DEMO — not delivered to inbox]\n` +
            String(
              email['hint'] ??
                'Set SMTP_USER + SMTP_PASS (Gmail App Password) in backend .env, then restart the server.',
            ),
        );
      } else if (email['sent'] === true || email['ok'] === true) {
        parts.push(
          `[Email] sent via ${String(email['provider'] ?? 'smtp')} → ${String(email['to'] ?? 'recipient')}`,
        );
      } else if (email['error']) {
        parts.push(`[Email failed] ${String(email['error'])}`);
      }
    }

    const slack = output['slack'] as Record<string, unknown> | undefined;
    if (slack) {
      if (slack['demoMode'] === true || slack['provider'] === 'demo') {
        parts.push(
          `[Slack DEMO — not posted]\n` +
            String(
              slack['hint'] ??
                'Settings → Slack → paste Bot Token (xoxb-…) and invite the bot to the channel.',
            ),
        );
      } else if (slack['sent'] === true) {
        parts.push(
          slack['imagePosted']
            ? `✅ Slack image posted → ${String(slack['channel'] ?? 'channel')}`
            : `✅ Slack posted → ${String(slack['channel'] ?? 'channel')}`,
        );
      } else if (slack['error']) {
        parts.push(`❌ Slack failed: ${String(slack['error'])}`);
      }
    }

    // Social / sheet Post column — always show so user sees row posted or failed
    const postStatus = this.formatSocialPostStatus(output);
    if (postStatus) parts.push(postStatus);

    const agent = output['agent'] as Record<string, unknown> | undefined;
    const toolRuns = agent?.['toolRuns'] as
      | Array<{ name: string; ok: boolean; summary: string }>
      | undefined;
    if (toolRuns?.length) {
      parts.push(
        `[Tools]\n` +
          toolRuns
            .map((t) => `${t.ok ? '✓' : '✗'} ${t.name}: ${t.summary}`)
            .join('\n'),
      );
    }

    if (parts.length) return parts.join('\n\n');

    if (typeof output['category'] === 'string') return output['category'];
    if (typeof output['summary'] === 'string') return output['summary'];

    return JSON.stringify(output, null, 2);
  }

  /**
   * Push schedule / execute result into the bottom Chat panel
   * so the user sees which row posted or what error occurred.
   */
  announceExecutionToChat(
    result: Record<string, unknown>,
    opts?: { title?: string },
  ): void {
    const title = opts?.title?.trim() || 'Workflow run';
    this.store.addChatMessage('user', title);

    const status = String(result['status'] ?? '');
    const error = result['error'];
    if (status === 'FAILED' || error) {
      this.store.addChatMessage(
        'error',
        `❌ ${title} failed\n${String(error ?? 'Unknown error')}`,
      );
      return;
    }

    const output = (result['output'] ?? {}) as Record<string, unknown>;
    const summary = this.extractChatResponse({ output, status });
    const postOnly = this.formatSocialPostStatus(output);
    const text =
      postOnly ||
      summary ||
      'Run finished — check Executions for details.';
    const hasFail =
      /❌|failed|error/i.test(text) && !/✅/.test(text.split('\n')[0] ?? '');
    this.store.addChatMessage(hasFail ? 'error' : 'assistant', text);
  }

  /** LinkedIn / FB / IG / Telegram / Discord + sheet Post column. */
  formatSocialPostStatus(output: Record<string, unknown>): string {
    const lines: string[] = [];
    const next = output['nextPost'] as
      | {
          sheetRow?: number;
          rowIndex?: number;
          message?: string;
          imagePrompt?: string;
        }
      | undefined;
    const sheetMark = output['sheetPostStatus'] as
      | { ok?: boolean; status?: string; cell?: string; sheetRow?: number; error?: string }
      | undefined;
    const gs = output['googleSheets'] as
      | { ok?: boolean; skipped?: boolean; operation?: string; sheetRow?: number }
      | undefined;

    const platforms: Array<{
      key: string;
      label: string;
      ok: (p: Record<string, unknown>) => boolean;
      detail: (p: Record<string, unknown>) => string;
    }> = [
      {
        key: 'linkedin',
        label: 'LinkedIn',
        ok: (p) => p['posted'] === true,
        detail: (p) => {
          if (p['duplicate'] === true) {
            return 'already posted (duplicate) — queue marked success';
          }
          if (p['dryRun'] === true) {
            return `dry-run: ${String(p['hint'] ?? 'preview only')}`;
          }
          if (p['posted'] === true) {
            return p['imagePosted']
              ? 'posted with image'
              : 'text posted';
          }
          const err = p['error'] ?? p['reason'] ?? p['imageError'] ?? p['hint'];
          return err
            ? String(typeof err === 'string' ? err : JSON.stringify(err)).slice(
                0,
                280,
              )
            : 'not posted';
        },
      },
      {
        key: 'facebook',
        label: 'Facebook',
        ok: (p) => p['posted'] === true,
        detail: (p) => {
          if (p['duplicate'] === true) {
            return 'already posted (duplicate) — queue marked success';
          }
          if (p['dryRun'] === true) {
            return `dry-run: ${String(p['hint'] ?? 'preview only')}`;
          }
          if (p['posted'] === true) {
            return p['imagePosted']
              ? 'posted with image'
              : 'text posted';
          }
          const err = p['error'] ?? p['reason'] ?? p['imageError'] ?? p['hint'];
          return err
            ? String(typeof err === 'string' ? err : JSON.stringify(err)).slice(
                0,
                280,
              )
            : 'not posted';
        },
      },
      {
        key: 'instagram',
        label: 'Instagram',
        ok: (p) => p['posted'] === true,
        detail: (p) =>
          p['posted'] === true
            ? 'posted'
            : String(p['error'] ?? p['reason'] ?? p['hint'] ?? 'not posted').slice(
                0,
                280,
              ),
      },
      {
        key: 'telegram',
        label: 'Telegram',
        ok: (p) => p['posted'] === true || p['sent'] === true || p['ok'] === true,
        detail: (p) =>
          p['posted'] === true || p['sent'] === true
            ? 'posted'
            : String(p['error'] ?? p['reason'] ?? 'not posted').slice(0, 280),
      },
      {
        key: 'discord',
        label: 'Discord',
        ok: (p) => p['posted'] === true || p['sent'] === true || p['ok'] === true,
        detail: (p) =>
          p['posted'] === true || p['sent'] === true
            ? 'posted'
            : String(p['error'] ?? p['reason'] ?? 'not posted').slice(0, 280),
      },
    ];

    let hasSocial = false;
    for (const plat of platforms) {
      const raw = output[plat.key];
      if (!raw || typeof raw !== 'object') continue;
      hasSocial = true;
      const p = raw as Record<string, unknown>;
      const ok = plat.ok(p);
      const detail = plat.detail(p);
      lines.push(`${ok ? '✅' : '❌'} ${plat.label}: ${detail}`);
    }

    const hasSheetMark = !!(
      sheetMark &&
      (sheetMark.status || sheetMark.error || sheetMark.cell)
    );
    if (hasSheetMark) {
      const st = String(sheetMark!.status ?? '').toLowerCase();
      const ok = sheetMark!.ok === true && (st === 'success' || st === 'ok');
      lines.push(
        ok
          ? `✅ Sheet Post column → success${sheetMark!.cell ? ` (${sheetMark!.cell})` : ''}`
          : `❌ Sheet Post column → ${sheetMark!.status ?? 'failed'}${
              sheetMark!.error ? `: ${sheetMark!.error}` : ''
            }${sheetMark!.cell ? ` (${sheetMark!.cell})` : ''}`,
      );
    }

    const dailySheet =
      gs &&
      gs['skipped'] !== true &&
      (gs['operation'] === 'read_next_daily' || !!next);

    // Casual chat (hi / how are you): no social/sheet post → no Caption spam
    if (!hasSocial && !hasSheetMark && !dailySheet) {
      return '';
    }

    const row =
      next?.sheetRow ??
      sheetMark?.sheetRow ??
      gs?.sheetRow;
    if (row) {
      lines.unshift(`📋 Sheet row ${row}`);
    }

    // Only sheet nextPost caption — never use output.message (that's the chat greeting)
    const caption = String(next?.message ?? '').trim();
    if (caption && (hasSocial || hasSheetMark || dailySheet)) {
      lines.push(
        `💬 Caption: ${caption.slice(0, 200)}${caption.length > 200 ? '…' : ''}`,
      );
    }
    const imgPrompt = String(next?.imagePrompt ?? '').trim();
    if (imgPrompt && (hasSocial || hasSheetMark || dailySheet)) {
      lines.push(
        `🖼 ImagePrompt: ${imgPrompt.slice(0, 120)}${imgPrompt.length > 120 ? '…' : ''}`,
      );
    }

    return lines.length ? lines.join('\n') : '';
  }
}
