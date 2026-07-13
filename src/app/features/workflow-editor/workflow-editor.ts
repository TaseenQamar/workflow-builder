import { Component, signal } from '@angular/core';

interface WorkflowNode {
  id: string;
  label: string;
  type: 'trigger' | 'action' | 'condition' | 'ai';
  icon: string;
}

@Component({
  selector: 'app-workflow-editor',
  imports: [],
  templateUrl: './workflow-editor.html',
  styleUrl: './workflow-editor.scss',
})
export class WorkflowEditor {
  protected readonly workflowName = signal('Customer Onboarding Flow');
  protected readonly nodes = signal<WorkflowNode[]>([
    { id: '1', label: 'Trigger', type: 'trigger', icon: '⚡' },
    { id: '2', label: 'Get Customer Data', type: 'action', icon: '👤' },
    { id: '3', label: 'AI Summarize', type: 'ai', icon: '✦' },
    { id: '4', label: 'Condition', type: 'condition', icon: '◇' },
    { id: '5', label: 'Send Email', type: 'action', icon: '✉' },
    { id: '6', label: 'Slack Notification', type: 'action', icon: '💬' },
  ]);

  protected nodeColor(type: WorkflowNode['type']): string {
    const colors: Record<WorkflowNode['type'], string> = {
      trigger: 'border-amber-500/50 bg-amber-500/10',
      action: 'border-slate-600 bg-slate-800',
      condition: 'border-cyan-500/50 bg-cyan-500/10',
      ai: 'border-violet-500/50 bg-violet-500/10',
    };
    return colors[type];
  }
}
