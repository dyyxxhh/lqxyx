// src/forgottenSanity/combat/Enemy.ts
// 缄默者基类 + 共享类型 + Factory 注册表。
// 核心 AI 逻辑纯 TS（无 Phaser import）；EnemyViewRenderer（Task 15）才用 import type Phaser。
// spec §3.3 / §5 / §5.11.10（grill 2026-07-17 补全 perception/aiState）
import type {
  DamageCategory,
  DamageInstance,
  Debuff,
} from './DamageType';

// ---------------------------------------------------------------------------
// 共享类型
// ---------------------------------------------------------------------------
export interface Vec2 {
  x: number;
  y: number;
}

/** 接触灼烧（杨云红边二阶段接触附加 burn） */
export interface ContactBurn {
  readonly dps: number;
  readonly durationMs: number;
}

/** 程序绘制种类（EnemyViewRenderer 据此分派绘制） */
export type ProceduralKind =
  | 'bloodHand'
  | 'floatingEye'
  | 'chalkDust'
  | 'danYuxuanOrb'      // 但宇轩头颅追踪弹
  | 'bloodEyeOrb'       // 血瞳头颅追踪弹
  | 'woodChip'          // 桌椅木屑
  | 'phoneRedCircle'    // 电话红圈预警
  | 'phoneExplosion'    // 电话爆炸
  | 'phoneRinging'      // 电话振铃区
  | 'screamWave'        // 秦浩睿尖叫波
  | 'floorCrackWave'    // 杨云红边地裂波
  | 'laserBeam'         // 漂浮眼球激光
  | 'chairObstacle'     // 桌椅落地椅子障碍
  // plan 4 武器特效（玩家侧投射物 & 区域）
  | 'rulerShard'        // 断尺尺屑（投射物）
  | 'chalkThrow'        // 粉笔投掷（投射物）
  | 'bladeCrescent'     // 灵刃月牙剑气（投射物）
  | 'chalkBomb'         // 粉笔爆弹（区域）
  | 'rulerStorm'        // 尺子风暴（区域）
  | 'fistDash'          // 拳套冲拳（区域）
  | 'chainCrush'        // 锁链万锁绞杀（区域）
  | 'bloodWheel'        // 血镰血轮（区域）
  | 'soulCapture';      // 万魂幡拘魂（区域）

/** 缄默者种类（11 种） */
export type EnemyKind =
  | 'butYuxuanHead'           // ① 但宇轩头颅
  | 'qinHaoruiHead'           // ② 秦浩睿头颅
  | 'deskChairs'              // ③ 桌椅
  | 'phone'                   // ④ 电话
  | 'bloodHand'               // ⑤ 血手（程序绘制）
  | 'floatingEye'             // ⑥ 漂浮眼球（程序绘制）
  | 'chalkDust'               // ⑦ 粉笔尘云（程序绘制）
  | 'butYuxuanHeadBloodEye'   // ⑧ 但宇轩头颅·血瞳
  | 'danYuxuanBody'           // ⑨ 召唤核心
  | 'yangYunRed'              // ⑩ 精英
  | 'yangYunRedPhantom';      // ⑪ 精英影分身幻影

// ---------------------------------------------------------------------------
// 感知 / 三态机 (spec §5.11.10，grill 2026-07-17)
// ---------------------------------------------------------------------------
export type EnemyAIState = 'idle' | 'alert' | 'chase' | 'search';

export interface EnemyPerceptionParams {
  readonly visionRange: number;          // 视野半径 px
  readonly visionHalfAngleDeg: number;   // 视野半角，固定 60（即 120° 锥）
  readonly noiseSensitivity: number;     // 噪声敏感度倍率
  readonly alertToChaseMs: number | 'instant';  // 警觉→追击
  readonly chaseToSearchMs: number;      // 追击→搜索
  readonly searchToAlertMs: number;      // 搜索→警觉
  readonly alertToIdleMs: number;        // 警觉→待机
  readonly patrolKind: 'static' | 'wander';
  readonly patrolRadius?: number;        // wander 时
  readonly patrolSpeed?: number;         // wander 时
  readonly patrolSegmentMs?: number;     // wander 时
  /** 静物 360° 规则（spec §5.11.2）：自身静止时视野 360°，半径 ×0.7。
   *  静物类（血手/桌椅/电话/粉笔尘云）+ 漂浮眼球为 true；头颅类为 false。 */
  readonly static360Vision?: boolean;
}

