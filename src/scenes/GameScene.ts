import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, markSceneStarted } from '../game/scaffoldState';

export class GameScene extends Phaser.Scene {
  public constructor() {
    super('GameScene');
  }

  public create(): void {
    markSceneStarted('GameScene');

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '影中咎\n基础设施已启动', {
        align: 'center',
        color: '#f2f2f2',
        fontFamily: 'sans-serif',
        fontSize: '32px',
        lineSpacing: 12
      })
      .setOrigin(0.5);
  }
}
