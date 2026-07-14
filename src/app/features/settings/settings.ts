import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { timeout, catchError, of, finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BackendStatusService } from '../../core/services/backend-status.service';
import { AiIntegrationStatus } from '../../core/models/workflow.models';
import {
  readStoredAiProvider,
  storeAiProvider,
} from '../../core/constants/node-definitions';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.html',
})
export class Settings implements OnInit {
  protected readonly api = inject(ApiService);
  private readonly backendStatus = inject(BackendStatusService);

  protected readonly backendOnline = this.backendStatus.online;
  protected readonly backendHint = this.backendStatus.lastError;
  protected readonly checkingBackend = this.backendStatus.checking;
  protected readonly n8nHealth = signal({ connected: false, api: false, webhook: false });
  protected readonly aiStatus = signal<AiIntegrationStatus>({
    openai: { configured: false, source: 'none' },
    gemini: { configured: false, source: 'none' },
    defaultProvider: readStoredAiProvider(),
    demoMode: true,
    message: '',
  });

  protected openaiKey = '';
  protected geminiKey = '';
  protected backendUrl = '';
  protected savingOpenai = false;
  protected savingGemini = false;
  protected savingProvider = false;
  protected saveMessage = signal<string | null>(null);
  protected saveError = signal<string | null>(null);

  ngOnInit(): void {
    this.backendUrl = this.api.apiOrigin || this.api.apiBase || '';
    this.refreshStatus();
  }

  protected saveBackendUrl(): void {
    const url = this.backendUrl.trim();
    if (!url) {
      this.saveError.set('Enter a backend URL — e.g. https://your-api.onrender.com');
      return;
    }
    this.api.setApiBase(url);
    this.backendUrl = this.api.apiOrigin;
    this.saveMessage.set(`Backend URL saved: ${this.api.apiBase}`);
    this.saveError.set(null);
    this.refreshStatus();
  }

  protected refreshStatus(): void {
    this.backendStatus.refresh();
    this.api.getN8nHealth().subscribe((h) => this.n8nHealth.set(h));
    this.api.getAiIntegrationStatus().subscribe((s) => {
      const offlineFallback =
        s.message === 'Backend offline' ||
        !!s.message?.includes('Backend API URL not set');
      if (offlineFallback) {
        this.aiStatus.set({
          ...s,
          defaultProvider: readStoredAiProvider(),
        });
        return;
      }
      this.aiStatus.set(s);
      if (s.defaultProvider) {
        storeAiProvider(s.defaultProvider);
      }
    });
  }

  protected selectProvider(provider: 'openai' | 'gemini'): void {
    if (this.savingProvider) return;

    // Optimistic UI — select immediately so the button never feels broken
    storeAiProvider(provider);
    this.aiStatus.update((s) => ({
      ...s,
      defaultProvider: provider,
      message:
        provider === 'gemini'
          ? 'Active: Google Gemini — chat will use this provider'
          : 'Active: OpenAI — chat will use this provider',
    }));
    this.saveMessage.set(null);
    this.saveError.set(null);
    this.savingProvider = true;

    this.api
      .setDefaultAiProvider(provider)
      .pipe(
        timeout(8000),
        catchError(() =>
          of({ defaultProvider: provider, saved: false as boolean }),
        ),
        finalize(() => {
          this.savingProvider = false;
        }),
      )
      .subscribe((res) => {
        storeAiProvider(provider);
        const label = provider === 'gemini' ? 'Google Gemini' : 'OpenAI';
        if (res.saved) {
          this.saveMessage.set(`${label} selected — chat will use this provider`);
          this.refreshStatus();
        } else {
          this.saveMessage.set(
            `${label} selected on this device. Backend sync failed — check Backend API URL / connection.`,
          );
        }
      });
  }

  protected saveOpenaiKey(): void {
    if (!this.openaiKey.trim()) return;
    this.savingOpenai = true;
    this.saveMessage.set(null);
    this.saveError.set(null);
    this.api.saveApiKey('OPENAI', this.openaiKey.trim()).subscribe({
      next: (res) => {
        this.savingOpenai = false;
        this.openaiKey = '';
        const storage = (res as { storage?: string })?.storage ?? 'saved';
        this.saveMessage.set(`OpenAI key saved (${storage}). Check the green badge above.`);
        this.refreshStatus();
      },
      error: (err) => {
        this.savingOpenai = false;
        this.saveError.set(
          err?.error?.message ??
            'Save failed — is the backend running on http://localhost:3000?',
        );
      },
    });
  }

  protected saveGeminiKey(): void {
    if (!this.geminiKey.trim()) return;
    this.savingGemini = true;
    this.saveMessage.set(null);
    this.saveError.set(null);
    this.api.saveApiKey('GEMINI', this.geminiKey.trim()).subscribe({
      next: (res) => {
        this.savingGemini = false;
        this.geminiKey = '';
        const storage = (res as { storage?: string })?.storage ?? 'saved';
        this.saveMessage.set(`Gemini key saved (${storage}). Check the green badge above.`);
        this.refreshStatus();
      },
      error: (err) => {
        this.savingGemini = false;
        this.saveError.set(err?.error?.message ?? 'Failed to save key');
      },
    });
  }

  protected sourceLabel(source: string): string {
    if (source === 'local-file') return 'local file';
    if (source === 'env') return '.env';
    if (source === 'database') return 'database';
    return source;
  }

  protected isActiveProvider(provider: 'openai' | 'gemini'): boolean {
    return (this.aiStatus().defaultProvider ?? readStoredAiProvider()) === provider;
  }
}
