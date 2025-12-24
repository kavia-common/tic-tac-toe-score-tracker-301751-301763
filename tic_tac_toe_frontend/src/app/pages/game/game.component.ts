import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HAS_SUPABASE } from '../../env';
import { SupabaseService } from '../../services/supabase.service';
import { ToastService } from '../../services/toast.service';

type Player = 'X' | 'O';
type Cell = Player | null;

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css',
})
export class GameComponent {
  username = '';
  aiEnabled = true;

  // Expose env flag to template; no stale service-based "configured" guards.
  protected readonly hasSupabase = HAS_SUPABASE;

  private readonly board = signal<Cell[]>(Array.from({ length: 9 }, () => null));
  private readonly currentPlayer = signal<Player>('X');
  private readonly gameOver = signal<boolean>(false);

  // Inline validation: only when attempting to save without username (and Supabase exists).
  protected readonly usernameRequiredToSave = signal<boolean>(false);

  readonly statusText = computed(() => {
    const winner = this.getWinner(this.board());
    if (winner) return `${winner} wins!`;
    if (this.gameOver()) return `It's a draw.`;
    return `${this.currentPlayer()}'s turn`;
  });

  // Gameplay is always allowed; username only affects saving.
  readonly canPlay = computed(() => true);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly toast: ToastService,
  ) {}

  onUsernameBlur(): void {
    // Clear inline validation once user provides anything.
    if (this.username.trim().length > 0) this.usernameRequiredToSave.set(false);
  }

  makeMove(index: number): void {
    if (this.gameOver()) return;

    const b = this.board().slice();
    if (b[index] !== null) return;

    b[index] = this.currentPlayer();
    this.board.set(b);

    const winner = this.getWinner(b);
    if (winner) {
      void this.endGame(this.scoreForWinner(winner));
      return;
    }
    if (this.isDraw(b)) {
      void this.endGame(0.5);
      return;
    }

    // Toggle player
    this.currentPlayer.set(this.currentPlayer() === 'X' ? 'O' : 'X');

    // AI move: only for O (simple random move)
    if (this.aiEnabled && this.currentPlayer() === 'O') {
      setTimeout(() => this.aiMove(), 250);
    }
  }

  reset(): void {
    this.board.set(Array.from({ length: 9 }, () => null));
    this.currentPlayer.set('X');
    this.gameOver.set(false);
    this.usernameRequiredToSave.set(false);
  }

  getCell(index: number): Cell {
    return this.board()[index];
  }

  private aiMove(): void {
    if (this.gameOver()) return;

    const b = this.board().slice();
    const open: number[] = [];
    for (let i = 0; i < b.length; i++) if (b[i] === null) open.push(i);
    if (open.length === 0) return;

    const choice = open[Math.floor(Math.random() * open.length)];
    this.makeMove(choice);
  }

  private async endGame(score: number): Promise<void> {
    this.gameOver.set(true);

    // If Supabase env is present, require username to save; otherwise silently skip saving.
    if (this.hasSupabase && this.username.trim().length === 0) {
      this.usernameRequiredToSave.set(true);
      this.toast.show('info', 'Add a username to save your score.');
      return;
    }

    // If not configured, do not show global "not configured" warning — just skip saving.
    if (!this.hasSupabase) return;

    const save = await this.supabase.saveScore(this.username.trim(), score);
    if (save.ok) {
      this.toast.show('success', `Saved score (${score}) for ${this.username.trim()}.`);
    } else {
      this.toast.show('error', save.message);
    }
  }

  private scoreForWinner(winner: Player): number {
    // Player is always X. AI (or second player) is O.
    return winner === 'X' ? 1 : 0;
  }

  private isDraw(board: Cell[]): boolean {
    return board.every((c) => c !== null) && !this.getWinner(board);
  }

  private getWinner(board: Cell[]): Player | null {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ] as const;

    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
  }
}
