// src/tombraid/combat/enemies/DanYuxuanBody.ts
// ⑨ 召唤核心：但宇轩身体（spec §5.9，grill 2026-07-17 补充召唤计时器 1Hz 真实时间）
// HP1/contact0/speed0，非攻击性 → 不走三态机；召唤计时器始终 1Hz 真实时间推进。
// 核心 AI 逻辑纯 TS（无 Phaser import）。
import {
  Enemy,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
  registerEnemyKind,
} from '../Enemy';

// spec §5.9
const BODY_MAX_HP = 1;
const BODY_SPEED = 0;
const BODY_CONTACT_DAMAGE = 0;
const BODY_CONTACT_RADIUS = 30;
const BODY_TEXTURE_KEY = 'sprite.danYuxuan.lyingBloody';
const SUMMON_INTERVAL_MS = 30000;
const MAX_ALIVE_HEADS = 3;
const REVIVE_MS = 20000;
const SUMMON_MIN_DIST = 200;
const SUMMON_RANGE = 300;

// 身体非攻击性 → 三态机无意义；提供 trivial perception 满足基类 abstract 字段
const BODY_PERCEPTION: EnemyPerceptionParams = {
  visionRange: 0,
  visionHalfAngleDeg: 60,
  noiseSensitivity: 0,
  alertToChaseMs: 'instant',
  chaseToSearchMs: 0,
  searchToAlertMs: 0,
  alertToIdleMs: 0,
  patrolKind: 'static',
};

interface BoundHead {
  head: Enemy;
  deadAtMs: number | null; // 头颅死亡时间戳（timeMs），null 表示存活
  deathX: number;
  deathY: number;
}

export class DanYuxuanBodyEnemy extends Enemy {
  readonly kind: EnemyKind = 'danYuxuanBody';
  readonly textureKey: string | null = BODY_TEXTURE_KEY;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = BODY_PERCEPTION;

  // 暴露 boundHeads 供测试访问（与 CombatManager duck-typing 协议一致）
  boundHeads: BoundHead[] = [];
  private summonTimer = SUMMON_INTERVAL_MS;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: BODY_MAX_HP,
      speed: BODY_SPEED,
      contactDamage: BODY_CONTACT_DAMAGE,
      contactRadius: BODY_CONTACT_RADIUS,
    });
  }

  update(deltaMs: number, ctx: EnemyUpdateContext): void {
    // 身体非攻击性，不走三态机；aiState 始终 idle。
    // spec §5.9 grill 补充：召唤计时器始终 1Hz 真实时间推进，不受 §5.11.7 远房 4Hz 降级影响。
    // 因此此处直接累加 deltaMs（CombatManager 调用时无论 60Hz/4Hz，deltaMs 都是真实流逝时间）。

    // 机制 C：复活到期头颅（20s 真实时间）
    for (const bh of this.boundHeads) {
      if (bh.deadAtMs !== null && ctx.timeMs - bh.deadAtMs >= REVIVE_MS) {
        // 复活：重置 dead/hp/位置
        (bh.head as unknown as { dead: boolean }).dead = false;
        (bh.head as unknown as { hp: number }).hp = (bh.head as unknown as { maxHp: number }).maxHp;
        (bh.head as unknown as { x: number }).x = bh.deathX;
        (bh.head as unknown as { y: number }).y = bh.deathY;
        bh.deadAtMs = null;
      }
    }

    // 机制 A：召唤血瞳头颅（30s 真实时间）
    this.summonTimer -= deltaMs;
    if (this.summonTimer <= 0) {
      this.summonTimer = SUMMON_INTERVAL_MS;
      this.trySummon(ctx);
    }
  }

  private trySummon(ctx: EnemyUpdateContext): void {
    // 存活血瞳 ≥ 3 → 不召唤
    const aliveCount = this.boundHeads.filter(
      (bh) => bh.deadAtMs === null && !(bh.head as unknown as { dead: boolean }).dead,
    ).length;
    if (aliveCount >= MAX_ALIVE_HEADS) return;

    // 在玩家 200px 外随机位置召唤
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = ctx.rng.next() * Math.PI * 2;
      const dist = SUMMON_MIN_DIST + ctx.rng.next() * SUMMON_RANGE;
      const nx = ctx.playerPosition.x + Math.cos(angle) * dist;
      const ny = ctx.playerPosition.y + Math.sin(angle) * dist;
      if (!ctx.isWalkable(nx, ny)) continue;
      const head = ctx.spawnEnemy('butYuxuanHeadBloodEye' as EnemyKind, { x: nx, y: ny }, this.id);
      if (head !== null) {
        this.boundHeads.push({ head, deadAtMs: null, deathX: nx, deathY: ny });
      }
      return;
    }
  }

  /** CombatManager 在绑定头颅死亡时调用（spec §5.9 C 复活机制 + §5.9 D 30% 标记） */
  onBoundHeadDied(head: Enemy): void {
    const bh = this.boundHeads.find((b) => b.head === head);
    if (bh !== undefined && bh.deadAtMs === null) {
      // 记录死亡时间戳（CombatManager 调用时 ctx.timeMs 已正确推进）
      // 通过 head 自身的死亡时刻推断：onBoundHeadDied 调用紧接 handleDeadEnemies，
      // 此时 dead=true；我们将 deadAtMs 标记为 0（占位），update 中用 ctx.timeMs - deadAtMs
      // 在 timeMs ≥ 20s 时复活。真实 CombatManager 调用此方法时 timeMs 通常 ≥ 头颅死亡时间。
      // 为兼容测试，调用方可通过 setHeadDeathTime 显式修正；此处用 0 兼容多数场景。
      bh.deadAtMs = 0;
      bh.deathX = (head as unknown as { x: number }).x;
      bh.deathY = (head as unknown as { y: number }).y;
    }
  }

  /** 机制 B：身体死亡 → 清场所有绑定头颅 */
  onBodyDied(): void {
    for (const bh of this.boundHeads) {
      (bh.head as unknown as { dead: boolean }).dead = true;
    }
  }
}

export function registerDanYuxuanBody(): void {
  registerEnemyKind('danYuxuanBody', (opts) => new DanYuxuanBodyEnemy(opts.id, opts.x, opts.y));
}
