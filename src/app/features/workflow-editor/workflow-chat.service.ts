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
        const provider: AiProviderChoice =
          status.defaultProvider === 'gemini' ? 'gemini' : 'openai';
        this.store.setDefaultAiProvider(provider);
        this.executeChat(text);
      });
  }

  private executeChat(text: string): void {
    this.store.ensureChatWorkflow();
    this.store.ensureConnections();
    this.store.applyDefaultProviderToChatModels();

    const validationErrors = this.store.validateWorkflowForRun();
    if (validationErrors.length) {
      this.store.error.set(validationErrors.join(' · '));
      return;
    }

    this.store.addChatMessage('user', text);
    this.store.chatInput.set('');
    this.store.running.set(true);
    this.store.error.set(null);

    const triggerData = {
      message: text,
      body: text,
      name: 'User',
      sessionId: this.store.workflowId() ?? 'chat-session',
    };

    this.api
      .executeWorkflow(this.store.toApiDefinition(), triggerData, {
        workflowId: this.store.workflowId(),
        name: this.store.workflowName(),
      })
      .subscribe({
        next: (result) => {
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
        },
        error: (err) => {
          this.store.running.set(false);
          const errText =
            err?.error?.message ??
            'Chat failed — is the backend running? Is an API key set in Settings?';
          this.store.addChatMessage('error', errText);
          this.store.error.set(errText);
        },
      });
  }

  private extractChatResponse(result: Record<string, unknown>): string {
    const output = result['output'] as Record<string, unknown> | undefined;
    if (!output) return 'No response from workflow';

    if (typeof output['aiResponse'] === 'string') return output['aiResponse'];

    const agent = output['agent'] as Record<string, unknown> | undefined;
    if (typeof agent?.['response'] === 'string') return agent['response'];

    if (typeof output['category'] === 'string') return output['category'];
    if (typeof output['summary'] === 'string') return output['summary'];

    return JSON.stringify(output, null, 2);
  }
}
