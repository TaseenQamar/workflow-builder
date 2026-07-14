import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
}

@Component({
  selector: 'app-chat-panel',
  imports: [FormsModule],
  template: `
    <div
      class="shrink-0 border-t border-[#EFE8E1] bg-white/95 transition-shadow"
      [class.ring-2]="highlight()"
      [class.ring-rose-500/60]="highlight()"
    >
      <div class="flex items-center justify-between border-b border-[#EFE8E1]/80 px-4 py-2">
        <div class="flex items-center gap-2">
          <span class="text-base">💬</span>
          <div>
            <p class="text-sm font-medium text-[#1A1A1A]">Chat Trigger — Prompt yahan likhein</p>
            <p class="text-[11px] text-[#9A9A9A]">n8n jaisa: message → workflow chalega → jawab neeche</p>
          </div>
        </div>
        @if (running()) {
          <span class="animate-pulse text-xs text-[#F06225]">Running...</span>
        }
      </div>

      <div class="max-h-48 min-h-[4rem] overflow-y-auto px-4 py-3">
        @if (messages().length === 0 && !running()) {
          <p class="text-center text-xs text-[#9A9A9A]">
            Pehla message likhein aur Chat dabayein — AI Agent se jawab yahan aayega
          </p>
        } @else {
          <div class="space-y-3">
            @for (msg of messages(); track msg.id) {
              <div [class]="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
                <div
                  [class]="
                    msg.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-md bg-[#F06225] px-4 py-2 text-sm text-white'
                      : msg.role === 'error'
                        ? 'max-w-[85%] rounded-2xl rounded-bl-md border border-red-500/40 bg-red-50 px-4 py-2 text-sm text-red-600'
                        : 'max-w-[85%] rounded-2xl rounded-bl-md border border-[#E5DDD4] bg-[#FFF8F4] px-4 py-2 text-sm text-[#1A1A1A]'
                  "
                >
                  {{ msg.text }}
                </div>
              </div>
            }
            @if (running()) {
              <p class="text-xs text-[#9A9A9A] animate-pulse">Workflow execute ho raha hai...</p>
            }
          </div>
        }
      </div>

      <div class="flex items-end gap-3 border-t border-[#EFE8E1] px-4 py-3">
        <textarea
          rows="2"
          class="min-h-[44px] flex-1 resize-none rounded-xl border border-[#E5DDD4] bg-[#FFF8F4] px-4 py-2.5 text-sm text-[#1A1A1A] outline-none placeholder:text-[#9A9A9A] focus:border-[#F06225]"
          [ngModel]="inputText()"
          (ngModelChange)="inputTextChange.emit($event)"
          (keydown.enter)="$event.preventDefault(); send.emit()"
          [disabled]="running()"
          placeholder="Apna prompt / message likhein..."
        ></textarea>
        <button
          type="button"
          class="shrink-0 rounded-xl bg-[#F06225] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#E5551A] disabled:opacity-50"
          [disabled]="running() || !inputText().trim()"
          (click)="send.emit()"
        >
          {{ running() ? '...' : 'Chat' }}
        </button>
      </div>
    </div>
  `,
})
export class ChatPanelComponent {
  readonly messages = input<ChatMessage[]>([]);
  readonly running = input(false);
  readonly inputText = input('');
  readonly highlight = input(false);

  readonly inputTextChange = output<string>();
  readonly send = output<void>();
}
