import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NODE_CATALOG } from '../../core/constants/node-definitions';

@Component({
  selector: 'app-node-library',
  imports: [RouterLink],
  templateUrl: './node-library.html',
})
export class NodeLibrary {
  protected readonly grouped = [
    'Triggers',
    'Actions',
    'AI',
    'Logic',
    'Integrations',
  ].map((name) => ({
    name,
    nodes: NODE_CATALOG.filter((n) => n.category === name),
  }));
}
