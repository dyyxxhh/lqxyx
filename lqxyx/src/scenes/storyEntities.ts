export interface StoryEntityDebugEntry {
  readonly id: string;
  readonly textureKey: string;
  readonly floorId: '4F';
  readonly roomId: 'gt1-classroom' | 'gt2-classroom';
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly blocksMovement: false;
}

export type StoryFlags = Readonly<Record<string, boolean>>;

export interface StoryEntityHeadPickupState {
  readonly danYuxuan: boolean;
  readonly qinHaorui: boolean;
}

export interface StoryEntityRenderContext {
  readonly floorId: '4F' | '5F';
  readonly roomId: 'gt1-classroom' | 'gt2-classroom' | string | null;
}

const STORY_ENTITY_DEPTH = 6;

export function buildStoryEntityDebugEntries(flags: StoryFlags, context?: StoryEntityRenderContext, replayHeadPickups?: StoryEntityHeadPickupState | null): StoryEntityDebugEntry[] {
  const entries: StoryEntityDebugEntry[] = [];
  const danYuxuanHeadPickedUp = replayHeadPickups?.danYuxuan ?? flags.danYuxuanHeadPickedUp === true;
  const qinHaoruiHeadPickedUp = replayHeadPickups?.qinHaorui ?? flags.qinHaoruiHeadPickedUp === true;

  // 但宇轩 visual state — priority: head-picked-up > head-only (A-2 ate body) > lying-bloody (A-1 / killed) > lying-clean > standing.
  // After head pickup: render the headless body part — UNLESS A-2 was triggered, in which case the body was already eaten and
  // there is nothing left to show once the head sprite is removed.
  if (danYuxuanHeadPickedUp) {
    if (!flags.danYuxuanBodyGoneHeadOnly) {
      entries.push(createEntry('danYuxuanBodyOnly', 'sprite.danYuxuan.bodyPart', 'gt1-classroom', 760, 520));
    }
  } else if (flags.danYuxuanBodyGoneHeadOnly) {
    entries.push(createEntry('danYuxuanHeadOnly', 'sprite.danYuxuan.headPart', 'gt1-classroom', 760, 520));
  } else if (flags.danYuxuanBodyProneAndBloody) {
    entries.push(createEntry('danYuxuanProneBloody', 'sprite.danYuxuan.lyingBloody', 'gt1-classroom', 760, 520));
  } else if (flags.danYuxuanBodyProneClean) {
    entries.push(createEntry('danYuxuanProneClean', 'sprite.danYuxuan.lyingClean', 'gt1-classroom', 760, 520));
  } else if (flags.danYuxuanStandingVisible) {
    entries.push(createEntry('danYuxuanStanding', 'sprite.danYuxuan.standRight', 'gt1-classroom', 760, 520));
  }

  // 秦浩睿 visual state — always shown as a full body until the head is picked up; pickup leaves only the body part behind.
  if (qinHaoruiHeadPickedUp) {
    entries.push(createEntry('qinHaoruiBodyOnly', 'sprite.qinHaorui.bodyPart', 'gt2-classroom', 760, 330));
  } else if (flags.qinHaoruiStandingVisible) {
    entries.push(createEntry('qinHaoruiStanding', 'sprite.qinHaorui.standRight', 'gt2-classroom', 760, 330));
  } else if (flags.qinHaoruiBodyBloodyOnGround) {
    entries.push(createEntry('qinHaoruiProneBloody', 'sprite.qinHaorui.lyingBloody', 'gt2-classroom', 760, 330));
  }

  return context ? entries.filter((entry) => entry.floorId === context.floorId && entry.roomId === context.roomId) : entries;
}

function createEntry(id: string, textureKey: string, roomId: StoryEntityDebugEntry['roomId'], x: number, y: number): StoryEntityDebugEntry {
  return { id, textureKey, floorId: '4F', roomId, x, y, depth: STORY_ENTITY_DEPTH, blocksMovement: false };
}