/** 玩家噪声事件（CombatManager 每帧从 PlayerCombat.lastNoiseRadius 构造） */
export interface PlayerNoiseEvent {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

// ---------------------------------------------------------------------------
// 战斗 RNG（mulberry32，plan 3 自带，不依赖 plan 2）
// ---------------------------------------------------------------------------
export interface CombatRng {
  next(): number;                          // [0,1)
  int(min: number, max: number): number;   // [min,max] 整数
  chance(probability: number): boolean;    // 概率
  pick<T>(items: readonly T[]): T;         // 随机选 1
}

export function createCombatRng(seed: number): CombatRng {
  let state = seed >>> 0;
  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick from empty');
      return items[Math.floor(next() * items.length)]!;
    },
  };
}

/** 弹幕（CombatManager 持有并推进） */
export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  damage: number;
  category: DamageCategory;
  debuff?: Debuff;
  homingTarget: 'player' | null;
  homingStrength: number; // 转向速率 rad/s
  remainingMs: number;
  radius: number;
  proceduralKind: ProceduralKind;
  ownerId: string;
}

/** 区域效果（CombatManager 持有并推进） */
export interface ZoneEffect {
  id: string;
  shape: 'circle' | 'rect';
  x: number;
  y: number;
  radius: number;          // circle
  width: number;           // rect
  height: number;          // rect
  angle: number;           // rect 旋转（弧度），0 = +X 轴
  vx: number;              // 中心移动 px/s
  vy: number;
  expandSpeed: number;     // 半径增长 px/s（0 = 不扩展）
  maxRadius: number;       // 扩展上限
  windupMs: number;        // 预警阶段，无伤害
  burstDamage: number;     // windup 结束瞬间结算（玩家在范围内）
  damagePerSecond: number; // windup 后持续 DoT
  category: DamageCategory;
  debuff?: Debuff;
  remainingMs: number;     // 总寿命（含 windup）
  applyDebuffOnce: boolean;
  debuffApplied: boolean;
  proceduralKind: ProceduralKind;
  ownerId: string;
}

/** 敌人更新上下文（CombatManager 每帧提供） */
export interface EnemyUpdateContext {
  readonly playerPosition: Vec2;
  readonly timeMs: number;
  readonly rng: CombatRng;
  readonly playerNoise: PlayerNoiseEvent | null; // grill 2026-07-17：噪声事件
  spawnProjectile(p: Projectile): void;
  spawnZone(z: ZoneEffect): void;
  spawnEnemy(kind: EnemyKind, position: Vec2, parentId?: string): Enemy | null;
  isWalkable(x: number, y: number): boolean;
}

/** 敌人视图元数据（EnemyViewRenderer 读取） */
export interface EnemyViewMetadata {
  readonly textureKey: string | null;
  readonly proceduralKind: ProceduralKind | null;
  tint: { color: number; alpha: number } | null; // 幻影半透明
  overlay: 'bloodEye' | null;                     // 血瞳头颅叠加
}

/** 敌人构造选项 */
export interface EnemyConstructorOpts {
  id: string;
  x: number;
  y: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  contactRadius: number;
}

// ---------------------------------------------------------------------------
// Enemy 抽象基类
// ---------------------------------------------------------------------------
export abstract class Enemy implements EnemyViewMetadata {
  abstract readonly kind: EnemyKind;
  readonly id: string;
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly contactDamage: number;
  readonly contactRadius: number;
  dead = false;
  contactCooldownMs = 0;
  invulnMs = 0;                              // 无敌帧（桌椅翻桌期间）
  parentId: string | null = null;            // 绑定身体（召唤核心头颅）
  /** spec §5.11.7: 当前所在房间 ID，用于远房 4Hz 降级判定。AI 跨门时由场景更新。 */
  currentRoomId: string | null = null;
  /** spec §9.3: 红边击杀后复制体标记，用于阻止递归复制。默认 false。 */
  isDuplicate = false;
  contactBurn: ContactBurn | null = null;    // 接触附加 burn（杨云红边二阶段）
  /** 接触伤害覆盖（spec §5.10 杨云红边冲撞期间 contactDamageOverride=50）。
   *  null 表示用 contactDamage；非 null 表示用 override 值。 */
  contactDamageOverride: number | null = null;
  abstract readonly textureKey: string | null;
  abstract readonly proceduralKind: ProceduralKind | null;
  /** 三态机感知参数（spec §5.11.10，子类提供） */
  abstract readonly perception: EnemyPerceptionParams;
  tint: { color: number; alpha: number } | null = null;
  overlay: 'bloodEye' | null = null;

