import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { timeout, catchError, of, finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BackendStatusService } from '../../core/services/backend-status.service';
import {
  AiIntegrationStatus,
  AiProviderStatus,
} from '../../core/models/workflow.models';
import {
  AiProviderChoice,
  getLlmPreset,
  LLM_PROVIDER_PRESETS,
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
    groq: { configured: false, source: 'none' },
    openrouter: { configured: false, source: 'none' },
    ollama: { configured: false, source: 'none' },
    custom: { configured: false, source: 'none' },
    defaultProvider: readStoredAiProvider(),
    demoMode: true,
    message: '',
  });

  protected readonly presets = LLM_PROVIDER_PRESETS;
  protected readonly configureProvider = signal<AiProviderChoice>(
    readStoredAiProvider(),
  );

  protected endpointKey = '';
  protected endpointBaseUrl = '';
  protected endpointModel = '';
  protected backendUrl = '';

  protected emailMode: 'sendgrid' | 'smtp' = 'sendgrid';
  protected emailFrom = '';
  protected emailFromName = 'Cluster Valley';
  protected sendgridApiKey = '';
  protected smtpHost = 'smtp.gmail.com';
  protected smtpPort = '587';
  protected smtpUser = '';
  protected smtpPass = '';
  protected emailTestTo = '';
  protected savingEmail = false;
  protected testingEmail = false;
  protected readonly emailStatus = signal<{
    configured: boolean;
    mode: 'sendgrid' | 'smtp' | null;
    fromEmail: string | null;
    source: string;
    message: string;
  }>({
    configured: false,
    mode: null,
    fromEmail: null,
    source: 'none',
    message: '',
  });
  protected savingEndpoint = false;
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
    this.api.getEmailStatus().subscribe((s) => {
      this.emailStatus.set(s);
      if (s.mode) this.emailMode = s.mode;
      if (s.fromEmail) this.emailFrom = s.fromEmail;
    });
    this.api.getAiIntegrationStatus().subscribe((s) => {
      const offlineFallback =
        s.message === 'Backend offline' ||
        !!s.message?.includes('Backend API URL not set');
      if (offlineFallback) {
        this.aiStatus.set({
          ...s,
          defaultProvider: readStoredAiProvider(),
        });
        this.loadEndpointForm(this.configureProvider());
        return;
      }
      this.aiStatus.set(s);
      if (s.defaultProvider) {
        storeAiProvider(s.defaultProvider);
        this.configureProvider.set(s.defaultProvider);
      }
      this.loadEndpointForm(this.configureProvider());
    });
  }

  protected providerStatus(id: AiProviderChoice): AiProviderStatus {
    const s = this.aiStatus();
    return (
      s.providers?.[id] ??
      s[id] ?? { configured: false, source: 'none' }
    );
  }

  protected selectConfigure(provider: AiProviderChoice): void {
    this.configureProvider.set(provider);
    this.loadEndpointForm(provider);
  }

  protected loadEndpointForm(provider: AiProviderChoice): void {
    const preset = getLlmPreset(provider);
    const status = this.providerStatus(provider);
    this.endpointKey = '';
    this.endpointBaseUrl = status.baseUrl || preset.defaultBaseUrl;
    this.endpointModel = status.defaultModel || preset.defaultModel;
  }

  protected selectProvider(provider: AiProviderChoice): void {
    if (this.savingProvider) return;

    storeAiProvider(provider);
    this.aiStatus.update((s) => ({
      ...s,
      defaultProvider: provider,
      message: `Active: ${getLlmPreset(provider).label} — chat will use this provider`,
    }));
    this.configureProvider.set(provider);
    this.loadEndpointForm(provider);
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
        const label = getLlmPreset(provider).label;
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

  protected saveEndpoint(): void {
    const provider = this.configureProvider();
    const preset = getLlmPreset(provider);
    const body: {
      provider: AiProviderChoice;
      apiKey?: string;
      baseUrl?: string;
      defaultModel?: string;
    } = { provider };

    if (this.endpointKey.trim()) body.apiKey = this.endpointKey.trim();
    if (provider !== 'gemini') {
      body.baseUrl = this.endpointBaseUrl.trim() || preset.defaultBaseUrl;
    }
    if (this.endpointModel.trim()) {
      body.defaultModel = this.endpointModel.trim();
    }

    if (preset.needsKey && !this.endpointKey.trim() && !this.providerStatus(provider).configured) {
      this.saveError.set(`Paste an API key for ${preset.label}`);
      return;
    }
    if (provider === 'custom' && !body.baseUrl) {
      this.saveError.set('Enter a Custom API base URL (OpenAI-compatible)');
      return;
    }

    this.savingEndpoint = true;
    this.saveMessage.set(null);
    this.saveError.set(null);
    this.api.saveLlmEndpoint(body).subscribe({
      next: () => {
        this.savingEndpoint = false;
        this.endpointKey = '';
        this.saveMessage.set(`${preset.label} config saved — now active`);
        storeAiProvider(provider);
        this.api.setDefaultAiProvider(provider).subscribe({
          next: () => this.refreshStatus(),
          error: () => this.refreshStatus(),
        });
      },
      error: (err) => {
        this.savingEndpoint = false;
        this.saveError.set(
          err?.error?.message ??
            'Save failed — is the backend running?',
        );
      },
    });
  }

  protected sourceLabel(source: string): string {
    if (source === 'local-file') return 'local file';
    if (source === 'env') return '.env';
    if (source === 'database') return 'database';
    return source;
  }

  protected isActiveProvider(provider: AiProviderChoice): boolean {
    return (this.aiStatus().defaultProvider ?? readStoredAiProvider()) === provider;
  }

  protected modelOptions(provider: AiProviderChoice): string[] {
    return getLlmPreset(provider).models;
  }

  protected needsBaseUrl(provider: AiProviderChoice): boolean {
    return provider !== 'gemini';
  }

  protected saveEmailCredentials(): void {
    this.savingEmail = true;
    this.saveMessage.set(null);
    this.saveError.set(null);
    const body =
      this.emailMode === 'sendgrid'
        ? {
            mode: 'sendgrid' as const,
            sendgridApiKey: this.sendgridApiKey.trim(),
            fromEmail: this.emailFrom.trim(),
            fromName: this.emailFromName.trim() || 'Cluster Valley',
          }
        : {
            mode: 'smtp' as const,
            smtpHost: this.smtpHost.trim(),
            smtpPort: Number(this.smtpPort) || 587,
            smtpUser: this.smtpUser.trim(),
            smtpPass: this.smtpPass.trim(),
            fromEmail: this.emailFrom.trim() || this.smtpUser.trim(),
            fromName: this.emailFromName.trim() || 'Cluster Valley',
          };

    this.api.saveEmailCredentials(body).subscribe({
      next: (res) => {
        this.savingEmail = false;
        if (res.saved) {
          this.sendgridApiKey = '';
          this.smtpPass = '';
          this.saveMessage.set(res.message ?? 'Outbound email saved');
          this.refreshStatus();
        } else {
          this.saveError.set(res.message ?? 'Failed to save email config');
        }
      },
      error: (err) => {
        this.savingEmail = false;
        this.saveError.set(
          err?.error?.message ?? 'Save failed — is the backend running?',
        );
      },
    });
  }

  protected testPlatformEmail(): void {
    const to = this.emailTestTo.trim();
    if (!to.includes('@')) {
      this.saveError.set('Enter a valid test email address');
      return;
    }
    this.testingEmail = true;
    this.saveMessage.set(null);
    this.saveError.set(null);
    this.api.testPlatformEmail(to).subscribe({
      next: (res) => {
        this.testingEmail = false;
        if (res.ok) {
          this.saveMessage.set(res.message ?? `Test sent to ${to}`);
        } else {
          this.saveError.set(res.message ?? 'Test email failed');
        }
      },
      error: (err) => {
        this.testingEmail = false;
        this.saveError.set(err?.error?.message ?? 'Test failed');
      },
    });
  }
}
