import { Routes } from '@angular/router';
import { Shell } from './layout/shell/shell';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'workflow-editor',
        loadComponent: () =>
          import('./features/workflow-editor/workflow-editor').then(
            (m) => m.WorkflowEditor,
          ),
      },
      {
        path: 'node-library',
        loadComponent: () =>
          import('./features/node-library/node-library').then(
            (m) => m.NodeLibrary,
          ),
      },
      {
        path: 'executions',
        loadComponent: () =>
          import('./features/executions/executions').then((m) => m.Executions),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
