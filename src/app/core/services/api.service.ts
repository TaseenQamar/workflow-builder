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

const API_STORAGE_KEY = 'wb-api-url';

function normalizeApiBase(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return environment.apiUrl;
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function resolveApiBase(): string {
  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('api');
    if (fromQuery) {
      const normalized = normalizeApiBase(fromQuery);
      try {
        localStorage.setItem(API_STORAGE_KEY, normalized);
      } catch {
        /* ignore */
      }
      return normalized;
    }
    try {
      const saved = localStorage.getItem(API_STORAGE_KEY);
      if (saved) return normalizeApiBase(saved);
    } catch {
      /* ignore */
    }
  }

  if (
    environment.production &&
    environment.apiUrl.includes('REPLACE_WITH_BACKEND_URL')
  ) {
    return '';
  }

  return environment.apiUrl;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private base = resolveApiBase();

  get apiBase(): string {
    return this.base;
  }

  /** Root without /api — used for /health */
  get apiOrigin(): string {
    return this.base.replace(/\/api\/?$/, '');
  }

  setApiBase(url: string): void {
    this.base = normalizeApiBase(url);
    try {
      localStorage.setItem(API_STORAGE_KEY, this.base);
    } catch {
      /* ignore */
    }
  }

  // ── Workflows ──────────────────────────────────────────

  getWorkflows(): Observable<WorkflowRecord[]> {
    if (!this.base) return of([]);
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
    if (!this.base) return of([]);
    const params = workflowId ? `?workflowId=${workflowId}` : '';
    return this.http
      .get<ExecutionRecord[]>(`${this.base}/executions${params}`)
      .pipe(catchError(() => of([])));
  }

  getExecution(id: string): Observable<ExecutionRecord> {
    return this.http.get<ExecutionRecord>(`${this.base}/executions/${id}`);
  }

  getExecutionStats(): Observable<ExecutionStats | null> {
    if (!this.base) return of(null);
    return this.http
      .get<ExecutionStats>(`${this.base}/executions/stats`)
      .pipe(catchError(() => of(null)));
  }

  // ── Nodes ──────────────────────────────────────────────

  getNodeTypes(): Observable<NodeTypeInfo[]> {
    if (!this.base) return of([]);
    return this.http
      .get<{ types: NodeTypeInfo[] }>(`${this.base}/nodes/types`)
      .pipe(
        map((r) => r.types),
        catchError(() => of([])),
      );
  }

  // ── n8n ──────────────────────────────────────────────

  getN8nHealth(): Observable<N8nHealth> {
    if (!this.base) {
      return of({ connected: false, api: false, webhook: false });
    }
    return this.http
      .get<N8nHealth>(`${this.base}/n8n/health`)
      .pipe(catchError(() => of({ connected: false, api: false, webhook: false })));
  }

  getN8nWorkflows(): Observable<unknown[]> {
    if (!this.base) return of([]);
    return this.http
      .get<unknown[]>(`${this.base}/n8n/workflows`)
      .pipe(catchError(() => of([])));
  }

  // ── Health ───────────────────────────────────────────

  checkBackendHealth(): Observable<boolean> {
    if (!this.apiOrigin || this.apiOrigin.includes('REPLACE_WITH_BACKEND_URL')) {
      return of(false);
    }
    return this.http.get<{ status: string }>(`${this.apiOrigin}/health`).pipe(
      map((r) => r.status === 'ok'),
      catchError(() => of(false)),
    );
  }

  getAiIntegrationStatus(): Observable<AiIntegrationStatus> {
    if (!this.base) {
      return of({
        openai: { configured: false, source: 'none' },
        gemini: { configured: false, source: 'none' },
        defaultProvider: 'openai' as const,
        demoMode: true,
        message: 'Backend API URL not set — add your API URL in Settings',
      });
    }
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
