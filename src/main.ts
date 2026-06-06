import './styles.css';

import { createGame } from './game/createGame';

const gameRoot = document.querySelector<HTMLElement>('#game-root');

if (!gameRoot) {
  throw new Error('Missing #game-root element');
}

createGame(gameRoot.id);
