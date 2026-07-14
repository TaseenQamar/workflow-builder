import {
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
  private readonly router = inject(Router);

  protected readonly appName = signal('Cluster Valley');
  protected readonly sidebarOpen = signal(false);
  protected readonly isDesktop = signal(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );

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

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (!this.isDesktop()) {
          this.sidebarOpen.set(false);
        }
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    const desktop = window.innerWidth >= 1024;
    this.isDesktop.set(desktop);
    if (desktop) {
      this.sidebarOpen.set(false);
    }
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }
}
