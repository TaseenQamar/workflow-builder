import { JsonPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { WorkflowRecord } from '../../core/models/workflow.models';

interface StatCard {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
}

@Component({
  selector: 'app-dashboard',
  imports: [JsonPipe, RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly stats = signal<StatCard[]>([
    { label: 'Active Workflows', value: '—', change: 'Loading...', trend: 'neutral' },
    { label: 'Executions Today', value: '—', change: 'Loading...', trend: 'neutral' },
    { label: 'Success Rate', value: '—', change: 'Loading...', trend: 'neutral' },
    { label: 'Backend Status', value: '—', change: 'Checking...', trend: 'neutral' },
  ]);

  protected readonly workflows = signal<WorkflowRecord[]>([]);
  protected readonly runningId = signal<string | null>(null);
  protected readonly lastResult = signal<Record<string, unknown> | null>(null);
  protected readonly runError = signal<string | null>(null);
  protected readonly backendOnline = signal(false);
  protected readonly n8nOnline = signal(false);

  ngOnInit(): void {
    this.loadData();
  }

  protected runWorkflow(wf: WorkflowRecord): void {
    this.runningId.set(wf.id);
    this.runError.set(null);
    this.lastResult.set(null);

    const sample = {
      name: 'Ali Khan',
      body: 'Payment failed on subscription',
      topic: 'Workflow Automation',
      email: 'ali@example.com',
      orderId: 'ORD-1001',
      customerName: 'Ali',
      total: 99,
    };

    this.api.runWorkflow(wf.id, sample).subscribe({
      next: (result) => {
        this.lastResult.set(result);
        this.runningId.set(null);
        this.loadData();
      },
      error: (err) => {
        this.runError.set(err?.error?.message ?? 'Run failed — is backend running?');
        this.runningId.set(null);
      },
    });
  }

  protected isRunning(id: string): boolean {
    return this.runningId() === id;
  }

  private loadData(): void {
    this.api.checkBackendHealth().subscribe((ok) => {
      this.backendOnline.set(ok);
      if (!ok) {
        this.stats.set([
          { label: 'Active Workflows', value: '—', change: 'Backend offline', trend: 'down' },
          { label: 'Executions Today', value: '—', change: 'Start backend :3000', trend: 'neutral' },
          { label: 'Success Rate', value: '—', change: '—', trend: 'neutral' },
          { label: 'Backend Status', value: 'Offline', change: 'npm run start:dev', trend: 'down' },
        ]);
        return;
      }

      this.api.getN8nHealth().subscribe((n8n) => this.n8nOnline.set(n8n.connected));

      this.api.getWorkflows().subscribe((wfs) => {
        this.workflows.set(wfs);

        this.api.getExecutionStats().subscribe((stats) => {
          if (!stats) return;
          this.stats.set([
            {
              label: 'Active Workflows',
              value: String(wfs.length),
            change: `${wfs.filter((w) => w.active).length} active`,
            trend: 'up',
          },
          {
            label: 'Executions Today',
            value: String(stats.todayCount),
            change: `${stats.total} total`,
            trend: stats.todayCount > 0 ? 'up' : 'neutral',
          },
          {
            label: 'Success Rate',
            value: `${stats.successRate}%`,
            change: `LOCAL: ${stats.localRuns} · n8n: ${stats.n8nRuns}`,
            trend: Number(stats.successRate) >= 90 ? 'up' : 'neutral',
          },
          {
            label: 'Backend + n8n',
            value: ok ? 'Online' : 'Offline',
            change: stats.n8nConnected ? 'n8n connected' : 'n8n offline',
            trend: ok && stats.n8nConnected ? 'up' : 'neutral',
    },
  ]);
        });
      });
    });
  }
}
