import Phaser from 'phaser';

import { markSceneStarted } from '../game/scaffoldState';

export class PreloadScene extends Phaser.Scene {
  public constructor() {
    super('PreloadScene');
  }

  public create(): void {
    markSceneStarted('PreloadScene');
    this.scene.start('GameScene');
  }
}
