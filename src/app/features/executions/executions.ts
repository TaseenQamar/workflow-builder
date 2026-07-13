import { Component, inject, OnInit, signal } from '@angular/core';
import { N8nService } from '../../core/services/n8n.service';
import { N8nExecution } from '../../core/models/n8n.models';

interface ExecutionRow {
  id: string;
  workflow: string;
  status: 'success' | 'failed' | 'running';
  startedAt: string;
  duration: string;
}

@Component({
  selector: 'app-executions',
  imports: [],
  templateUrl: './executions.html',
  styleUrl: './executions.scss',
})
export class Executions implements OnInit {
  private readonly n8n = inject(N8nService);

  protected readonly executions = signal<ExecutionRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly n8nConnected = signal(false);

  ngOnInit(): void {
    this.loadExecutions();
  }

  protected refresh(): void {
    this.loadExecutions();
  }

  protected statusClass(status: ExecutionRow['status']): string {
    const classes: Record<ExecutionRow['status'], string> = {
      success: 'bg-emerald-500/20 text-emerald-300',
      failed: 'bg-red-500/20 text-red-300',
      running: 'bg-amber-500/20 text-amber-300',
    };
    return classes[status];
  }

  private loadExecutions(): void {
    this.loading.set(true);

    this.n8n.checkConnection().subscribe((connected) => {
      this.n8nConnected.set(connected);

      if (!connected) {
        this.executions.set(this.demoExecutions());
        this.loading.set(false);
        return;
      }

      this.n8n.getExecutions(25).subscribe((data) => {
        this.executions.set(data.map((e) => this.toRow(e)));
        this.loading.set(false);
      });
    });
  }

  private toRow(e: N8nExecution): ExecutionRow {
    const start = new Date(e.startedAt);
    const end = e.stoppedAt ? new Date(e.stoppedAt) : null;
    const durationMs = end ? end.getTime() - start.getTime() : null;

    return {
      id: e.id,
      workflow: e.workflowName || `Workflow ${e.workflowId}`,
      status: e.status === 'error' ? 'failed' : e.status === 'success' ? 'success' : 'running',
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

  private demoExecutions(): ExecutionRow[] {
    return [
      {
        id: 'demo-1',
        workflow: 'Customer Support - Ticket Router',
        status: 'success',
        startedAt: '2 min ago',
        duration: '1.8s',
      },
      {
        id: 'demo-2',
        workflow: 'E-commerce - Order Pipeline',
        status: 'success',
        startedAt: '12 min ago',
        duration: '3.2s',
      },
      {
        id: 'demo-3',
        workflow: 'AI Content - Blog Pipeline',
        status: 'failed',
        startedAt: '28 min ago',
        duration: '0.9s',
      },
    ];
  }
}
