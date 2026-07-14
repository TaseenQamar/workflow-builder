import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { ExecutionRecord } from '../../core/models/workflow.models';

interface ExecutionRow {
  id: string;
  workflow: string;
  status: 'success' | 'failed' | 'running';
  engine: string;
  startedAt: string;
  duration: string;
}

@Component({
  selector: 'app-executions',
  imports: [],
  templateUrl: './executions.html',
})
export class Executions implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly executions = signal<ExecutionRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly backendOnline = signal(false);

  ngOnInit(): void {
    this.loadExecutions();
  }

  protected refresh(): void {
    this.loadExecutions();
  }

  protected statusClass(status: ExecutionRow['status']): string {
    const classes: Record<ExecutionRow['status'], string> = {
      success: 'bg-emerald-50 text-emerald-700',
      failed: 'bg-red-50 text-red-600',
      running: 'bg-[#FFF2EB] text-[#F06225]',
    };
    return classes[status];
  }

  private loadExecutions(): void {
    this.loading.set(true);

    this.api.checkBackendHealth().subscribe((connected) => {
      this.backendOnline.set(connected);

      if (!connected) {
        this.executions.set([]);
        this.loading.set(false);
        return;
      }

      this.api.getExecutions().subscribe((data) => {
        this.executions.set(data.map((e) => this.toRow(e)));
        this.loading.set(false);
      });
    });
  }

  private toRow(e: ExecutionRecord): ExecutionRow {
    const start = new Date(e.startedAt);
    const durationMs = e.durationMs ?? null;

    let status: ExecutionRow['status'] = 'running';
    if (e.status === 'SUCCESS') status = 'success';
    else if (e.status === 'FAILED') status = 'failed';

    return {
      id: e.id,
      workflow: e.workflow?.name ?? e.workflowId,
      status,
      engine: e.engine ?? 'LOCAL',
      startedAt: this.timeAgo(start),
      duration: durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : '—',
    };
  }

  private timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }
}
