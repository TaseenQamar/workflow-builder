import { Component, signal } from '@angular/core';

interface NodeCategory {
  name: string;
  nodes: { name: string; description: string; icon: string }[];
}

@Component({
  selector: 'app-node-library',
  imports: [],
  templateUrl: './node-library.html',
  styleUrl: './node-library.scss',
})
export class NodeLibrary {
  protected readonly categories = signal<NodeCategory[]>([
    {
      name: 'Triggers',
      nodes: [
        { name: 'Webhook', description: 'Start on HTTP request', icon: '🔗' },
        { name: 'Schedule', description: 'Run on cron schedule', icon: '⏰' },
        { name: 'New Ticket', description: 'Support ticket created', icon: '🎫' },
        { name: 'New Order', description: 'E-commerce order placed', icon: '🛒' },
      ],
    },
    {
      name: 'Actions',
      nodes: [
        { name: 'Send Email', description: 'Send via SMTP or API', icon: '✉' },
        { name: 'Slack', description: 'Post channel message', icon: '💬' },
        { name: 'HTTP Request', description: 'Call any REST API', icon: '🌐' },
        { name: 'Database', description: 'Query or update records', icon: '🗄' },
      ],
    },
    {
      name: 'AI',
      nodes: [
        { name: 'AI Summarize', description: 'Summarize text content', icon: '✦' },
        { name: 'AI Categorize', description: 'Classify into categories', icon: '🏷' },
        { name: 'AI Generate', description: 'Generate blog or copy', icon: '✍' },
        { name: 'SEO Check', description: 'Analyze content for SEO', icon: '🔍' },
      ],
    },
    {
      name: 'Logic',
      nodes: [
        { name: 'Condition', description: 'Branch on if/else rules', icon: '◇' },
        { name: 'Switch', description: 'Multi-path routing', icon: '⑂' },
        { name: 'Merge', description: 'Combine parallel branches', icon: '⊕' },
        { name: 'Delay', description: 'Wait before next step', icon: '⏳' },
      ],
    },
  ]);
}
