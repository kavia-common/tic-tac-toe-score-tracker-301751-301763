import { Injectable, signal } from '@angular/core';

export type ToastKind = 'info' | 'error' | 'success';

export interface ToastMessage {
  kind: ToastKind;
  text: string;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toast = signal<ToastMessage | null>(null);

  /**
   * PUBLIC_INTERFACE
   * Show a toast message.
   */
  show(kind: ToastKind, text: string): void {
    this.toast.set({ kind, text, createdAt: Date.now() });

    // Auto-hide after 4s
    setTimeout(() => {
      const current = this.toast();
      if (current && current.text === text) this.toast.set(null);
    }, 4000);
  }

  /**
   * PUBLIC_INTERFACE
   * Hide current toast.
   */
  clear(): void {
    this.toast.set(null);
  }
}
