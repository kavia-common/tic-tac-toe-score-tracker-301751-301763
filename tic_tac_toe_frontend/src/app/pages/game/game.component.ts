import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService, type GameResult } from '../../services/supabase.service';
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

  private readonly board = signal<Cell[]>(Array.from({ length: 9 }, () => null));
  private readonly currentPlayer = signal<Player>('X');
  private readonly gameOver = signal<boolean>(false);

  readonly statusText = computed(() => {
    const winner = this.getWinner(this.board());
    if (winner) return `${winner} wins!`;
    if (this.gameOver()) return `It's a draw.`;
    return `${this.currentPlayer()}'s turn`;
  });

  readonly canPlay = computed(() => this.username.trim().length > 0);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly toast: ToastService,
  ) {}

  onUsernameBlur(): void {
    // Username is only required for saving scores (not for initializing Supabase).
    // Keep UX minimal: just avoid showing messages once input is provided.
    if (!this.username.trim()) return;

    if (!this.supabase.isConfigured()) {
      this.toast.show('info', 'Scores will not be saved because Supabase is not configured.');
    }
  }

  makeMove(index: number): void {
    // Allow gameplay even if username is blank; username is enforced only when saving results.
    if (this.gameOver()) return;

    const b = this.board().slice();
    if (b[index] !== null) return;

    b[index] = this.currentPlayer();
    this.board.set(b);

    const winner = this.getWinner(b);
    if (winner) {
      this.endGame(this.resultForWinner(winner));
      return;
    }
    if (this.isDraw(b)) {
      this.endGame('draw');
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

  private async endGame(result: GameResult): Promise<void> {
    this.gameOver.set(true);

    const save = await this.supabase.saveScore(this.username.trim(), result);
    if (save.ok) {
      this.toast.show('success', `Saved result (${result}) for ${this.username.trim()}.`);
    } else {
      this.toast.show('error', save.message);
    }
  }

  private resultForWinner(winner: Player): GameResult {
    // Player is always X. AI (or second player) is O.
    if (winner === 'X') return 'win';
    return 'loss';
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
    ];

    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
  }
}
