// src/tombraid/combat/CombatManager.ts
// 战斗管理器主循环。纯 TS，无 Phaser import。
// spec §3.1 / §3.3 / §5.9 / §5.10，grill 2026-07-17 补全噪声传递
import {
  PLAYER_CONTACT_DAMAGE_COOLDOWN_MS,
  WEAK_PUNCH_DAMAGE,
  type DamageInstance,
  type Debuff,
} from './DamageType';
import {
  type CombatRng,
  Enemy,
  type EnemyKind,
  type EnemyUpdateContext,
  type Projectile,
  type ZoneEffect,
  createCombatRng,
  createEnemy,
  type Vec2,
} from './Enemy';
import { PlayerCombat } from './PlayerCombat';

export type IsWalkableFn = (x: number, y: number) => boolean;

export interface CombatCallbacks {
  onPlayerDamaged?: (instance: DamageInstance) => void;
  onPlayerDebuffApplied?: (debuff: Debuff) => void;
  onPlayerDied?: () => void;
  onEnemyKilled?: (enemy: Enemy) => void;
  onEliteDefeated?: () => void;                              // 杨云红边死亡 → 理智崩塌事件
  onMarkBodyOnMinimap?: (bodyId: string, x: number, y: number) => void; // 召唤核心 30% 标记
  onVisionReduced?: (ratio: number, active: boolean) => void; // 粉笔尘云视野减益
  onKnockback?: (vx: number, vy: number, durationMs: number) => void; // 冲撞击退
}

const MAX_DAN_YUXUAN_BODIES = 2;
const PLAYER_ATTACK_RANGE = 64;
const PLAYER_ATTACK_HALF_ANGLE = Math.PI / 4; // 45° 半角 → 90° 扇形
// 设计变更：杨云红边中立→激怒。玩家攻击命中敌人时，350px 视野内的中立杨云红边永久激怒。
// CombatManager 不 import 敌人子类（保持核心与插件解耦），故本地声明，数值与 YangYunRed.VISION_RANGE 一致。
const ELITE_AGGRO_VISION_RANGE = 350;

export class CombatManager {
  readonly player: PlayerCombat;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: ZoneEffect[] = [];
  private playerPosition: Vec2 = { x: 0, y: 0 };
  private readonly isWalkable: IsWalkableFn;
  private readonly rng: CombatRng;
  private readonly callbacks: CombatCallbacks;
  private bodyCount = 0;
  private timeMs = 0;
  private projectileCounter = 0;
  private zoneCounter = 0;

  constructor(
    player: PlayerCombat,
    callbacks: CombatCallbacks = {},
    isWalkable: IsWalkableFn = () => true,
    rng?: CombatRng,
  ) {
    this.player = player;
    this.callbacks = callbacks;
    this.isWalkable = isWalkable;
    this.rng = rng ?? createCombatRng(Date.now() & 0xffffffff);

    // 转发玩家回调
    this.player.onDied = () => this.callbacks.onPlayerDied?.();
    this.player.onDamaged = (i) => this.callbacks.onPlayerDamaged?.(i);
    this.player.onDebuffApplied = (d) => this.callbacks.onPlayerDebuffApplied?.(d);
  }

  setPlayerPosition(x: number, y: number): void {
    this.playerPosition = { x, y };
  }

  getPlayerPosition(): Vec2 {
    return this.playerPosition;
  }

  addEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
  }

  removeEnemy(enemy: Enemy): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
  }

  spawnProjectile(p: Projectile): void {
    this.projectiles.push(p);
  }

  spawnZone(z: ZoneEffect): void {
    this.zones.push(z);
  }

  // -- 身体上限 (spec §5.9 最多 2 个) --
  canSpawnBody(): boolean {
    return this.bodyCount < MAX_DAN_YUXUAN_BODIES;
  }
  registerBody(): void {
    this.bodyCount++;
  }
  unregisterBody(): void {
    if (this.bodyCount > 0) this.bodyCount--;
  }

  // -- 玩家占位普攻 (spec §3.1 弱拳 5 伤) --
  playerAttack(direction: Vec2): void {
    if (this.player.isDead) return;
    let dirX = direction.x;
    let dirY = direction.y;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len === 0) {
      dirX = 0;
      dirY = 1; // 默认朝下
    } else {
      dirX /= len;
      dirY /= len;
    }
    const instance: DamageInstance = { amount: WEAK_PUNCH_DAMAGE, category: 'melee' };
    const hitEnemies: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - this.playerPosition.x;
      const dy = enemy.y - this.playerPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > PLAYER_ATTACK_RANGE + enemy.contactRadius) continue;
      if (dist === 0) {
        enemy.applyDamage(instance);
        hitEnemies.push(enemy);
        continue;
      }
      const dot = (dx / dist) * dirX + (dy / dist) * dirY;
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      if (angle <= PLAYER_ATTACK_HALF_ANGLE) {
        enemy.applyDamage(instance);
        hitEnemies.push(enemy);
      }
    }
    // 设计变更：玩家攻击命中 → 检查视野内中立杨云红边激怒
    this.applyEliteAggro(hitEnemies);
    this.handleDeadEnemies();
  }

  // 设计变更：杨云红边中立→激怒机制。
  // 玩家攻击命中任何敌人时，所有处于中立状态、且距被命中敌人 ≤350px 视野内的杨云红边永久激怒。
  // 命中杨云红边本人时（距离 0）其自身亦激怒。
  // 通过 duck-typing 访问 aggroState/enrage（项目 E2E 可观察性模式，与 onBoundHeadDied 探测一致）。
  private applyEliteAggro(hitEnemies: readonly Enemy[]): void {
    if (hitEnemies.length === 0) return;
    const rangeSq = ELITE_AGGRO_VISION_RANGE * ELITE_AGGRO_VISION_RANGE;
    for (const target of hitEnemies) {
      for (const e of this.enemies) {
        if (e.dead || e.kind !== 'yangYunRed') continue;
        const elite = e as unknown as { aggroState: 'neutral' | 'hostile'; enrage: () => void };
        if (elite.aggroState !== 'neutral') continue;
        const ddx = e.x - target.x;
        const ddy = e.y - target.y;
        if (ddx * ddx + ddy * ddy <= rangeSq) {
          elite.enrage();
        }
      }
    }
  }

  // -- 主循环 --
  update(deltaMs: number): void {
    this.timeMs += deltaMs;
    if (this.player.isDead) return;

    // 1. 玩家 debuff tick
    this.player.tick(deltaMs);
    if (this.player.isDead) return;

    // 2. 敌人 AI 更新
    const ctx = this.makeContext();
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.invulnMs > 0) enemy.invulnMs = Math.max(0, enemy.invulnMs - deltaMs);
      if (enemy.contactCooldownMs > 0) {
        enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - deltaMs);
      }
      enemy.update(deltaMs, ctx);
    }

    // 3. 弹幕推进
    this.updateProjectiles(deltaMs);

    // 4. 区域推进
    this.updateZones(deltaMs);

    // 5. 接触伤害
    this.applyContactDamage(deltaMs);

    // 6. 粉笔尘云视野减益
    this.updateVisionDebuff();

    // 7. 清理死亡敌人
    this.handleDeadEnemies();
  }

  private makeContext(): EnemyUpdateContext {
    // grill 2026-07-17：把 PlayerCombat.lastNoiseRadius 转为玩家位置上的噪声事件
    const noise = this.player.lastNoiseRadius > 0
      ? { x: this.playerPosition.x, y: this.playerPosition.y, radius: this.player.lastNoiseRadius }
      : null;
    return {
      playerPosition: this.playerPosition,
      timeMs: this.timeMs,
      rng: this.rng,
      playerNoise: noise,
      spawnProjectile: (p) => this.spawnProjectile(p),
      spawnZone: (z) => this.spawnZone(z),
      spawnEnemy: (kind, pos, parentId) => this.spawnEnemyInternal(kind, pos, parentId),
      isWalkable: this.isWalkable,
    };
  }

  private spawnEnemyInternal(kind: EnemyKind, pos: Vec2, parentId?: string): Enemy | null {
    const id = `${kind}-${this.timeMs}-${Math.floor(this.rng.next() * 100000)}`;
    const opts = this.defaultEnemyOpts(kind, id, pos.x, pos.y);
    const enemy = createEnemy(kind, opts);
    if (enemy === null) return null;
    if (parentId !== undefined) enemy.parentId = parentId;
    this.addEnemy(enemy);
    return enemy;
  }

  private defaultEnemyOpts(kind: EnemyKind, id: string, x: number, y: number) {
    // 各敌人初始数值；与子类构造保持一致
    const table: Record<EnemyKind, { maxHp: number; speed: number; contactDamage: number; contactRadius: number }> = {
      butYuxuanHead: { maxHp: 45, speed: 60, contactDamage: 8, contactRadius: 22 },
      qinHaoruiHead: { maxHp: 55, speed: 50, contactDamage: 8, contactRadius: 22 },
      deskChairs: { maxHp: 120, speed: 40, contactDamage: 15, contactRadius: 28 },
      phone: { maxHp: 70, speed: 55, contactDamage: 10, contactRadius: 22 },
      bloodHand: { maxHp: 70, speed: 0, contactDamage: 16, contactRadius: 26 },
      floatingEye: { maxHp: 35, speed: 80, contactDamage: 6, contactRadius: 20 },
      chalkDust: { maxHp: 150, speed: 30, contactDamage: 5, contactRadius: 40 },
      butYuxuanHeadBloodEye: { maxHp: 70, speed: 75, contactDamage: 12, contactRadius: 22 },
      danYuxuanBody: { maxHp: 1, speed: 0, contactDamage: 0, contactRadius: 30 },
      yangYunRed: { maxHp: 320, speed: 95, contactDamage: 22, contactRadius: 30 },
      yangYunRedPhantom: { maxHp: 40, speed: 80, contactDamage: 8, contactRadius: 24 },
    };
    const s = table[kind];
    return { id, x, y, maxHp: s.maxHp, speed: s.speed, contactDamage: s.contactDamage, contactRadius: s.contactRadius };
  }

  private updateProjectiles(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (const p of this.projectiles) {
      // 追踪
      if (p.homingTarget === 'player') {
        const dx = this.playerPosition.x - p.x;
        const dy = this.playerPosition.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.001) {
          const desiredVx = (dx / dist) * p.speed;
          const desiredVy = (dy / dist) * p.speed;
          const turn = Math.min(1, p.homingStrength * seconds);
          p.vx = p.vx + (desiredVx - p.vx) * turn;
          p.vy = p.vy + (desiredVy - p.vy) * turn;
          // 归一化速度
          const vlen = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (vlen > 0.001) {
            p.vx = (p.vx / vlen) * p.speed;
            p.vy = (p.vy / vlen) * p.speed;
          }
        }
      }
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.remainingMs -= deltaMs;
      // 碰撞玩家
      if (!this.player.isDead) {
        const ddx = p.x - this.playerPosition.x;
        const ddy = p.y - this.playerPosition.y;
        if (ddx * ddx + ddy * ddy <= (p.radius + 16) * (p.radius + 16)) {
          const instance: DamageInstance = {
            amount: p.damage,
            category: p.category,
            ...(p.debuff !== undefined ? { debuff: p.debuff } : {}),
          };
          this.player.takeDamage(instance);
          p.remainingMs = 0;
        }
      }
    }
    // 清理过期
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i]!.remainingMs <= 0) this.projectiles.splice(i, 1);
    }
  }

  private updateZones(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (const z of this.zones) {
      // 移动
      z.x += z.vx * seconds;
      z.y += z.vy * seconds;
      // 扩展
      if (z.expandSpeed > 0 && z.radius < z.maxRadius) {
        z.radius = Math.min(z.maxRadius, z.radius + z.expandSpeed * seconds);
      }
      if (z.windupMs > 0) {
        z.windupMs -= deltaMs;
        if (z.windupMs <= 0) {
          // windup 结束 → 结算 burst
          if (z.burstDamage > 0 && !this.player.isDead && this.pointInZone(z)) {
            const instance: DamageInstance = {
              amount: z.burstDamage,
              category: z.category,
              ...(z.debuff !== undefined ? { debuff: z.debuff } : {}),
            };
            this.player.takeDamage(instance);
            if (z.applyDebuffOnce) z.debuffApplied = true;
          }
        }
      } else {
        // DoT 阶段
        if (z.damagePerSecond > 0 && !this.player.isDead && this.pointInZone(z)) {
          const dotInstance: DamageInstance = {
            amount: z.damagePerSecond * seconds,
            category: z.category,
            ...(z.debuff !== undefined && (!z.applyDebuffOnce || !z.debuffApplied) ? { debuff: z.debuff } : {}),
          };
          this.player.takeDamage(dotInstance);
          if (z.applyDebuffOnce && z.debuff !== undefined) z.debuffApplied = true;
        }
      }
      z.remainingMs -= deltaMs;
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i]!.remainingMs <= 0) this.zones.splice(i, 1);
    }
  }

  private pointInZone(z: ZoneEffect): boolean {
    const dx = z.x - this.playerPosition.x;
    const dy = z.y - this.playerPosition.y;
    if (z.shape === 'circle') {
      return dx * dx + dy * dy <= z.radius * z.radius;
    }
    // rect 旋转
    const cos = Math.cos(-z.angle);
    const sin = Math.sin(-z.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= z.width / 2 && Math.abs(ly) <= z.height / 2;
  }

  private applyContactDamage(_deltaMs: number): void {
    if (this.player.isDead) return;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      // 设计变更：中立杨云红边不攻击玩家（含接触伤害）
      if (enemy.kind === 'yangYunRed') {
        const elite = enemy as unknown as { aggroState: 'neutral' | 'hostile' };
        if (elite.aggroState === 'neutral') continue;
      }
      const dist = enemy.distanceTo(this.playerPosition.x, this.playerPosition.y);
      if (dist > enemy.contactRadius + 16) continue;
      // 粉笔尘云：持续 DoT 接触（5/s），无冷却
      if (enemy.kind === 'chalkDust') {
        const dotInstance: DamageInstance = {
          amount: enemy.contactDamage * (_deltaMs / 1000),
          category: 'dot',
        };
        this.player.takeDamage(dotInstance);
        continue;
      }
      // 普通敌人：1s 冷却
      if (enemy.contactCooldownMs > 0) continue;
      // 杨云红边二阶段接触附加 burn
      const burnDebuff = enemy.contactBurn !== null
        ? { type: 'burn' as const, dps: enemy.contactBurn.dps, remainingMs: enemy.contactBurn.durationMs }
        : undefined;
      const instance: DamageInstance = burnDebuff !== undefined
        ? { amount: enemy.contactDamage, category: 'melee', debuff: burnDebuff }
        : { amount: enemy.contactDamage, category: 'melee' };
      this.player.takeDamage(instance);
      enemy.contactCooldownMs = PLAYER_CONTACT_DAMAGE_COOLDOWN_MS;
    }
  }

  private updateVisionDebuff(): void {
    let inChalk = false;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.kind !== 'chalkDust') continue;
      const dist = enemy.distanceTo(this.playerPosition.x, this.playerPosition.y);
      if (dist <= enemy.contactRadius + 40) {
        inChalk = true;
        break;
      }
    }
    this.callbacks.onVisionReduced?.(0.3, inChalk);
  }

  private handleDeadEnemies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i]!;
      if (!enemy.dead) continue;
      // 通知身体：绑定头颅死亡
      if (enemy.parentId !== null) {
        const body = this.enemies.find((e) => e.id === enemy.parentId && !e.dead);
        if (body !== undefined && typeof (body as unknown as { onBoundHeadDied?: (head: Enemy) => void }).onBoundHeadDied === 'function') {
          (body as unknown as { onBoundHeadDied: (head: Enemy) => void }).onBoundHeadDied(enemy);
        }
        // 30% 标记身体位置
        if (this.rng.chance(0.3)) {
          this.callbacks.onMarkBodyOnMinimap?.(enemy.parentId, body?.x ?? 0, body?.y ?? 0);
        }
      }
      // 精英死亡事件
      if (enemy.kind === 'yangYunRed') {
        this.callbacks.onEliteDefeated?.();
      }
      this.callbacks.onEnemyKilled?.(enemy);
      this.enemies.splice(i, 1);
    }
  }

  // 供子类/场景生成 id
  nextProjectileId(): string {
    return `proj-${this.projectileCounter++}`;
  }
  nextZoneId(): string {
    return `zone-${this.zoneCounter++}`;
  }
}
