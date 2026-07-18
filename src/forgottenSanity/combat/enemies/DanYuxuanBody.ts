// src/forgottenSanity/combat/enemies/DanYuxuanBody.ts
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

  update(_deltaMs: number, ctx: EnemyUpdateContext): void {
    // 身体非攻击性，不走三态机；aiState 始终 idle。
    // spec §5.9 grill 补充：召唤计时器由 CombatManager 通过 tickSummonTimer 始终按真实时间推进。
    // 此处仅做触发判定（update 可能被远房降级为 4Hz，但触发检查无副作用）。
    // 机制 C：复活逻辑由 CombatManager 通过 tickHeadRevive 驱动（spec §5.9 C，按真实 timeMs 推进）。

    // 机制 A：召唤血瞳头颅（30s 真实时间，由 tickSummonTimer 推进 summonTimer）
    if (this.summonTimer <= 0) {
      this.summonTimer = SUMMON_INTERVAL_MS;
      this.trySummon(ctx);
    }
  }

  /** spec §5.9 A: 召唤计时器始终按真实时间推进（远房降级例外）。
   *  由 CombatManager.update 每帧调用，不受 4Hz 降级影响。 */
  tickSummonTimer(deltaMs: number): void {
    if (this.dead) return;
    this.summonTimer -= deltaMs;
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
  onBoundHeadDied(head: Enemy, timeMs: number): void {
    const bh = this.boundHeads.find((b) => b.head === head);
    if (bh !== undefined && bh.deadAtMs === null) {
      // 记录真实死亡时刻 timeMs（spec §5.9 C：按真实时间推进 20s 复活）
      bh.deadAtMs = timeMs;
      bh.deathX = (head as unknown as { x: number }).x;
      bh.deathY = (head as unknown as { y: number }).y;
    }
  }

  /** 机制 B：身体死亡 → 清场所有绑定头颅 */
  onBodyDied(): void {
    for (const bh of this.boundHeads) {
      (bh.head as unknown as { dead: boolean }).dead = true;
    }
    this.boundHeads = [];
  }

  /**
   * 机制 C：推进头颅复活检查（spec §5.9 C）。
   * 由 CombatManager.update 每帧调用，按真实 timeMs 判定 20s 复活到期。
   * 复活时通过 spawnFn 生成新头颅替换旧条目（原位死亡坐标）。
   * 返回本次 tick 复活的头颅数量。
   */
  tickHeadRevive(
    nowMs: number,
    spawnFn: (kind: EnemyKind, x: number, y: number, parentId: string) => Enemy | null,
  ): number {
    if (this.dead) return 0;
    let revived = 0;
    for (let i = this.boundHeads.length - 1; i >= 0; i--) {
      const bh = this.boundHeads[i]!;
      if (bh.deadAtMs === null) continue;
      if (nowMs - bh.deadAtMs >= REVIVE_MS) {
        const newHead = spawnFn('butYuxuanHeadBloodEye', bh.deathX, bh.deathY, this.id);
        if (newHead !== null) {
          this.boundHeads.splice(i, 1);
          this.boundHeads.push({
            head: newHead,
            deadAtMs: null,
            deathX: bh.deathX,
            deathY: bh.deathY,
          });
          revived += 1;
        }
      }
    }
    return revived;
  }

  /** 测试钩子：注入绑定头颅（不经过召唤流程） */
  __testInjectBoundHead(head: Enemy): void {
    this.boundHeads.push({
      head,
      deadAtMs: null,
      deathX: (head as unknown as { x: number }).x ?? 0,
      deathY: (head as unknown as { y: number }).y ?? 0,
    });
  }

  /** 测试钩子：以 fake spawnFn 推进复活检查，返回是否复活了至少一个头颅 */
  __testTickRevive(nowMs: number): boolean {
    let revived = 0;
    const spawnFn = (_kind: EnemyKind, x: number, y: number, _pid: string): Enemy => {
      const fakeHead = { id: `revived-${nowMs}`, dead: false, x, y } as unknown as Enemy;
      revived += 1;
      return fakeHead;
    };
    this.tickHeadRevive(nowMs, spawnFn);
    return revived > 0;
  }
}

export function registerDanYuxuanBody(): void {
  registerEnemyKind('danYuxuanBody', (opts) => new DanYuxuanBodyEnemy(opts.id, opts.x, opts.y));
}
