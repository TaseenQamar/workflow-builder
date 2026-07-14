import {
  Component,
  HostListener,
  inject,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WorkflowEditorStore } from './workflow-editor.store';
import { WorkflowChatService } from './workflow-chat.service';
import { NodePaletteComponent } from './components/node-palette.component';
import { WorkflowCanvasComponent } from './components/workflow-canvas.component';
import { PropertiesPanelComponent } from './components/properties-panel.component';
import { ChatPanelComponent } from './components/chat-panel.component';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-workflow-editor',
  imports: [
    NodePaletteComponent,
    WorkflowCanvasComponent,
    PropertiesPanelComponent,
    ChatPanelComponent,
    RouterLink,
  ],
  providers: [WorkflowEditorStore, WorkflowChatService],
  templateUrl: './workflow-editor.html',
})
export class WorkflowEditor implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(WorkflowEditorStore);
  private readonly chat = inject(WorkflowChatService);

  ngOnInit(): void {
    this.api.getAiIntegrationStatus().subscribe((status) => {
      if (status.defaultProvider) {
        this.store.setDefaultAiProvider(status.defaultProvider);
      }
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.api.getWorkflow(id).subscribe({
        next: (wf) => this.store.loadFromRecord(wf),
        error: () => this.store.error.set('Failed to load workflow'),
      });
      return;
    }

    this.store.ensureChatWorkflow();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.store.connectSourceId.set(null);
  }

  protected save(): void {
    this.store.saving.set(true);
    this.store.error.set(null);
    this.store.message.set(null);
    this.store.ensureConnections();

    const body = {
      name: this.store.workflowName(),
      description: this.store.description(),
      definition: this.store.toApiDefinition(),
      active: this.store.active(),
      executionMode: this.store.executionMode(),
    };

    const id = this.store.workflowId();
    const req = id
      ? this.api.updateWorkflow(id, body)
      : this.api.createWorkflow(body);

    req.subscribe({
      next: (wf) => {
        this.store.workflowId.set(wf.id);
        this.store.saving.set(false);
        this.store.message.set('Workflow saved!');
        if (!id) {
          this.router.navigate(['/workflow-editor', wf.id], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.store.saving.set(false);
        this.store.error.set(err?.error?.message ?? 'Save failed — is backend running on :3000?');
      },
    });
  }

  protected sendChat(): void {
    this.chat.run();
  }
}
