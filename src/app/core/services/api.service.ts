import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ExecutionMode,
  ExecutionRecord,
  ExecutionStats,
  N8nHealth,
  AiIntegrationStatus,
  NodeTypeInfo,
  WorkflowDefinition,
  WorkflowRecord,
} from '../models/workflow.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // ── Workflows ──────────────────────────────────────────

  getWorkflows(): Observable<WorkflowRecord[]> {
    return this.http.get<WorkflowRecord[]>(`${this.base}/workflows`).pipe(
      catchError(() => of([])),
    );
  }

  getWorkflow(id: string): Observable<WorkflowRecord> {
    return this.http.get<WorkflowRecord>(`${this.base}/workflows/${id}`);
  }

  createWorkflow(body: {
    name: string;
    description?: string;
    definition: WorkflowDefinition;
    active?: boolean;
    executionMode?: ExecutionMode;
  }): Observable<WorkflowRecord> {
    return this.http.post<WorkflowRecord>(`${this.base}/workflows`, body);
  }

  updateWorkflow(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      definition: WorkflowDefinition;
      active: boolean;
      executionMode: ExecutionMode;
    }>,
  ): Observable<WorkflowRecord> {
    return this.http.put<WorkflowRecord>(`${this.base}/workflows/${id}`, body);
  }

  deleteWorkflow(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/workflows/${id}`);
  }

  runWorkflow(
    id: string,
    triggerData: Record<string, unknown> = {},
    async = false,
  ): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.base}/workflows/${id}/run`,
      { triggerData, async },
    );
  }

  executeWorkflow(
    definition: WorkflowDefinition,
    triggerData: Record<string, unknown> = {},
    options?: { workflowId?: string | null; name?: string },
  ): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.base}/workflows/execute`,
      {
        definition,
        triggerData,
        workflowId: options?.workflowId ?? undefined,
        name: options?.name,
      },
    );
  }

  syncWorkflowToN8n(id: string): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.base}/workflows/${id}/sync-n8n`,
      {},
    );
  }

  triggerWebhook(
    path: string,
    payload: Record<string, unknown>,
    sync = false,
  ): Observable<Record<string, unknown>> {
    const qs = sync ? '?sync=true' : '';
    return this.http.post<Record<string, unknown>>(
      `${this.base}/webhooks/${path}${qs}`,
      payload,
    );
  }

  // ── Executions ─────────────────────────────────────────

  getExecutions(workflowId?: string): Observable<ExecutionRecord[]> {
    const params = workflowId ? `?workflowId=${workflowId}` : '';
    return this.http
      .get<ExecutionRecord[]>(`${this.base}/executions${params}`)
      .pipe(catchError(() => of([])));
  }

  getExecution(id: string): Observable<ExecutionRecord> {
    return this.http.get<ExecutionRecord>(`${this.base}/executions/${id}`);
  }

  getExecutionStats(): Observable<ExecutionStats | null> {
    return this.http
      .get<ExecutionStats>(`${this.base}/executions/stats`)
      .pipe(catchError(() => of(null)));
  }

  // ── Nodes ──────────────────────────────────────────────

  getNodeTypes(): Observable<NodeTypeInfo[]> {
    return this.http
      .get<{ types: NodeTypeInfo[] }>(`${this.base}/nodes/types`)
      .pipe(
        map((r) => r.types),
        catchError(() => of([])),
      );
  }

  // ── n8n ──────────────────────────────────────────────

  getN8nHealth(): Observable<N8nHealth> {
    return this.http
      .get<N8nHealth>(`${this.base}/n8n/health`)
      .pipe(catchError(() => of({ connected: false, api: false, webhook: false })));
  }

  getN8nWorkflows(): Observable<unknown[]> {
    return this.http
      .get<unknown[]>(`${this.base}/n8n/workflows`)
      .pipe(catchError(() => of([])));
  }

  // ── Health ───────────────────────────────────────────

  checkBackendHealth(): Observable<boolean> {
    return this.http.get<{ status: string; database: string }>('/health').pipe(
      map((r) => r.status === 'ok'),
      catchError(() => of(false)),
    );
  }

  getAiIntegrationStatus(): Observable<AiIntegrationStatus> {
    return this.http.get<AiIntegrationStatus>(`${this.base}/integrations/status/ai`).pipe(
      catchError(() =>
        of({
          openai: { configured: false, source: 'none' },
          gemini: { configured: false, source: 'none' },
          defaultProvider: 'openai' as const,
          demoMode: true,
          message: 'Backend offline',
        }),
      ),
    );
  }

  setDefaultAiProvider(provider: 'openai' | 'gemini'): Observable<{ defaultProvider: string; saved: boolean }> {
    return this.http.post<{ defaultProvider: string; saved: boolean }>(
      `${this.base}/integrations/ai-provider`,
      { provider },
    );
  }

  saveApiKey(type: 'OPENAI' | 'GEMINI', apiKey: string): Observable<unknown> {
    return this.http.post(`${this.base}/integrations/keys`, { type, apiKey });
  }
}
