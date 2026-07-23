// src/forgottenSanity/combat/WallHitParticleSystem.ts
// spec#5 §5.2 拆分：撞墙粒子子系统 — 从 CombatManager 抽出。
// 纯 TS，无 Phaser import。负责 wallHitParticles 数组的生成 / 推进 / 查询。
// WallHitRenderer.sync() 每帧读取 get() 同步视图（depth=9）。
// spec §3.2 / Task 6 (#4)。
import type { CombatRng } from './Enemy';

// Task 6 (#4): 撞墙粒子 — 3 个 / 随机方向 50px/s / 200ms 渐隐 / 白色 0xffffff
export interface WallHitParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  color: number;
}

const WALL_HIT_PARTICLE_COUNT = 3;
const WALL_HIT_PARTICLE_SPEED = 50;        // px/s
const WALL_HIT_PARTICLE_LIFE_MS = 200;
const WALL_HIT_PARTICLE_COLOR = 0xffffff;

/** 撞墙粒子子系统：spawn 生成 3 个随机方向白色粒子，update 推进位置与生命，life 耗尽移除。
 *  CombatManager.update 中 wallHitSys.update 必须先于 projSys.update（同帧新生成的粒子不应被老化）。 */
export class WallHitParticleSystem {
  readonly particles: WallHitParticle[] = [];

  constructor(private readonly rng: CombatRng) {}

  /** 在 (x,y) 生成 3 个随机方向白色粒子。被 ProjectileSystem 撞墙检测调用。 */
  spawn(x: number, y: number): void {
    for (let i = 0; i < WALL_HIT_PARTICLE_COUNT; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * WALL_HIT_PARTICLE_SPEED,
        vy: Math.sin(angle) * WALL_HIT_PARTICLE_SPEED,
        lifeMs: WALL_HIT_PARTICLE_LIFE_MS,
        maxLifeMs: WALL_HIT_PARTICLE_LIFE_MS,
        color: WALL_HIT_PARTICLE_COLOR,
      });
    }
  }

  /** WallHitRenderer.sync() 每帧读取此方法同步视图。 */
  get(): readonly WallHitParticle[] {
    return this.particles;
  }

  /** 推进所有粒子的位置与生命，life 耗尽则移除。 */
  update(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) this.particles.splice(i, 1);
    }
  }
}
