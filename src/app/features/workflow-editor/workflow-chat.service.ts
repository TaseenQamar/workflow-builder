import { Injectable, inject } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import {
  AiProviderChoice,
  readStoredAiProvider,
} from '../../core/constants/node-definitions';
import { WorkflowEditorStore } from './workflow-editor.store';

@Injectable()
export class WorkflowChatService {
  private readonly api = inject(ApiService);
  private readonly store = inject(WorkflowEditorStore);

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
        this.store.addChatMessage('assistant', reply);

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
          `[Email DEMO — inbox me nahi gayi]\n` +
            String(
              email['hint'] ??
                'Backend .env me SMTP_USER + SMTP_PASS (Gmail App Password) set karke server restart karo.',
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
}
