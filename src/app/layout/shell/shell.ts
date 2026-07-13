import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly appName = signal('Workflow Builder');
  protected readonly navItems = signal<NavItem[]>([
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: '◫',
      description: 'Overview & metrics',
    },
    {
      label: 'Workflow Editor',
      path: '/workflow-editor',
      icon: '⎔',
      description: 'Visual automation canvas',
    },
    {
      label: 'Node Library',
      path: '/node-library',
      icon: '▣',
      description: 'Triggers, actions & AI nodes',
    },
    {
      label: 'Executions',
      path: '/executions',
      icon: '▶',
      description: 'Run history & logs',
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: '⚙',
      description: 'Integrations & preferences',
    },
  ]);
}
