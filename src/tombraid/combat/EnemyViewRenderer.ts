// src/tombraid/combat/EnemyViewRenderer.ts
// 集中式程序绘制渲染器。仅此文件 import type Phaser（编译期擦除）。
// spec §5.5-§5.11 / Task 15：贴图敌人 scene.add.image；程序绘制敌人 scene.add.graphics；
// 血瞳头颅叠加红眼+血描边；幻影用 tint。
import type Phaser from 'phaser';
import type { Enemy, Projectile, ZoneEffect, ProceduralKind } from './Enemy';

interface EnemyView {
  enemyId: string;
  image: Phaser.GameObjects.Image | null;
  graphics: Phaser.GameObjects.Graphics | null;
}

export class EnemyViewRenderer {
  private readonly scene: Phaser.Scene;
  private readonly views = new Map<string, EnemyView>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  createView(enemy: Enemy): void {
    let image: Phaser.GameObjects.Image | null = null;
    let graphics: Phaser.GameObjects.Graphics | null = null;

    if (enemy.textureKey !== null) {
      image = this.scene.add.image(enemy.x, enemy.y, enemy.textureKey);
      image.setDepth(10);
      image.setOrigin(0.5, 0.7);
      if (enemy.tint !== null) {
        image.setTint(enemy.tint.color);
        image.setAlpha(enemy.tint.alpha);
      }
    }
    if (enemy.proceduralKind !== null) {
      graphics = this.scene.add.graphics();
      graphics.setDepth(10);
      this.drawProcedural(graphics, enemy.proceduralKind, enemy.x, enemy.y);
    }
    if (enemy.overlay === 'bloodEye') {
      // 血瞳叠加：在 image 之上绘制红眼+血描边
      if (graphics === null) {
        graphics = this.scene.add.graphics();
        graphics.setDepth(11);
      }
      this.drawBloodEyeOverlay(graphics, enemy.x, enemy.y);
    }

    this.views.set(enemy.id, { enemyId: enemy.id, image, graphics });
  }

  updateView(enemy: Enemy): void {
    const view = this.views.get(enemy.id);
    if (view === undefined) return;
    if (view.image !== null) {
      view.image.setPosition(enemy.x, enemy.y);
    }
    if (view.graphics !== null && enemy.proceduralKind !== null) {
      view.graphics.clear();
      this.drawProcedural(view.graphics, enemy.proceduralKind, enemy.x, enemy.y);
      if (enemy.overlay === 'bloodEye') {
        this.drawBloodEyeOverlay(view.graphics, enemy.x, enemy.y);
      }
    }
  }

  destroyView(enemyId: string): void {
    const view = this.views.get(enemyId);
    if (view === undefined) return;
    view.image?.destroy();
    view.graphics?.destroy();
    this.views.delete(enemyId);
  }

  getView(enemyId: string): EnemyView | undefined {
    return this.views.get(enemyId);
  }

  destroyAll(): void {
    for (const view of this.views.values()) {
      view.image?.destroy();
      view.graphics?.destroy();
    }
    this.views.clear();
  }

  private drawProcedural(g: Phaser.GameObjects.Graphics, kind: ProceduralKind, x: number, y: number): void {
    g.setPosition(x, y);
    switch (kind) {
      case 'bloodHand':
        g.fillStyle(0x880000, 1);
        g.fillCircle(0, 0, 20);
        g.fillStyle(0x440000, 1);
        g.fillRect(-12, 0, 8, 24);
        g.fillRect(0, 0, 8, 24);
        g.fillRect(12, 0, 8, 24);
        break;
      case 'floatingEye':
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(0, 0, 14);
        g.fillStyle(0x880000, 1);
        g.fillCircle(0, 0, 6);
        g.lineStyle(2, 0xff0000, 1);
        g.strokeCircle(0, 0, 14);
        break;
      case 'chalkDust':
        g.fillStyle(0xdddddd, 0.4);
        g.fillCircle(0, 0, 40);
        g.fillStyle(0xffffff, 0.2);
        g.fillCircle(-10, -10, 20);
        g.fillCircle(12, 8, 16);
        break;
      default:
        break;
    }
  }

  private drawBloodEyeOverlay(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.setPosition(x, y);
    // 红眼
    g.fillStyle(0xff0000, 0.9);
    g.fillCircle(-6, -4, 3);
    g.fillCircle(6, -4, 3);
    // 血色描边
    g.lineStyle(2, 0x660000, 1);
    g.strokeCircle(0, 0, 24);
  }

  drawProjectile(p: Projectile): Phaser.GameObjects.Graphics | Phaser.GameObjects.Image {
    const g = this.scene.add.graphics();
    g.setDepth(9);
    g.setPosition(p.x, p.y);
    switch (p.proceduralKind) {
      case 'danYuxuanOrb':
        g.fillStyle(0x88aaff, 1);
        g.fillCircle(0, 0, p.radius);
        break;
      case 'bloodEyeOrb':
        g.fillStyle(0xff0000, 1);
        g.fillCircle(0, 0, p.radius);
        g.lineStyle(2, 0x660000, 1);
        g.strokeCircle(0, 0, p.radius + 2);
        break;
      case 'woodChip':
        g.fillStyle(0x886633, 1);
        g.fillRect(-p.radius, -p.radius / 2, p.radius * 2, p.radius);
        break;
      default:
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, 0, p.radius);
        break;
    }
    return g;
  }

  drawZone(z: ZoneEffect): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.setDepth(5);
    g.setPosition(z.x, z.y);
    const inWindup = z.windupMs > 0;
    switch (z.proceduralKind) {
      case 'phoneRedCircle':
      case 'phoneExplosion':
        g.lineStyle(2, inWindup ? 0xff0000 : 0xff6600, inWindup ? 0.6 : 0.9);
        g.strokeCircle(0, 0, z.radius);
        if (!inWindup) {
          g.fillStyle(0xff3300, 0.3);
          g.fillCircle(0, 0, z.radius);
        }
        break;
      case 'screamWave':
        g.fillStyle(0x9933ff, 0.3);
        g.fillCircle(0, 0, z.radius);
        g.lineStyle(2, 0xcc66ff, 0.8);
        g.strokeCircle(0, 0, z.radius);
        break;
      case 'floorCrackWave':
        g.lineStyle(2, 0xff3333, 0.8);
        g.strokeCircle(0, 0, z.radius);
        g.fillStyle(0x660000, 0.4);
        g.fillCircle(0, 0, z.radius);
        break;
      case 'laserBeam':
        g.fillStyle(0xff0000, 0.7);
        g.fillRect(-z.width / 2, -z.height / 2, z.width, z.height);
        break;
      case 'chairObstacle':
        g.fillStyle(0x886633, 1);
        g.fillRect(-12, -12, 24, 24);
        break;
      default:
        g.lineStyle(1, 0xffffff, 0.4);
        g.strokeCircle(0, 0, z.radius);
        break;
    }
    return g;
  }
}
