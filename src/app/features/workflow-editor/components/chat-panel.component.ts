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
      class="shrink-0 border-t border-[#D9E5E3] bg-white/95 transition-shadow"
      [class.ring-2]="highlight()"
      [class.ring-rose-500/60]="highlight()"
    >
      <div class="flex items-center justify-between gap-2 border-b border-[#D9E5E3]/80 px-3 py-2 sm:px-4">
        <div class="flex min-w-0 items-center gap-2">
          <span class="shrink-0 text-base">💬</span>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-[#1A1A1A]">Chat Trigger</p>
            <p class="hidden text-[11px] text-[#9A9A9A] sm:block">Message → run workflow → reply below</p>
          </div>
        </div>
        @if (running()) {
          <span class="animate-pulse text-xs text-[#2BBFBA]">Running...</span>
        }
      </div>

      <div class="max-h-36 min-h-[3.5rem] overflow-y-auto overscroll-contain px-3 py-2 sm:max-h-48 sm:px-4 sm:py-3">
        @if (messages().length === 0 && !running()) {
          <p class="text-center text-xs text-[#9A9A9A]">
            Type your first message and click Chat — the AI Agent reply will appear here
          </p>
        } @else {
          <div class="space-y-3">
            @for (msg of messages(); track msg.id) {
              <div [class]="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
                <div
                  [class]="
                    msg.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-md bg-[#2BBFBA] px-4 py-2 text-sm text-white'
                      : msg.role === 'error'
                        ? 'max-w-[85%] rounded-2xl rounded-bl-md border border-red-500/40 bg-red-50 px-4 py-2 text-sm text-red-600'
                        : 'max-w-[85%] rounded-2xl rounded-bl-md border border-[#CDDBD9] bg-[#F5FBFA] px-4 py-2 text-sm text-[#1A1A1A]'
                  "
                >
                  {{ msg.text }}
                </div>
              </div>
            }
            @if (running()) {
              <p class="text-xs text-[#9A9A9A] animate-pulse">Running workflow...</p>
            }
          </div>
        }
      </div>

      <div class="flex items-end gap-2 border-t border-[#D9E5E3] px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <textarea
          rows="2"
          class="min-h-[44px] flex-1 resize-none rounded-xl border border-[#CDDBD9] bg-[#F5FBFA] px-3 py-2.5 text-sm text-[#1A1A1A] outline-none placeholder:text-[#9A9A9A] focus:border-[#2BBFBA] sm:px-4"
          [ngModel]="inputText()"
          (ngModelChange)="inputTextChange.emit($event)"
          (keydown.enter)="$event.preventDefault(); send.emit()"
          [disabled]="running()"
          placeholder="Type your prompt..."
        ></textarea>
        <button
          type="button"
          class="shrink-0 rounded-xl bg-[#2BBFBA] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1FA8A3] disabled:opacity-50 sm:px-5"
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
