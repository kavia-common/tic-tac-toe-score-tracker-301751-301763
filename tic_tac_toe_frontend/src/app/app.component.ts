import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  protected readonly toast = computed(() => this.toastService.toast());

  protected readonly toastClass = computed(() => {
    const t = this.toast();
    if (!t) return '';
    if (t.kind === 'success') return 'toast toast-success';
    if (t.kind === 'error') return 'toast toast-error';
    return 'toast toast-info';
  });

  constructor(public readonly toastService: ToastService) {}
}
