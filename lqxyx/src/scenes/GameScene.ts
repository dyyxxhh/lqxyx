import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, markGameSceneReady, markSceneStarted, refreshCanvasDebugState } from '../game/scaffoldState';

export class GameScene extends Phaser.Scene {
  public constructor() {
    super('GameScene');
  }

  public create(): void {
    markSceneStarted('GameScene');
    refreshCanvasDebugState();
    markGameSceneReady();

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120, '影中咎', {
        align: 'center',
        color: '#f2f2f2',
        fontFamily: 'sans-serif',
        fontSize: '56px',
      })
      .setOrigin(0.5);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, 360, 72, 0x9b1420).setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, '开始新游戏', {
        align: 'center',
        color: '#ffffff',
        fontFamily: 'sans-serif',
        fontSize: '32px',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 104, '运行时外壳已就绪，后续任务接入第一幕系统。', {
        align: 'center',
        color: '#cfcfcf',
        fontFamily: 'sans-serif',
        fontSize: '24px',
      })
      .setOrigin(0.5);
  }
}
