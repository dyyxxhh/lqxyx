import Phaser from 'phaser';
import { markSceneStarted } from '../game/scaffoldState';

export class TombRaidScene extends Phaser.Scene {
  constructor() {
    super('TombRaidScene');
  }

  create(): void {
    markSceneStarted('TombRaidScene');
    this.cameras.main.setBackgroundColor('#050505');
    // 占位：实际摸金模式逻辑将在后续实现
    const text = this.add.text(640, 360, '摸金模式 · 加载中...', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#d7b15c',
    });
    text.setOrigin(0.5);
  }
}
