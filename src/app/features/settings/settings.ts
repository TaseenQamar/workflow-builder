import { Component, inject, OnInit, signal } from '@angular/core';
import { N8nService } from '../../core/services/n8n.service';
import { environment } from '../../../environments/environment';

interface Integration {
  name: string;
  description: string;
  connected: boolean;
  icon: string;
}

@Component({
  selector: 'app-settings',
  imports: [],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly n8n = inject(N8nService);

  protected readonly n8nConnected = signal(false);
  protected readonly n8nApiUrl = environment.n8nApiUrl;

  protected readonly integrations = signal<Integration[]>([
    {
      name: 'n8n',
      description: 'Workflow automation engine (localhost:5678)',
      connected: false,
      icon: '⚙️',
    },
    {
      name: 'Slack',
      description: 'Send notifications to channels',
      connected: false,
      icon: '💬',
    },
    {
      name: 'OpenAI',
      description: 'AI summarize, generate, and categorize',
      connected: false,
      icon: '✦',
    },
    {
      name: 'SendGrid',
      description: 'Transactional email delivery',
      connected: false,
      icon: '✉',
    },
  ]);

  ngOnInit(): void {
    this.n8n.checkConnection().subscribe((connected) => {
      this.n8nConnected.set(connected);
      this.integrations.update((list) =>
        list.map((item) =>
          item.name === 'n8n' ? { ...item, connected } : item,
        ),
      );
    });
  }
}