  // ===========================================================================
  // spec#5 §4.2：可选钩子 — 子类按需实现，取代 CombatManager duck-typing。
  // 基类实例未实现时为 undefined，调用方通过 ?. 短路保证安全。
  // ===========================================================================
  /** 杨云红边中立/敌对状态（YangYunRedEnemy 实现） */
  aggroState?: 'neutral' | 'hostile';
  /** 中立 → 敌对激怒（YangYunRedEnemy 实现） */
  enrage?(): void;
  /** 召唤核心召唤计时器推进（DanYuxuanBodyEnemy 实现，spec §5.9 A） */
  tickSummonTimer?(deltaMs: number): void;
  /** 召唤核心头颅复活检查（DanYuxuanBodyEnemy 实现，spec §5.9 C） */
  tickHeadRevive?(
    nowMs: number,
    spawnFn: (kind: EnemyKind, x: number, y: number, parentId: string) => Enemy | null,
  ): number;
  /** 身体死亡 → 清场绑定头颅（DanYuxuanBodyEnemy 实现，spec §5.9 B） */
  onBodyDied?(): void;
  /** 绑定头颅死亡通知（DanYuxuanBodyEnemy 实现，spec §5.9 B/C） */
  onBoundHeadDied?(head: Enemy, timeMs: number): void;

  // 三态机状态（grill 2026-07-17）
  aiState: EnemyAIState = 'idle';
  /** 最后目击玩家位置（chase/search 用） */
  lastKnownPlayerPos: Vec2 | null = null;
  /** 当前朝向单位向量（视野锥中心轴），默认朝下 (0,1) */
  facingX = 0;
  facingY = 1;
  /** 状态计时器（ms） */
  stateTimerMs = 0;
  /** 追击态脱离视野计时器 */
  lostPlayerTimerMs = 0;
  /** 出生点（巡逻中心） */
  spawnX: number;
  spawnY: number;
  /** 巡逻段计时器（wander 类用） */
  patrolSegmentTimerMs = 0;
  /** 巡逻段目标方向 */
  patrolDirX = 0;
  patrolDirY = 0;

  constructor(opts: EnemyConstructorOpts) {
    this.id = opts.id;
    this.x = opts.x;
    this.y = opts.y;
    this.spawnX = opts.x;
    this.spawnY = opts.y;
    this.maxHp = opts.maxHp;
    this.hp = opts.maxHp;
    this.speed = opts.speed;
    this.contactDamage = opts.contactDamage;
    this.contactRadius = opts.contactRadius;
  }

  applyDamage(instance: DamageInstance): void {
    if (this.dead || this.invulnMs > 0 || instance.amount <= 0) return;
    this.hp = Math.max(0, this.hp - instance.amount);
    if (this.hp <= 0) this.dead = true;
  }

  // ===========================================================================
  // plan 4: 武器 debuff 状态追踪（burn/stun/root/fear）— 加法式，plan 3 敌人无状态时 no-op
  // ===========================================================================
  private statusBurn: { dps: number; remainingMs: number } | null = null;
  private statusStunMs = 0;
  private statusRootMs = 0;
  private statusFear: { remainingMs: number; sourceX: number; sourceY: number } | null = null;

