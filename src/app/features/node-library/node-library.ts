import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  NODE_CATALOG,
  NODE_CATEGORIES,
  NodeDefinition,
} from '../../core/constants/node-definitions';

@Component({
  selector: 'app-node-library',
  imports: [RouterLink, FormsModule],
  templateUrl: './node-library.html',
})
export class NodeLibrary {
  protected readonly search = signal('');
  protected readonly activeCategory = signal<string>('All');

  protected readonly categories = ['All', ...NODE_CATEGORIES];
  protected readonly totalCount = NODE_CATALOG.length;

  protected readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.activeCategory();
    return NODE_CATALOG.filter((n) => {
      const catOk = cat === 'All' || n.category === cat;
      if (!catOk) return false;
      if (!q) return true;
      return (
        n.label.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q)
      );
    });
  });

  protected readonly grouped = computed(() => {
    const nodes = this.filtered();
    return NODE_CATEGORIES.map((name) => ({
      name,
      nodes: nodes.filter((n) => n.category === name),
    })).filter((g) => g.nodes.length > 0);
  });

  protected setCategory(cat: string): void {
    this.activeCategory.set(cat);
  }

  protected editorLink(node: NodeDefinition): string[] {
    return ['/workflow-editor'];
  }

  protected editorQuery(node: NodeDefinition): Record<string, string> {
    return { add: node.type };
  }
}
