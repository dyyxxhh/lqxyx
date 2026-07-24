import type Phaser from 'phaser';

/**
 * Screen shake controller. Wraps Phaser camera.shake() and camera.flash()
 * with preset intensities matching the spec.
 *
 * Intensity is normalized: Phaser uses 0-1 where ~0.01 ≈ 10px.
 */
export class ScreenShake {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private get camera(): Phaser.Cameras.Scene2D.Camera {
    return this.scene.cameras.main;
  }

  /** Expose the scene reference for external consumers (e.g. SceneFX). */
  getScene(): Phaser.Scene {
    return this.scene;
  }

  /** Hit: 8px, 200ms. */
  shakeHit(): void {
    this.camera.shake(200, 0.008);
  }

  /** Kill: 12px, 300ms. */
  shakeKill(): void {
    this.camera.shake(300, 0.012);
  }

  /** Sanity dissolution: 20px, 500ms. */
  shakeSanity(): void {
    this.camera.shake(500, 0.020);
  }

  /** F-B chase catch: 20px, 400ms. */
  shakeFB(): void {
    this.camera.shake(400, 0.020);
  }

  /** Custom shake: intensity in px, duration in ms. */
  shakeCustom(intensityPx: number, durationMs: number): void {
    this.camera.shake(durationMs, intensityPx / 1000);
  }

  /** Red flash overlay using a full-screen rectangle. */
  flashRed(durationMs: number, alpha: number): void {
    const cam = this.camera;
    // The rect uses setScrollFactor(0) below, so it lives in screen space.
    // Position it at the screen-space center (cam.width/2, cam.height/2) —
    // NOT cam.scrollX + width/2, which would offset it off-viewport when
    // the camera is scrolled (e.g. ForgottenSanityScene scrolling camera).
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const rect = this.scene.add.rectangle(
      cx, cy, cam.width, cam.height, 0xb01724, alpha
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3000);
    this.scene.tweens.add({
      targets: rect,
      alpha: 0,
      duration: durationMs,
      onComplete: () => rect.destroy(),
    });
  }

  destroy(): void {
    // Camera shake auto-resolves; flashRed tween/rect auto-destroyed via onComplete.
    // No persistent resources to clean up.
  }
}
