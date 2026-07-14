import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AiIntegrationStatus } from '../../core/models/workflow.models';
import { storeAiProvider } from '../../core/constants/node-definitions';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.html',
})
export class Settings implements OnInit {
  protected readonly api = inject(ApiService);

  protected readonly backendOnline = signal(false);
  protected readonly n8nHealth = signal({ connected: false, api: false, webhook: false });
  protected readonly aiStatus = signal<AiIntegrationStatus>({
    openai: { configured: false, source: 'none' },
    gemini: { configured: false, source: 'none' },
    defaultProvider: 'openai',
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
    this.api.checkBackendHealth().subscribe((ok) => this.backendOnline.set(ok));
    this.api.getN8nHealth().subscribe((h) => this.n8nHealth.set(h));
    this.api.getAiIntegrationStatus().subscribe((s) => {
      this.aiStatus.set(s);
      if (s.defaultProvider) {
        storeAiProvider(s.defaultProvider);
      }
    });
  }

  protected selectProvider(provider: 'openai' | 'gemini'): void {
    if (this.aiStatus().defaultProvider === provider || this.savingProvider) return;

    this.savingProvider = true;
    this.saveMessage.set(null);
    this.saveError.set(null);

    this.api.setDefaultAiProvider(provider).subscribe({
      next: () => {
        this.savingProvider = false;
        storeAiProvider(provider);
        const label = provider === 'gemini' ? 'Google Gemini' : 'OpenAI';
        this.saveMessage.set(`${label} selected — chat/search will use this provider`);
        this.refreshStatus();
      },
      error: () => {
        this.savingProvider = false;
        storeAiProvider(provider);
        this.aiStatus.update((s) => ({ ...s, defaultProvider: provider }));
        this.saveMessage.set(
          provider === 'gemini'
            ? 'Gemini selected (local). Will sync when the backend is online'
            : 'OpenAI selected (local). Will sync when the backend is online',
        );
      },
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
    return (this.aiStatus().defaultProvider ?? 'openai') === provider;
  }
}
