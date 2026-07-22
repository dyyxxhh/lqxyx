// src/forgottenSanity/notes/assignNoteContent.ts
// 纯函数：根据持久化 nextSequentialIndex、本局 readNoteInstancesThisRun、instanceId 决定
// 某张纸条实例本次阅读应显示的内容索引。
// spec §4：每张实例首次阅读锁定；重读返回锁定值不推进；顺序阶段推进并持久化；
//          随机阶段（nextSequentialIndex >= 9）不持久化、不去重。

import { NOTE_CONTENT_COUNT } from "./noteContent";

export interface AssignNoteContentInput {
  /** 跨局持久化的「下一条顺序索引」（0..9）。>=9 表示已看完全部，进入随机阶段。 */
  readonly nextSequentialIndex: number;
  /** 本局已读纸条实例 -> 锁定的内容索引。本局内存，不持久化。 */
  readonly readThisRun: Map<string, number>;
  /** 当前正在阅读的纸条实例 ID。 */
  readonly instanceId: string;
  /** [0, 1) 随机数生成器（随机阶段用）。 */
  readonly rng: () => number;
}

export interface AssignNoteContentResult {
  /** 本次阅读应显示的内容索引（0..8）。 */
  readonly contentIndex: number;
  /** 调用后应写入持久化的新 nextSequentialIndex。 */
  readonly newNextSequentialIndex: number;
  /** 是否需要持久化 newNextSequentialIndex（仅顺序阶段首次阅读为 true）。 */
  readonly persisted: boolean;
}

export function assignNoteContent(input: AssignNoteContentInput): AssignNoteContentResult {
  const { nextSequentialIndex, readThisRun, instanceId, rng } = input;

  // 重读：返回本局锁定值，不推进，不持久化
  const locked = readThisRun.get(instanceId);
  if (locked !== undefined) {
    return { contentIndex: locked, newNextSequentialIndex: nextSequentialIndex, persisted: false };
  }

  // 随机阶段：从未看过的内容中均匀随机；本局锁定但不持久化、不推进
  if (nextSequentialIndex >= NOTE_CONTENT_COUNT) {
    const contentIndex = Math.floor(rng() * NOTE_CONTENT_COUNT);
    return { contentIndex, newNextSequentialIndex: nextSequentialIndex, persisted: false };
  }

  // 顺序阶段：分配当前索引，推进，持久化
  return {
    contentIndex: nextSequentialIndex,
    newNextSequentialIndex: nextSequentialIndex + 1,
    persisted: true,
  };
}
