// src/forgottenSanity/combat/WallHitRenderer.ts
// Task 6 (#4): 撞墙粒子渲染器 — 与 CombatManager.wallHitParticles 同步
//   spawnWallHitFx 生成的 3 个白色粒子由本类渲染为 2×2 矩形，按 lifeMs/maxLifeMs 计算透明度
//   200ms 渐隐。depth=9（与敌侧 projectile 同层，玩家=10 之下）。
//   仅 import type Phaser（编译期擦除），与 EnemyViewRenderer 一致。
import type Phaser from 'phaser';

/** WallHitRenderer 同步所需的粒子形状（与 CombatManager.WallHitParticle 结构兼容） */
export interface WallHitParticleView {
  readonly x: number;
  readonly y: number;
  readonly lifeMs: number;
  readonly maxLifeMs: number;
  readonly color: number;
}

const PARTICLE_SIZE = 2;
const PARTICLE_DEPTH = 9;

export class WallHitRenderer {
  private particles: Phaser.GameObjects.Rectangle[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 把 CombatManager.getWallHitParticles() 同步到视图：多余销毁、不足创建、按索引更新位置与透明度。 */
  sync(wallHitParticles: ReadonlyArray<WallHitParticleView>): void {
    // 销毁多余
    while (this.particles.length > wallHitParticles.length) {
      const rect = this.particles.pop();
      rect?.destroy();
    }
    // 创建不足
    while (this.particles.length < wallHitParticles.length) {
      const rect = this.scene.add.rectangle(0, 0, PARTICLE_SIZE, PARTICLE_SIZE, 0xffffff);
      rect.setDepth(PARTICLE_DEPTH);
      this.particles.push(rect);
    }
    // 同步位置 / 颜色 / 透明度
    for (let i = 0; i < wallHitParticles.length; i++) {
      const p = wallHitParticles[i]!;
      const r = this.particles[i]!;
      r.setPosition(p.x, p.y);
      const alpha = p.maxLifeMs > 0 ? Math.max(0, Math.min(1, p.lifeMs / p.maxLifeMs)) : 0;
      r.setFillStyle(p.color, alpha);
    }
  }

  destroy(): void {
    for (const p of this.particles) p.destroy();
    this.particles = [];
  }
}
