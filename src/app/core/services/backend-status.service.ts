import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, startWith, switchMap, catchError, of } from 'rxjs';
import { ApiService } from './api.service';

/**
 * Shared backend online status.
 * Re-checks after laptop sleep/wake (visibility/focus/online) and on a short poll.
 */
@Injectable({ providedIn: 'root' })
export class BackendStatusService {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly online = signal(false);
  readonly checking = signal(false);
  readonly lastCheckedAt = signal<Date | null>(null);
  readonly lastError = signal<string | null>(null);

  constructor() {
    this.startPolling();
    this.bindWakeListeners();
  }

  /** Force an immediate health check (Settings “Refresh”, etc.). */
  refresh(): void {
    this.checking.set(true);
    this.api.checkBackendHealth().subscribe((ok) => {
      this.applyResult(ok);
      this.checking.set(false);
    });
  }

  private startPolling(): void {
    interval(20_000)
      .pipe(
        startWith(0),
        switchMap(() => {
          this.checking.set(true);
          return this.api.checkBackendHealth().pipe(catchError(() => of(false)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((ok) => {
        this.applyResult(ok);
        this.checking.set(false);
      });
  }

  private bindWakeListeners(): void {
    if (typeof window === 'undefined') return;

    const onWake = () => {
      // Laptop often reports online a moment after wake — brief delay helps.
      window.setTimeout(() => this.refresh(), 400);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') onWake();
    };

    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onVisibility);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  private applyResult(ok: boolean): void {
    this.online.set(ok);
    this.lastCheckedAt.set(new Date());
    if (ok) {
      this.lastError.set(null);
      return;
    }
    const base = this.api.apiBase;
    const origin = this.api.apiOrigin;
    if (!origin) {
      if (base.startsWith('/')) {
        this.lastError.set(
          'Local backend unreachable — run: cd workflow-build-backend && npm run start:dev',
        );
      } else {
        this.lastError.set(
          'Backend API URL not set. Open Settings and paste your tunnel/backend URL.',
        );
      }
    } else if (origin.includes('trycloudflare.com') || origin.includes('loca.lt')) {
      this.lastError.set(
        'Tunnel unreachable from this browser (often local DNS). 1) Open the tunnel /health URL in a new tab — must show status ok. 2) If it fails to load, set Mac DNS to 1.1.1.1 + 8.8.8.8, flush DNS, then re-open Vercel with the NEW ?api= URL from npm run wake (old trycloudflare links die after restart).',
      );
    } else {
      this.lastError.set(
        'Backend unreachable. On this Mac run: brew services start postgresql@16 redis && npm run start:dev',
      );
    }
  }
}
