import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService, type LeaderboardRow } from '../../services/supabase.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.css',
})
export class LeaderboardComponent {
  readonly loading = signal<boolean>(true);
  readonly rows = signal<LeaderboardRow[]>([]);

  readonly hasData = computed(() => this.rows().length > 0);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly toast: ToastService,
  ) {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const data = await this.supabase.getLeaderboard();
      this.rows.set(data);
    } catch (e) {
      this.rows.set([]);
      const msg = e instanceof Error ? e.message : 'Failed to load leaderboard.';
      this.toast.show('error', msg);
    } finally {
      this.loading.set(false);
    }
  }

  trackByUsername(_: number, row: LeaderboardRow): string {
    return row.username;
  }
}
