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

  /**
   * SSE execute — live node_start / node_success / node_error for canvas loaders.
   */
  async executeWorkflowStream(
    definition: WorkflowDefinition,
    triggerData: Record<string, unknown>,
    options: {
      workflowId?: string | null;
      name?: string;
      onEvent: (event: Record<string, unknown>) => void;
    },
  ): Promise<Record<string, unknown>> {
    if (!this.base) {
      throw new Error('Backend API URL not set');
    }
    const res = await fetch(`${this.base}/workflows/execute-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        definition,
        triggerData,
        workflowId: options.workflowId ?? undefined,
        name: options.name,
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Execute stream failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: Record<string, unknown> | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('data:'));
        if (!line) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim()) as Record<
            string,
            unknown
          >;
          options.onEvent(payload);
          if (payload['type'] === 'done' || payload['status']) {
            finalResult = payload;
          }
          if (payload['type'] === 'error' && !finalResult) {
            finalResult = {
              status: 'FAILED',
              error: payload['error'] ?? 'Stream error',
            };
          }
        } catch {
          /* ignore partial JSON */
        }
      }
    }

    if (!finalResult) {
      throw new Error('Stream ended without result');
    }
    return finalResult;
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
    const empty = (message: string): AiIntegrationStatus => ({
      openai: { configured: false, source: 'none' },
      gemini: { configured: false, source: 'none' },
      groq: { configured: false, source: 'none' },
      openrouter: { configured: false, source: 'none' },
      ollama: { configured: false, source: 'none' },
      custom: { configured: false, source: 'none' },
      defaultProvider: 'openai',
      demoMode: true,
      message,
    });
    if (!this.base) {
      return of(
        empty('Backend API URL not set — add your API URL in Settings'),
      );
    }
    return this.http.get<AiIntegrationStatus>(`${this.base}/integrations/status/ai`).pipe(
      catchError(() => of(empty('Backend offline'))),
    );
  }

  setDefaultAiProvider(
    provider:
      | 'openai'
      | 'gemini'
      | 'groq'
      | 'openrouter'
      | 'ollama'
      | 'custom',
  ): Observable<{ defaultProvider: string; saved: boolean }> {
    if (!this.base) {
      return of({ defaultProvider: provider, saved: false });
    }
    return this.http.post<{ defaultProvider: string; saved: boolean }>(
      `${this.base}/integrations/ai-provider`,
      { provider },
    );
  }

  saveApiKey(type: 'OPENAI' | 'GEMINI', apiKey: string): Observable<unknown> {
    return this.http.post(`${this.base}/integrations/keys`, { type, apiKey });
  }

  saveLlmEndpoint(body: {
    provider:
      | 'openai'
      | 'gemini'
      | 'groq'
      | 'openrouter'
      | 'ollama'
      | 'custom';
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
  }): Observable<unknown> {
    if (!this.base) {
      return of({ saved: false });
    }
    return this.http.post(`${this.base}/integrations/llm-endpoint`, body);
  }

  clearChatMemory(sessionKey: string): Observable<{ cleared: boolean }> {
    if (!this.base) {
      return of({ cleared: false });
    }
    return this.http
      .post<{ cleared: boolean }>(`${this.base}/integrations/chat-memory/clear`, {
        sessionKey,
      })
      .pipe(catchError(() => of({ cleared: false })));
  }

  getGoogleSheetsStatus(): Observable<{
    configured: boolean;
    clientEmail: string | null;
    message: string;
    path?: string;
  }> {
    if (!this.base) {
      return of({
        configured: false,
        clientEmail: null,
        message: 'Backend API URL not set',
      });
    }
    return this.http
      .get<{
        configured: boolean;
        clientEmail: string | null;
        message: string;
      }>(`${this.base}/integrations/status/google-sheets`)
      .pipe(
        catchError(() =>
          of({
            configured: false,
            clientEmail: null,
            message: 'Backend offline',
          }),
        ),
      );
  }

  saveGoogleSheetsCredentials(json: string): Observable<{
    saved: boolean;
    clientEmail?: string;
    message?: string;
  }> {
    if (!this.base) {
      return of({ saved: false, message: 'Backend API URL not set' });
    }
    return this.http.post<{
      saved: boolean;
      clientEmail?: string;
      message?: string;
    }>(`${this.base}/integrations/google-sheets/credentials`, { json });
  }

  getEmailStatus(): Observable<{
    configured: boolean;
    mode: 'sendgrid' | 'smtp' | null;
    fromEmail: string | null;
    source: string;
    message: string;
  }> {
    if (!this.base) {
      return of({
        configured: false,
        mode: null,
        fromEmail: null,
        source: 'none',
        message: 'Backend API URL not set',
      });
    }
    return this.http
      .get<{
        configured: boolean;
        mode: 'sendgrid' | 'smtp' | null;
        fromEmail: string | null;
        source: string;
        message: string;
      }>(`${this.base}/integrations/status/email`)
      .pipe(
        catchError((err) => {
          const status = err?.status ?? err?.statusCode;
          const msg =
            status === 404
              ? 'Email API not found — restart backend (npm run start:dev) so Outbound Email routes load'
              : !err || status === 0
                ? 'Cannot reach backend — check tunnel/Backend API URL'
                : `Email status failed (${status ?? 'error'})`;
          return of({
            configured: false,
            mode: null,
            fromEmail: null,
            source: 'none',
            message: msg,
          });
        }),
      );
  }

  saveEmailCredentials(body: {
    mode: 'sendgrid' | 'smtp';
    sendgridApiKey?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    fromEmail?: string;
    fromName?: string;
  }): Observable<{ saved: boolean; mode?: string; fromEmail?: string; message?: string }> {
    if (!this.base) {
      return of({ saved: false, message: 'Backend API URL not set' });
    }
    return this.http.post<{
      saved: boolean;
      mode?: string;
      fromEmail?: string;
      message?: string;
    }>(`${this.base}/integrations/email/credentials`, body);
  }

  testPlatformEmail(to: string): Observable<{
    ok: boolean;
    message?: string;
    sent?: boolean;
  }> {
    if (!this.base) {
      return of({ ok: false, message: 'Backend API URL not set' });
    }
    return this.http
      .post<{ ok: boolean; message?: string; sent?: boolean }>(
        `${this.base}/integrations/email/test`,
        { to },
      )
      .pipe(
        catchError((err) =>
          of({
            ok: false,
            message: err?.error?.message ?? 'Test email failed',
          }),
        ),
      );
  }

  listGoogleSheetTabs(spreadsheetId: string): Observable<{
    ok: boolean;
    sheets: { title: string; sheetId: number }[];
    message?: string;
    spreadsheetId?: string;
  }> {
    if (!this.base) {
      return of({ ok: false, sheets: [], message: 'Backend API URL not set' });
    }
    return this.http
      .post<{
        ok: boolean;
        sheets: { title: string; sheetId: number }[];
        message?: string;
        spreadsheetId?: string;
      }>(`${this.base}/integrations/google-sheets/list-sheets`, {
        spreadsheetId,
      })
      .pipe(
        catchError((err) =>
          of({
            ok: false,
            sheets: [],
            message: err?.error?.message ?? 'Failed to list sheets',
          }),
        ),
      );
  }

  getGoogleSheetHeaders(
    spreadsheetId: string,
    sheetName: string,
  ): Observable<{
    ok: boolean;
    headers: string[];
    message?: string;
  }> {
    if (!this.base) {
      return of({ ok: false, headers: [], message: 'Backend API URL not set' });
    }
    return this.http
      .post<{
        ok: boolean;
        headers: string[];
        message?: string;
      }>(`${this.base}/integrations/google-sheets/headers`, {
        spreadsheetId,
        sheetName,
      })
      .pipe(
        catchError((err) =>
          of({
            ok: false,
            headers: [],
            message: err?.error?.message ?? 'Failed to load columns',
          }),
        ),
      );
  }

  /** Sidebar Execute — append / update / delete without running full chat workflow */
  executeGoogleSheetsPanel(body: {
    data: Record<string, unknown>;
    dryRun?: boolean | string;
    message?: string;
  }): Observable<{
    ok: boolean;
    error?: string;
    googleSheets?: Record<string, unknown> | null;
  }> {
    if (!this.base) {
      return of({ ok: false, error: 'Backend API URL not set' });
    }
    return this.http
      .post<{
        ok: boolean;
        error?: string;
        googleSheets?: Record<string, unknown> | null;
      }>(`${this.base}/nodes/google-sheets/execute`, body)
      .pipe(
        catchError((err) =>
          of({
            ok: false,
            error: err?.error?.error ?? err?.error?.message ?? 'Execute failed',
          }),
        ),
      );
  }
}
