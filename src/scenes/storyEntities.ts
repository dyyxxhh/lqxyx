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

export interface StoryEntityRenderContext {
  readonly floorId: '4F' | '5F';
  readonly roomId: 'gt1-classroom' | 'gt2-classroom' | string | null;
}

const STORY_ENTITY_DEPTH = 6;

export function buildStoryEntityDebugEntries(flags: StoryFlags, context?: StoryEntityRenderContext): StoryEntityDebugEntry[] {
  const entries: StoryEntityDebugEntry[] = [];

  if (flags.danYuxuanBodyGoneHeadOnly) {
    entries.push(createEntry('danYuxuanHeadOnly', 'sprite.danYuxuan.headPart', 'gt1-classroom', 760, 520));
  } else if (flags.danYuxuanBodyProneAndBloody) {
    entries.push(createEntry('danYuxuanProneBloody', 'sprite.danYuxuan.lyingBloody', 'gt1-classroom', 760, 520));
  } else if (flags.danYuxuanBodyProneClean) {
    entries.push(createEntry('danYuxuanProneClean', 'sprite.danYuxuan.lyingClean', 'gt1-classroom', 760, 520));
  } else if (flags.danYuxuanStandingVisible) {
    entries.push(createEntry('danYuxuanStanding', 'sprite.danYuxuan.standRight', 'gt1-classroom', 760, 520));
  }

  if (flags.qinHaoruiStandingVisible) {
    entries.push(createEntry('qinHaoruiStanding', 'sprite.qinHaorui.standRight', 'gt2-classroom', 760, 330));
  } else if (flags.qinHaoruiBodyBloodyOnGround) {
    entries.push(createEntry('qinHaoruiProneBloody', 'sprite.qinHaorui.lyingBloody', 'gt2-classroom', 760, 330));
  }

  if (flags.headPickupPartsVisible) {
    entries.push(createEntry('danYuxuanHeadPickup', 'sprite.danYuxuan.headPart', 'gt1-classroom', 720, 360));
    entries.push(createEntry('qinHaoruiHeadPickup', 'sprite.qinHaorui.headPart', 'gt2-classroom', 800, 360));
  }

  return context ? entries.filter((entry) => entry.floorId === context.floorId && entry.roomId === context.roomId) : entries;
}

function createEntry(id: string, textureKey: string, roomId: StoryEntityDebugEntry['roomId'], x: number, y: number): StoryEntityDebugEntry {
  return { id, textureKey, floorId: '4F', roomId, x, y, depth: STORY_ENTITY_DEPTH, blocksMovement: false };
}
