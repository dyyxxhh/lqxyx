import Phaser from 'phaser';

import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { PlayScene } from '../scenes/PlayScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { TombRaidHubScene } from '../tombraid/TombRaidHubScene';
import { TombRaidScene } from '../tombraid/TombRaidScene';
import { GAME_HEIGHT, GAME_WIDTH, refreshCanvasDebugState } from './scaffoldState';

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
    input: {
      activePointers: 2,
    },
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
    scene: [BootScene, PreloadScene, GameScene, PlayScene, TombRaidHubScene, TombRaidScene]
  };
}

export function createGame(parent = 'game-root'): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(parent));

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_GAME__ = {
      startPlayScene: () => {
        game.scene.stop('GameScene');
        game.scene.start('PlayScene');
      },
      startTombRaidHub: () => {
        game.scene.stop('GameScene');
        game.scene.start('TombRaidHubScene');
      },
    };
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => refreshCanvasDebugState(parent));
  }

  return game;
}
