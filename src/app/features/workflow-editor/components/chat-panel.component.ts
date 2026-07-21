import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** Display stamp like `10/07 2:37 PM` */
  at?: string;
}

export interface ChatThreadOption {
  id: string;
  title: string;
  updatedAt?: string;
  preview?: string;
  messageCount?: number;
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
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9E5E3]/80 px-3 py-2 sm:px-4">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="shrink-0 text-base">💬</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-[#1A1A1A]">Chat</p>
            <select
              class="mt-0.5 w-full max-w-xs truncate rounded border border-[#CDDBD9] bg-[#F5FBFA] px-1.5 py-0.5 text-[11px] text-[#4A4A4A] outline-none focus:border-[#2BBFBA]"
              [ngModel]="activeChatId() ?? ''"
              (ngModelChange)="onThreadPick($event)"
            >
              @if (!threads().length) {
                <option value="">{{ chatTitle() || 'New chat' }}</option>
              }
              @for (t of threads(); track t.id) {
                <option [value]="t.id">
                  {{ t.title || 'Chat' }}{{ t.messageCount ? ' (' + t.messageCount + ')' : '' }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          @if (running()) {
            <span class="animate-pulse text-xs text-[#2BBFBA]">Running...</span>
          }
          <button
            type="button"
            class="rounded-lg border border-[#CDDBD9] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4A4A4A] hover:border-[#2BBFBA] hover:text-[#17807C] disabled:opacity-50"
            [disabled]="running()"
            (click)="newChat.emit()"
            title="Start a new chat (keeps old chats saved)"
          >
            New chat
          </button>
          <button
            type="button"
            class="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            [disabled]="running() || !activeChatId()"
            (click)="deleteChat.emit()"
            title="Delete this chat permanently"
          >
            Delete
          </button>
        </div>
      </div>

      <div class="max-h-52 min-h-[3.5rem] overflow-y-auto overscroll-contain px-3 py-2 sm:max-h-64 sm:px-4 sm:py-3">
        @if (messages().length === 0 && !running()) {
          <p class="text-center text-xs text-[#9A9A9A]">
            Messages auto-save with this workflow. Use New chat / Delete for history.
          </p>
        } @else {
          <div class="space-y-3">
            @for (msg of messages(); track msg.id) {
              <div [class]="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
                <div class="max-w-[90%] sm:max-w-[85%]">
                  <div
                    class="mb-0.5 flex items-center gap-1.5 px-1"
                    [class]="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                  >
                    <span class="text-[11px] font-semibold text-[#4A4A4A]">
                      {{
                        msg.role === 'user'
                          ? 'You'
                          : msg.role === 'error'
                            ? 'Error'
                            : 'Cluster Valley'
                      }}
                    </span>
                    @if (msg.at) {
                      <span class="text-[10px] tabular-nums text-[#9A9A9A]">{{ msg.at }}</span>
                    }
                  </div>
                  <div
                    class="whitespace-pre-wrap break-words"
                    [class]="
                      msg.role === 'user'
                        ? 'rounded-2xl rounded-br-md bg-[#2BBFBA] px-4 py-2 text-sm text-white'
                        : msg.role === 'error'
                          ? 'rounded-2xl rounded-bl-md border border-red-500/40 bg-red-50 px-4 py-2 text-sm text-red-600'
                          : 'rounded-2xl rounded-bl-md border border-[#CDDBD9] bg-[#F5FBFA] px-4 py-2 text-sm text-[#1A1A1A]'
                    "
                  >
                    {{ msg.text }}
                  </div>
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
  readonly threads = input<ChatThreadOption[]>([]);
  readonly activeChatId = input<string | null>(null);
  readonly chatTitle = input('New chat');

  readonly inputTextChange = output<string>();
  readonly send = output<void>();
  readonly newChat = output<void>();
  readonly deleteChat = output<void>();
  readonly selectChat = output<string>();

  protected onThreadPick(id: string): void {
    if (!id || id === this.activeChatId()) return;
    this.selectChat.emit(id);
  }
}
