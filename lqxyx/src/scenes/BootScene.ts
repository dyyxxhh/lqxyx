import Phaser from 'phaser';

import { markSceneStarted } from '../game/scaffoldState';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public create(): void {
    markSceneStarted('BootScene');
    this.scene.start('PreloadScene');
  }
}
