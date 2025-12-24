import { Routes } from '@angular/router';
import { GameComponent } from './pages/game/game.component';
import { LeaderboardComponent } from './pages/leaderboard/leaderboard.component';

export const routes: Routes = [
  { path: '', component: GameComponent, title: 'Tic Tac Toe' },
  { path: 'leaderboard', component: LeaderboardComponent, title: 'Leaderboard' },
  { path: '**', redirectTo: '' },
];
