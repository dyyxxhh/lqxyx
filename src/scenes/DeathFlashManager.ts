import type Phaser from 'phaser';

import type { DeathFlashFrame } from '../data/story';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';

export interface DeathFlashFrameLogEntry {
  id: 'celery' | 'ruler';
  index: number;
  background: DeathFlashFrame['background'];
  image: DeathFlashFrame['image'] | null;
  textureKey: string | null;
  durationMs: number;
}

const DEPTH = 1700;
// Phaser.TintModes.FILL = 1; imported as a literal here so this module stays
// type-only on Phaser and remains loadable in vitest without a Canvas runtime.
const TINT_MODE_FILL = 1;

export class DeathFlashManager {
  private readonly scene: Phaser.Scene;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private timer: Phaser.Time.TimerEvent | null = null;
  private frameLog: DeathFlashFrameLogEntry[] = [];
  private active = false;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public play(id: 'celery' | 'ruler', sequence: readonly DeathFlashFrame[]): void {
    this.cleanup();
    this.frameLog = [];
    this.active = sequence.length > 0;
    if (!this.active) return;

    this.renderFrame(id, sequence, 0);
  }

  public cleanup(): void {
    this.timer?.remove(false);
    this.timer = null;
    this.destroyFrameObjects();
    this.active = false;
  }

  public isActive(): boolean {
    return this.active;
  }

  public getFrameLog(): readonly DeathFlashFrameLogEntry[] {
    return this.frameLog;
  }

  public getActiveObjectCount(): number {
    return this.objects.length;
  }

  private renderFrame(id: 'celery' | 'ruler', sequence: readonly DeathFlashFrame[], index: number): void {
    const frame = sequence[index];
    if (!frame) {
      this.cleanup();
      return;
    }

    this.destroyFrameObjects();
    this.renderBackground(frame.background);

    const textureKey = frame.image ? textureKeyForFrameImage(frame.image) : null;
    if (frame.image && textureKey) {
      this.renderImage(frame.image, textureKey);
    }

    this.frameLog.push({
      id,
      index,
      background: frame.background,
      image: frame.image ?? null,
      textureKey,
      durationMs: frame.durationMs,
    });

    this.timer = this.scene.time.delayedCall(frame.durationMs, () => {
      this.timer = null;
      this.renderFrame(id, sequence, index + 1);
    });
  }

  private renderBackground(background: DeathFlashFrame['background']): void {
    if (background === 'bloodBlack') {
      const image = this.scene.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'transition.bloodBlackScreen')
        .setDepth(DEPTH)
        .setScrollFactor(0)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
      this.objects.push(image);
      return;
    }

    const color = background === 'white' ? 0xffffff : 0x000000;
    const rectangle = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, color, 1)
      .setDepth(DEPTH)
      .setScrollFactor(0);
    this.objects.push(rectangle);
  }

  private renderImage(imageKey: NonNullable<DeathFlashFrame['image']>, textureKey: string): void {
    const image = this.scene.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, textureKey)
      .setDepth(DEPTH + 1)
      .setScrollFactor(0)
      .setOrigin(0.5);

    // The source celery/ruler texture is a black silhouette on transparent
    // alpha. setTintFill REPLACES the visible color (preserving alpha) so the
    // black source can render as pure white against the black background frame
    // — setTint multiplies and leaves a black silhouette black, which would
    // make it invisible on the black background.
    if (imageKey.includes('Celery') || imageKey.includes('Ruler')) {
      const isWhiteVariant = imageKey.includes('white') || imageKey.includes('White');
      image.setTint(isWhiteVariant ? 0xffffff : 0x000000);
      image.setTintMode(TINT_MODE_FILL);
      image.setAlpha(1);
    }

    if (imageKey.startsWith('large')) {
      image.setScale(0.7);
    } else {
      image.setScale(0.42);
    }

    this.objects.push(image);
  }

  private destroyFrameObjects(): void {
    for (const object of this.objects) {
      object.destroy();
    }
    this.objects = [];
  }
}

function textureKeyForFrameImage(image: NonNullable<DeathFlashFrame['image']>): string {
  return image.includes('Ruler') ? 'prop.ruler' : 'prop.celery';
}
