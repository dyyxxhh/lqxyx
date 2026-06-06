import Phaser from 'phaser';

import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { GAME_HEIGHT, GAME_WIDTH } from './scaffoldState';

export { GAME_HEIGHT, GAME_SCENES, GAME_WIDTH, createInitialSceneDebugState } from './scaffoldState';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#050505',
    pixelArt: true,
    roundPixels: true,
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
        fixedStep: true
      }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT
    },
    scene: [BootScene, PreloadScene, GameScene]
  };
}

export function createGame(parent = 'game-root'): Phaser.Game {
  return new Phaser.Game(createGameConfig(parent));
}