  /** 应用武器 debuff（burn DoT / stun / root / fear）。不修改既有 applyDamage 行为。 */
  applyDebuff(debuff: Debuff): void {
    if (this.dead) return;
    switch (debuff.type) {
      case 'burn':
        // M5: burn DPS 累加（多次 burn 命中 → DPS 相加），duration 取 max（不缩短）
        if (this.statusBurn === null) {
          this.statusBurn = { dps: debuff.dps, remainingMs: debuff.remainingMs };
        } else {
          this.statusBurn.dps += debuff.dps;
          this.statusBurn.remainingMs = Math.max(this.statusBurn.remainingMs, debuff.remainingMs);
        }
        break;
      case 'stun':
        this.statusStunMs = Math.max(this.statusStunMs, debuff.remainingMs);
        break;
      case 'root':
        this.statusRootMs = Math.max(this.statusRootMs, debuff.remainingMs);
        break;
      case 'fear':
        this.statusFear = {
          remainingMs: debuff.remainingMs,
          sourceX: debuff.sourceX,
          sourceY: debuff.sourceY,
        };
        break;
      case 'slow':
        // plan 4 敌人不使用 slow 移动门控（武器不含 enemy slow）；记录但无效果
        break;
    }
  }

  /** 推进状态计时器，结算 burn DoT。由 CombatManager 敌人 loop 在 enemy.update 前调用。 */
  tickStatus(deltaMs: number): void {
    if (this.dead) return;
    if (this.statusBurn !== null) {
      const seconds = deltaMs / 1000;
      const dmg = this.statusBurn.dps * seconds;
      if (dmg > 0 && this.invulnMs <= 0) {
        this.hp = Math.max(0, this.hp - dmg);
        if (this.hp <= 0) this.dead = true;
      }
      this.statusBurn.remainingMs -= deltaMs;
      if (this.statusBurn.remainingMs <= 0) this.statusBurn = null;
    }
    if (this.statusStunMs > 0) {
      this.statusStunMs = Math.max(0, this.statusStunMs - deltaMs);
    }
    if (this.statusRootMs > 0) {
      this.statusRootMs = Math.max(0, this.statusRootMs - deltaMs);
    }
    if (this.statusFear !== null) {
      this.statusFear.remainingMs -= deltaMs;
      if (this.statusFear.remainingMs <= 0) this.statusFear = null;
    }
  }

  /** 读取当前 burn 状态（测试与诊断可观察性用）。 */
  getStatusBurn(): { readonly dps: number; readonly remainingMs: number } | null {
    return this.statusBurn;
  }

  isStunned(): boolean {
    return this.statusStunMs > 0;
  }

  isRooted(): boolean {
    return this.statusRootMs > 0;
  }

  getFleeFrom(): { x: number; y: number } | null {
    return this.statusFear === null ? null : { x: this.statusFear.sourceX, y: this.statusFear.sourceY };
  }

  clearStatus(): void {
    this.statusBurn = null;
    this.statusStunMs = 0;
    this.statusRootMs = 0;
    this.statusFear = null;
  }

  distanceTo(x: number, y: number): number {
    const dx = this.x - x;
    const dy = this.y - y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // -- 三态机辅助 setter（子类 / AIUpdateSystem 调用） --
  setAIState(state: EnemyAIState): void {
    this.aiState = state;
    this.stateTimerMs = 0;
    this.lostPlayerTimerMs = 0;
  }

  setLastKnownPlayerPos(pos: Vec2): void {
    this.lastKnownPlayerPos = { x: pos.x, y: pos.y };
  }

  /** 设置朝向（自动归一化）；零向量时保持原朝向 */
  setFacing(dx: number, dy: number): void {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    this.facingX = dx / len;
    this.facingY = dy / len;
  }

  abstract update(deltaMs: number, ctx: EnemyUpdateContext): void;
}

// ---------------------------------------------------------------------------
// Factory 注册表
// ---------------------------------------------------------------------------
type EnemyFactory = (opts: EnemyConstructorOpts) => Enemy;

const ENEMY_FACTORY = new Map<EnemyKind, EnemyFactory>();

export function registerEnemyKind(kind: EnemyKind, factory: EnemyFactory): void {
  ENEMY_FACTORY.set(kind, factory);
}

export function createEnemy(kind: EnemyKind, opts: EnemyConstructorOpts): Enemy | null {
  const factory = ENEMY_FACTORY.get(kind);
  if (factory === undefined) return null;
  return factory(opts);
}

export function isEnemyKindRegistered(kind: EnemyKind): boolean {
  return ENEMY_FACTORY.has(kind);
}
