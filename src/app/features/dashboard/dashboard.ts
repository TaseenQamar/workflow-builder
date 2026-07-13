import { JsonPipe } from '@angular/common';
import {
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { N8nService } from '../../core/services/n8n.service';
import {
  WORKFLOW_USE_CASES,
  WorkflowUseCase,
} from '../../core/models/n8n.models';

interface StatCard {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
}

@Component({
  selector: 'app-dashboard',
  imports: [JsonPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly n8n = inject(N8nService);

  protected readonly stats = signal<StatCard[]>([
    { label: 'Active Workflows', value: '—', change: 'Loading...', trend: 'neutral' },
    { label: 'Executions Today', value: '—', change: 'Loading...', trend: 'neutral' },
    { label: 'Success Rate', value: '—', change: 'Loading...', trend: 'neutral' },
    { label: 'n8n Status', value: '—', change: 'Checking...', trend: 'neutral' },
  ]);

  protected readonly useCases = signal<WorkflowUseCase[]>(WORKFLOW_USE_CASES);
  protected readonly runningWorkflow = signal<string | null>(null);
  protected readonly lastResult = signal<Record<string, unknown> | null>(null);
  protected readonly runError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadStats();
  }

  protected runWorkflow(useCase: WorkflowUseCase): void {
    this.runningWorkflow.set(useCase.id);
    this.runError.set(null);
    this.lastResult.set(null);

    this.n8n.triggerWebhook(useCase.webhookPath, useCase.samplePayload).subscribe({
      next: (result) => {
        this.lastResult.set(result as Record<string, unknown>);
        this.runningWorkflow.set(null);
        this.loadStats();
      },
      error: (err) => {
        this.runError.set(
          err?.error?.message ||
            'n8n not reachable. Start n8n first: npm run n8n',
        );
        this.runningWorkflow.set(null);
      },
    });
  }

  protected isRunning(id: string): boolean {
    return this.runningWorkflow() === id;
  }

  private loadStats(): void {
    this.n8n.checkConnection().subscribe((connected) => {
      this.n8n.getWorkflows().subscribe((workflows) => {
        this.n8n.getExecutions(50).subscribe((executions) => {
          const today = new Date().toDateString();
          const todayExecs = executions.filter(
            (e) => new Date(e.startedAt).toDateString() === today,
          );
          const successCount = executions.filter(
            (e) => e.status === 'success',
          ).length;
          const rate =
            executions.length > 0
              ? ((successCount / executions.length) * 100).toFixed(1)
              : '—';

          this.stats.set([
            {
              label: 'Active Workflows',
              value: String(workflows.filter((w) => w.active).length || WORKFLOW_USE_CASES.length),
              change: connected ? 'From n8n' : 'Offline (demo mode)',
              trend: connected ? 'up' : 'neutral',
            },
            {
              label: 'Executions Today',
              value: String(todayExecs.length),
              change: connected ? 'Live from n8n' : 'Start n8n to track',
              trend: todayExecs.length > 0 ? 'up' : 'neutral',
            },
            {
              label: 'Success Rate',
              value: rate === '—' ? '—' : `${rate}%`,
              change: executions.length > 0 ? `${executions.length} total` : 'No runs yet',
              trend: Number(rate) >= 90 ? 'up' : 'neutral',
            },
            {
              label: 'n8n Status',
              value: connected ? 'Online' : 'Offline',
              change: connected ? 'localhost:5678' : 'Run: npm run n8n',
              trend: connected ? 'up' : 'down',
            },
          ]);
        });
      });
    });
  }
}
