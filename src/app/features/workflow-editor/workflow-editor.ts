import {
  Component,
  HostListener,
  inject,
  OnInit,
  signal,
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
  host: {
    class: 'flex h-full min-h-0 flex-col overflow-hidden',
  },
})
export class WorkflowEditor implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(WorkflowEditorStore);
  private readonly chat = inject(WorkflowChatService);

  protected readonly showPalette = signal(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  protected readonly showProps = signal(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );

  ngOnInit(): void {
    this.syncPanelVisibility();
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

  @HostListener('window:resize')
  onResize(): void {
    this.syncPanelVisibility();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.store.connectSourceId.set(null);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.closePanels();
    }
  }

  private syncPanelVisibility(): void {
    if (typeof window === 'undefined') return;
    const desktop = window.innerWidth >= 1024;
    if (desktop) {
      this.showPalette.set(true);
      this.showProps.set(true);
    } else {
      this.showPalette.set(false);
      this.showProps.set(false);
    }
  }

  protected togglePalette(): void {
    const next = !this.showPalette();
    this.showPalette.set(next);
    if (next) this.showProps.set(false);
  }

  protected toggleProps(): void {
    const next = !this.showProps();
    this.showProps.set(next);
    if (next) this.showPalette.set(false);
  }

  protected closePanels(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.showPalette.set(false);
      this.showProps.set(false);
    }
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
        this.store.error.set(
          err?.error?.message ?? 'Save failed — is the backend running?',
        );
      },
    });
  }

  protected sendChat(): void {
    this.chat.run();
  }
}
