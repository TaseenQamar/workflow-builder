import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  N8nExecution,
  N8nExecutionsResponse,
  N8nWorkflow,
  N8nWorkflowsResponse,
} from '../models/n8n.models';

@Injectable({ providedIn: 'root' })
export class N8nService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.n8nApiUrl;
  private readonly webhookBase = environment.n8nWebhookUrl;

  private headers(): HttpHeaders {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (environment.n8nApiKey) {
      headers['X-N8N-API-KEY'] = environment.n8nApiKey;
    }
    return new HttpHeaders(headers);
  }

  checkConnection(): Observable<boolean> {
    return this.http
      .get<{ status: string }>(`${this.apiUrl}/health`, {
        headers: this.headers(),
      })
      .pipe(
        map(() => true),
        catchError(() => of(false)),
      );
  }

  getWorkflows(): Observable<N8nWorkflow[]> {
    return this.http
      .get<N8nWorkflowsResponse>(`${this.apiUrl}/workflows`, {
        headers: this.headers(),
      })
      .pipe(
        map((res) => res.data ?? []),
        catchError(() => of([])),
      );
  }

  getExecutions(limit = 20): Observable<N8nExecution[]> {
    return this.http
      .get<N8nExecutionsResponse>(`${this.apiUrl}/executions`, {
        headers: this.headers(),
        params: { limit: limit.toString() },
      })
      .pipe(
        map((res) => res.data ?? []),
        catchError(() => of([])),
      );
  }

  triggerWebhook<T = unknown>(
    path: string,
    payload: Record<string, unknown>,
  ): Observable<T> {
    return this.http.post<T>(`${this.webhookBase}/${path}`, payload);
  }
}
