import type { FloorId, RoomId } from './maps';

export type ActId = "act-1" | "act-2" | "act-3";
export type CheckpointId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
export type BranchId = "A-1" | "A-2" | "B-1" | "B-2";
export type CharacterId = "yangYunBlue" | "yangYunRed" | "dongJihao" | "danYuxuan" | "qinHaorui" | "unknown";

export interface StoryCommandCondition {
  flag: string;
  equals: boolean;
}

export interface StoryPoint {
  x: number;
  y: number;
}

export interface StoryProximityTarget {
  id: string;
  floorId: FloorId;
  roomId: RoomId | null;
  point: StoryPoint;
  radiusPx: number;
}

export interface StoryVisibilityRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoryVisibilityTarget {
  id: string;
  floorId: FloorId;
  roomId: RoomId | null;
  rect: StoryVisibilityRect;
}

export interface StoryScriptedMovementTarget {
  id: string;
  target: StoryPoint;
  durationMs: number;
  tolerancePx: number;
}

export interface StoryPhysicalTargetPoint extends StoryPoint {
  radiusPx: number;
}

export interface StoryPhysicalTarget {
  floorId: FloorId;
  roomId: RoomId | null;
  points: readonly StoryPhysicalTargetPoint[];
}

export type StoryPhysicalTargetRequirement = StoryPhysicalTarget | readonly StoryPhysicalTarget[];

export type StoryCommand = (
  | { type: "checkpoint"; id: CheckpointId }
  | { type: "gotoCheckpoint"; id: CheckpointId }
  | { type: "task"; text: string }
  | { type: "dialogue"; speaker: string; text: string; tone?: string; bodyAction?: string }
  | { type: "switchCharacter"; characterId: CharacterId; visibleName: string; control: "player" | "scripted" | "hidden" }
  | { type: "setControl"; enabled: boolean; reason: string; scriptedMovementId?: string }
  | { type: "wait"; durationMs: number; label: string }
  | { type: "blackScreenDialogueWait"; durationMs: 500; label: string }
  | { type: "fade"; direction: "in" | "out"; durationMs: number }
  | { type: "blackScreen"; durationMs: number; asset?: string }
  | { type: "deathFlash"; id: "celery" | "ruler"; sequence: DeathFlashFrame[] }
  | { type: "branch"; id: BranchId; trigger: string }
  | { type: "timer"; id: string; action: "start" | "stop" | "reset"; durationMs?: number; trigger?: string; visibilityTargetId?: string }
  | { type: "awaitView"; visibilityTargetId: string; reason: string }
  | { type: "interaction"; input: "F" | "Q" | "choice" | "proximity" | "timer"; target: string; result: string; proximityTargetId?: string; physicalTarget?: StoryPhysicalTargetRequirement }
  | { type: "setFlag"; id: string; value: boolean }
  | { type: "switchView"; characterId: CharacterId; location: string; visibility?: string; locationState?: { floorId: FloorId; roomId: RoomId | null }; position?: StoryPoint; facing?: "up" | "down" | "left" | "right" }
  | { type: "ending"; id: string; title: string; subtitle?: string; returnsToCheckpoint?: CheckpointId }
  | { type: "curtain"; title: "下一幕"; subtitle: "敬请期待" }
  | { type: "blockDoor"; doorId: string; message: string; speaker?: string }
  | { type: "unblockDoor"; doorId: string }
) & { condition?: StoryCommandCondition };

export interface DeathFlashFrame {
  background: "bloodBlack" | "white" | "black";
  image?: "blackCelery" | "whiteCelery" | "largeBlackCelery" | "largeWhiteCelery" | "ruler";
  durationMs: number;
}

export interface StoryCheckpoint {
  id: CheckpointId;
  label: string;
  location: string;
  task: string;
  playableCharacter: CharacterId;
  commands: StoryCommand[];
}

export interface StoryBranch {
  id: BranchId;
  label: string;
  trigger: string;
  fromCheckpoint: CheckpointId;
  rejoinsCheckpoint?: CheckpointId;
  commands: StoryCommand[];
}

export interface StoryTimer {
  id: string;
  durationMs: number;
  startsAt: CheckpointId | BranchId;
  result: string;
}

export interface StoryEnding {
  id: string;
  title: string;
  kind: "minor" | "major";
  trigger: string;
  returnsToCheckpoint?: CheckpointId;
}

export interface StoryCharacter {
  id: CharacterId;
  displayName: string;
  internalState?: string;
}

export interface StoryAct {
  id: ActId;
  title: string;
  status: "playable" | "reserved";
  checkpoints: StoryCheckpoint[];
  branches: StoryBranch[];
  timers: StoryTimer[];
  tasks: string[];
  endings: StoryEnding[];
  characters: StoryCharacter[];
  proximityTargets?: StoryProximityTarget[];
  visibilityTargets?: StoryVisibilityTarget[];
  scriptedMovementTargets?: StoryScriptedMovementTarget[];
  curtain?: { title: "下一幕"; subtitle: "敬请期待" };
  notes?: string[];
}

export interface StoryManifest {
  title: string;
  source: "第一幕剧本.txt";
  acts: StoryAct[];
}

const celeryDeathFlash: DeathFlashFrame[] = [
  { background: "bloodBlack", durationMs: 1_000 },
  { background: "white", image: "blackCelery", durationMs: 500 },
  { background: "black", image: "whiteCelery", durationMs: 500 },
  { background: "white", image: "blackCelery", durationMs: 300 },
  { background: "black", image: "whiteCelery", durationMs: 300 },
  { background: "white", image: "largeBlackCelery", durationMs: 100 },
  { background: "black", image: "largeWhiteCelery", durationMs: 100 },
  { background: "white", image: "largeBlackCelery", durationMs: 100 },
  { background: "black", image: "largeWhiteCelery", durationMs: 100 },
  { background: "white", image: "largeBlackCelery", durationMs: 100 },
  { background: "black", image: "largeWhiteCelery", durationMs: 100 },
  { background: "bloodBlack", durationMs: 1_000 },
];

const rulerDeathFlash: DeathFlashFrame[] = [
  { background: "black", durationMs: 1_000 },
  { background: "white", image: "ruler", durationMs: 500 },
  { background: "black", image: "ruler", durationMs: 500 },
  { background: "black", durationMs: 1_000 },
];

export const firstActCheckpoints: StoryCheckpoint[] = [
  {
    id: "A",
    label: "在4楼寻找躲在GT1教室的但宇轩",
    location: "4F corridor and GT1 classroom",
    task: "无",
    playableCharacter: "yangYunRed",
    commands: [
      { type: "switchCharacter", characterId: "yangYunBlue", visibleName: "杨云", control: "player" },
      { type: "dialogue", speaker: "？？？", text: "皇上不好了，秦妃娘娘又被但公公拐跑了" },
      { type: "dialogue", speaker: "杨云", text: "大胆！但宇轩！！可别让我抓到你。" },
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "player" },
      { type: "setFlag", id: "danYuxuanStandingVisible", value: true },
      { type: "task", text: "找到但宇轩" },
      { type: "dialogue", speaker: "杨云", text: "但宇轩……听着也很好吃呢。" },
      { type: "interaction", input: "proximity", target: "但宇轩 near GT1 classroom", result: "触发搓手对白", proximityTargetId: "checkpoint-a-dan-yuxuan-gt1" },
      { type: "checkpoint", id: "A" },
      { type: "task", text: "无" },
      { type: "dialogue", speaker: "杨云", text: "我要搓手。" },
      { type: "gotoCheckpoint", id: "B" },
    ],
  },
  {
    id: "B",
    label: "运气波后砍伤但宇轩",
    location: "GT1 classroom",
    task: "无",
    playableCharacter: "yangYunRed",
    commands: [
      { type: "checkpoint", id: "B" },
      { type: "dialogue", speaker: "杨云", text: "运" },
      { type: "dialogue", speaker: "但宇轩", text: "运" },
      { type: "dialogue", speaker: "杨云", text: "运" },
      { type: "dialogue", speaker: "但宇轩", text: "气波" },
      { type: "dialogue", speaker: "但宇轩", text: "你废……" },
      { type: "dialogue", speaker: "杨云", text: "我可不是什么君子。", bodyAction: "趁但宇轩不注意，一刀砍向他" },
      { type: "dialogue", speaker: "但宇轩", text: "……物吧", bodyAction: "捂着肩膀，满脸震惊" },
      { type: "blackScreen", durationMs: 1_000, asset: "血迹黑屏" },
      { type: "blackScreenDialogueWait", durationMs: 500, label: "血迹黑屏对白后等待" },
      { type: "setFlag", id: "danYuxuanStandingVisible", value: false },
      { type: "setFlag", id: "danYuxuanBodyProneAndBloody", value: true },
      { type: "switchCharacter", characterId: "yangYunBlue", visibleName: "杨云", control: "player" },
      { type: "dialogue", speaker: "杨云", text: "我干了什么？！！！" },
      { type: "gotoCheckpoint", id: "C" },
    ],
  },
  {
    id: "C",
    label: "尸体附近选择去看芹菜或超时自动吃掉但宇轩",
    location: "GT1 classroom near Dan Yuxuan body",
    task: "无",
    playableCharacter: "yangYunBlue",
    commands: [
      { type: "checkpoint", id: "C" },
      { type: "setControl", enabled: true, reason: "用户可以操纵杨云" },
      { type: "awaitView", visibilityTargetId: "checkpoint-c-dan-yuxuan-body-gt1", reason: "等待但宇轩尸体进入视野" },
      { type: "timer", id: "A-2-auto-eat-dan-yuxuan", action: "start", durationMs: 10_000, trigger: "10s 未选择 A-1 且视野内有但宇轩尸体", visibilityTargetId: "checkpoint-c-dan-yuxuan-body-gt1" },
      { type: "branch", id: "A-1", trigger: "选择：让我去看看芹菜怎么样了" },
    ],
  },
  {
    id: "D",
    label: "秦浩睿死亡后杨云无助并前往办公室",
    location: "GT2 classroom",
    task: "去办公室",
    playableCharacter: "yangYunRed",
    commands: [
      { type: "checkpoint", id: "D" },
      { type: "task", text: "无" },
      { type: "setFlag", id: "qinHaoruiStandingVisible", value: false },
      { type: "setFlag", id: "qinHaoruiBodyBloodyOnGround", value: true },
      { type: "switchCharacter", characterId: "yangYunBlue", visibleName: "杨云", control: "player" },
      { type: "dialogue", speaker: "杨云", text: "……" },
      { type: "dialogue", speaker: "杨云", text: "我该怎么办？", tone: "无助地" },
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "player" },
      { type: "task", text: "去办公室" },
      { type: "interaction", input: "F", target: "办公室门口两门任一", result: "进入办公室过渡", physicalTarget: { floorId: "4F", roomId: null, points: [{ x: 832, y: 868, radiusPx: 48 }, { x: 832, y: 1028, radiusPx: 48 }] } },
      { type: "fade", direction: "out", durationMs: 500 },
      { type: "blackScreen", durationMs: 1_000 },
      { type: "blackScreenDialogueWait", durationMs: 500, label: "办公室入场黑屏对白等待" },
      { type: "gotoCheckpoint", id: "E" },
    ],
  },
  {
    id: "E",
    label: "董继豪发现秦浩睿尸体后视角切回杨云",
    location: "GT2 classroom front door then office doorway",
    task: "前往五楼关闭学校通信",
    playableCharacter: "yangYunRed",
    commands: [
      { type: "checkpoint", id: "E" },
      { type: "task", text: "无" },
      { type: "switchView", characterId: "dongJihao", location: "GT2 班内前门", locationState: { floorId: "4F", roomId: "gt2-classroom" }, position: { x: 772, y: 144 }, facing: "left" },
      { type: "fade", direction: "in", durationMs: 500 },
      { type: "switchCharacter", characterId: "dongJihao", visibleName: "董继豪", control: "scripted" },
      { type: "setControl", enabled: false, reason: "董继豪自动走向秦浩睿尸体", scriptedMovementId: "dong-jihao-to-qin-haorui-body" },
      { type: "dialogue", speaker: "董继豪", text: "我操！真的假的？芹菜你别吓我。" },
      { type: "dialogue", speaker: "董继豪", text: "真的……", tone: "震惊、悲痛地" },
      { type: "fade", direction: "out", durationMs: 500 },
      { type: "switchView", characterId: "yangYunRed", location: "办公室门口，人物朝向向左", locationState: { floorId: "4F", roomId: null }, position: { x: 796, y: 868 }, facing: "left" },
      { type: "fade", direction: "in", durationMs: 500 },
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "player" },
      { type: "dialogue", speaker: "杨云", text: "搞定了" },
      { type: "task", text: "前往五楼关闭学校通信" },
      { type: "interaction", input: "F", target: "五楼学校通信", result: "关闭学校通信", physicalTarget: { floorId: "5F", roomId: "communication-control-5f", points: [{ x: 620, y: 240, radiusPx: 48 }] } },
      { type: "task", text: "无" },
      { type: "dialogue", speaker: "杨云", text: "让我猜猜，还有谁？" },
      { type: "fade", direction: "out", durationMs: 500 },
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "hidden" },
      { type: "switchView", characterId: "dongJihao", location: "GT2 秦浩睿尸体附近", visibility: "董继豪位置不变", locationState: { floorId: "4F", roomId: "gt2-classroom" }, position: { x: 760, y: 330 }, facing: "down" },
      { type: "fade", direction: "in", durationMs: 500 },
      { type: "gotoCheckpoint", id: "F" },
    ],
  },
  {
    id: "F",
    label: "董继豪前往办公室报警",
    location: "GT2 classroom to office phone",
    task: "前往办公室报警",
    playableCharacter: "dongJihao",
    commands: [
      { type: "checkpoint", id: "F" },
      { type: "switchCharacter", characterId: "dongJihao", visibleName: "董继豪", control: "player" },
      { type: "task", text: "前往办公室报警" },
      { type: "interaction", input: "F", target: "办公室电话", result: "拨打 9110", physicalTarget: { floorId: "4F", roomId: "office-4f", points: [{ x: 620, y: 180, radiusPx: 48 }] } },
      { type: "dialogue", speaker: "董继豪", text: "……坏了。", bodyAction: "按 9110" },
      { type: "task", text: "无" },
    ],
  },
  {
    id: "G",
    label: "报警失败后的分支选择",
    location: "office",
    task: "无",
    playableCharacter: "dongJihao",
    commands: [
      { type: "checkpoint", id: "G" },
      { type: "branch", id: "B-1", trigger: "选择：去找校长" },
      { type: "branch", id: "B-2", trigger: "选择：思索" },
    ],
  },
  {
    id: "H",
    label: "董继豪偷手机报警并躲避复现杨云",
    location: "GT1/GT2 and five-floor communication control",
    task: "去班里偷同学手机报警",
    playableCharacter: "dongJihao",
    commands: [
      { type: "task", text: "无" },
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "hidden" },
      { type: "switchView", characterId: "dongJihao", location: "办公室", visibility: "0.5s 屏幕渐亮", locationState: { floorId: "4F", roomId: "office-4f" } },
      { type: "fade", direction: "in", durationMs: 500 },
      { type: "checkpoint", id: "H" },
      { type: "switchCharacter", characterId: "dongJihao", visibleName: "董继豪", control: "player" },
      { type: "task", text: "去班里偷同学手机报警" },
      { type: "setFlag", id: "yangYunReplaysB2Actions", value: true },
      { type: "timer", id: "yang-yun-visible-failure-window", action: "start", durationMs: 3_000, trigger: "杨云连续出现在用户屏幕内3s执行F-B" },
      { type: "timer", id: "survival-route-countdown", action: "start", durationMs: 120_000, trigger: "倒计时≤0时执行F-B" },
      {
        type: "interaction",
        input: "F",
        target: "GT1/GT2 手机柜，通信未开启",
        result: "提示信号屏蔽器并要求去五楼开启学校通信",
        physicalTarget: [
          { floorId: "4F", roomId: "gt1-classroom", points: [{ x: 160, y: 260, radiusPx: 48 }] },
          { floorId: "4F", roomId: "gt2-classroom", points: [{ x: 160, y: 260, radiusPx: 48 }] },
        ],
        condition: { flag: "communicationDisabled", equals: false },
      },
      { type: "dialogue", speaker: "董继豪", text: "信号屏蔽器？这对吗？", condition: { flag: "communicationDisabled", equals: false } },
      { type: "task", text: "去五楼开启学校通信", condition: { flag: "communicationDisabled", equals: false } },
      { type: "task", text: "去班里偷同学手机报警", condition: { flag: "communicationDisabled", equals: true } },
      {
        type: "interaction",
        input: "F",
        target: "GT1/GT2 手机柜，通信已开启",
        result: "进入检查点I",
        physicalTarget: [
          { floorId: "4F", roomId: "gt1-classroom", points: [{ x: 160, y: 260, radiusPx: 48 }] },
          { floorId: "4F", roomId: "gt2-classroom", points: [{ x: 160, y: 260, radiusPx: 48 }] },
        ],
        condition: { flag: "communicationDisabled", equals: true },
      },
      { type: "gotoCheckpoint", id: "I", condition: { flag: "communicationDisabled", equals: true } },
    ],
  },
  {
    id: "I",
    label: "通信开启后手机报警并活到倒计时结束",
    location: "GT1/GT2 phone cabinet",
    task: "活着",
    playableCharacter: "dongJihao",
    commands: [
      { type: "checkpoint", id: "I" },
      { type: "dialogue", speaker: "董继豪", text: "好了。" },
      { type: "timer", id: "survival-route-countdown", action: "stop" },
      { type: "timer", id: "survival-ending-countdown", action: "reset", durationMs: 30_000, trigger: "等待至倒计时结束" },
      { type: "task", text: "活着" },
      { type: "setFlag", id: "yangYunAutoTracksAfterReplay", value: true },
      { type: "setFlag", id: "phoneCabinetInteractionDisabled", value: true },
      { type: "wait", durationMs: 30_000, label: "活着倒计时结束" },
      { type: "fade", direction: "out", durationMs: 500 },
      { type: "ending", id: "survival-false-report", title: "幸存", subtitle: "报假警" },
      { type: "curtain", title: "下一幕", subtitle: "敬请期待" },
    ],
  },
];

export const firstActBranches: StoryBranch[] = [
  {
    id: "A-1",
    label: "让我去看看芹菜怎么样了",
    trigger: "用户在但宇轩尸体附近选择 A-1",
    fromCheckpoint: "C",
    rejoinsCheckpoint: "D",
    commands: [
      { type: "task", text: "回（GT2）班看看芹菜在不在" },
      { type: "blockDoor", doorId: "4f-gt2-back", message: "滚去前门！", speaker: "？？？" },
      { type: "interaction", input: "proximity", target: "GT2 classroom front door", result: "进入 GT2 后触发秦浩睿剧情", proximityTargetId: "checkpoint-c-gt2-front-entry" },
      { type: "setFlag", id: "qinHaoruiStandingVisible", value: true },
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "scripted" },
      { type: "setControl", enabled: false, reason: "杨云进班自动走向秦浩睿", scriptedMovementId: "yang-yun-to-qin-haorui-body" },
      { type: "dialogue", speaker: "秦浩睿", text: "杨云？杨云？！你不要过来啊！！" },
      { type: "deathFlash", id: "celery", sequence: celeryDeathFlash },
      { type: "task", text: "无" },
      { type: "unblockDoor", doorId: "4f-gt2-back" },
      { type: "gotoCheckpoint", id: "D" },
    ],
  },
  {
    id: "A-2",
    label: "让我尝尝",
    trigger: "10s 未选择 A-1 且视野内有但宇轩尸体自动执行",
    fromCheckpoint: "C",
    rejoinsCheckpoint: "D",
    commands: [
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "scripted" },
      { type: "dialogue", speaker: "杨云", text: "让我尝尝。" },
      { type: "fade", direction: "out", durationMs: 500 },
      { type: "blackScreen", durationMs: 1_000 },
      { type: "fade", direction: "in", durationMs: 500 },
      { type: "setFlag", id: "danYuxuanBodyGoneHeadOnly", value: true },
      { type: "dialogue", speaker: "杨云", text: "好……" },
      { type: "switchCharacter", characterId: "yangYunBlue", visibleName: "杨云", control: "scripted" },
      { type: "dialogue", speaker: "杨云", text: "……吃？！" },
      { type: "dialogue", speaker: "杨云", text: "呕" },
      { type: "dialogue", speaker: "杨云", text: "芹菜没事吧？我去看看" },
      { type: "task", text: "回（GT2）班看看芹菜在不在" },
      { type: "blockDoor", doorId: "4f-gt2-back", message: "滚去前门！", speaker: "？？？" },
      { type: "interaction", input: "proximity", target: "GT2 classroom front door", result: "进入 GT2 后触发秦浩睿剧情", proximityTargetId: "checkpoint-c-gt2-front-entry" },
      { type: "setFlag", id: "qinHaoruiStandingVisible", value: true },
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "scripted" },
      { type: "setControl", enabled: false, reason: "杨云进班自动走向秦浩睿", scriptedMovementId: "yang-yun-to-qin-haorui-body" },
      { type: "dialogue", speaker: "秦浩睿", text: "杨云？杨云？！你不要过来啊！！" },
      { type: "deathFlash", id: "celery", sequence: celeryDeathFlash },
      { type: "task", text: "无" },
      { type: "unblockDoor", doorId: "4f-gt2-back" },
      { type: "gotoCheckpoint", id: "D" },
    ],
  },
  {
    id: "B-1",
    label: "去找校长",
    trigger: "用户在检查点G选择 B-1",
    fromCheckpoint: "G",
    rejoinsCheckpoint: "G",
    commands: [
      { type: "task", text: "前往五楼校长办公室" },
      { type: "interaction", input: "F", target: "五楼校长办公室门口", result: "不进入，黑屏对白", physicalTarget: { floorId: "5F", roomId: null, points: [{ x: 288, y: 2012, radiusPx: 48 }] } },
      { type: "fade", direction: "out", durationMs: 500 },
      { type: "blackScreenDialogueWait", durationMs: 500, label: "校长办公室黑屏正常对白等待" },
      { type: "dialogue", speaker: "董继豪", text: "今天周末，我忘了。" },
      { type: "wait", durationMs: 3_000, label: "意识到周末后等待" },
      { type: "dialogue", speaker: "董继豪", text: "操！" },
      { type: "blackScreen", durationMs: 1_000 },
      { type: "deathFlash", id: "ruler", sequence: rulerDeathFlash },
      { type: "blackScreen", durationMs: 1_000 },
      { type: "ending", id: "split-in-two", title: "一分为二", returnsToCheckpoint: "G" },
      { type: "checkpoint", id: "G" },
    ],
  },
  {
    id: "B-2",
    label: "思索",
    trigger: "用户在检查点G选择 B-2",
    fromCheckpoint: "G",
    rejoinsCheckpoint: "H",
    commands: [
      { type: "wait", durationMs: 3_000, label: "思索等待" },
      { type: "dialogue", speaker: "董继豪", text: "今天周末，没老师，我也没带手机。该怎么办呢？" },
      { type: "dialogue", speaker: "董继豪", text: "我知道了！" },
      { type: "fade", direction: "out", durationMs: 500 },
      { type: "switchCharacter", characterId: "dongJihao", visibleName: "董继豪", control: "hidden" },
      { type: "switchView", characterId: "yangYunRed", location: "杨云视角" },
      { type: "fade", direction: "in", durationMs: 500 },
      { type: "switchCharacter", characterId: "yangYunRed", visibleName: "杨云", control: "player" },
      { type: "dialogue", speaker: "杨云", text: "我好像忘了点啥" },
      { type: "setFlag", id: "headPickupPartsVisible", value: true },
      { type: "task", text: "拾取但宇轩和秦浩睿的头颅" },
      { type: "interaction", input: "Q", target: "但宇轩和秦浩睿的头颅", result: "拾取二人的头颅后继续", physicalTarget: [{ floorId: "4F", roomId: "gt1-classroom", points: [{ x: 720, y: 360, radiusPx: 48 }] }, { floorId: "4F", roomId: "gt2-classroom", points: [{ x: 800, y: 360, radiusPx: 48 }] }] },
      { type: "dialogue", speaker: "杨云", text: "材料够了。" },
      { type: "setFlag", id: "headPickupPartsVisible", value: false },
      { type: "setFlag", id: "communicationDisabled", value: true },
      { type: "fade", direction: "out", durationMs: 500 },
      { type: "checkpoint", id: "H" },
    ],
  },
];

export const storyManifest: StoryManifest = {
  title: "影中咎",
  source: "第一幕剧本.txt",
  acts: [
    {
      id: "act-1",
      title: "第一幕",
      status: "playable",
      checkpoints: firstActCheckpoints,
      branches: firstActBranches,
      timers: [
        {
          id: "A-2-auto-eat-dan-yuxuan",
          durationMs: 10_000,
          startsAt: "C",
          result: "未选择 A-1 且视野内有但宇轩尸体时自动执行 A-2",
        },
        {
          id: "survival-route-countdown",
          durationMs: 120_000,
          startsAt: "H",
          result: "倒计时 ≤ 0 时关闭倒计时并执行 F-B / F-A，大结局：臊子",
        },
        {
          id: "survival-ending-countdown",
          durationMs: 30_000,
          startsAt: "I",
          result: "杨云复现完操作后追踪董继豪，倒计时结束进入幸存结局",
        },
      ],
      tasks: [
        "找到但宇轩",
        "无",
        "回（GT2）班看看芹菜在不在",
        "去办公室",
        "前往五楼关闭学校通信",
        "前往办公室报警",
        "前往五楼校长办公室",
        "拾取但宇轩和秦浩睿的头颅",
        "去班里偷同学手机报警",
        "去五楼开启学校通信",
        "活着",
      ],
      endings: [
        {
          id: "split-in-two",
          title: "一分为二",
          kind: "minor",
          trigger: "B-1 尺子闪屏死亡动画结束",
          returnsToCheckpoint: "G",
        },
        {
          id: "saozi",
          title: "臊子",
          kind: "major",
          trigger: "F-B：杨云连续出现在屏幕内3s，或 H 的120s倒计时归零",
        },
        {
          id: "survival-false-report",
          title: "幸存",
          kind: "major",
          trigger: "检查点I后活过30s倒计时",
        },
      ],
      characters: [
        { id: "yangYunBlue", displayName: "杨云", internalState: "blue-border" },
        { id: "yangYunRed", displayName: "杨云", internalState: "red-border" },
        { id: "dongJihao", displayName: "董继豪", internalState: "default-blue-border" },
        { id: "danYuxuan", displayName: "但宇轩" },
        { id: "qinHaorui", displayName: "秦浩睿" },
        { id: "unknown", displayName: "？？？" },
      ],
      proximityTargets: [
        { id: "checkpoint-a-dan-yuxuan-gt1", floorId: "4F", roomId: "gt1-classroom", point: { x: 760, y: 520 }, radiusPx: 96 },
        { id: "checkpoint-c-gt2-front-entry", floorId: "4F", roomId: "gt2-classroom", point: { x: 760, y: 220 }, radiusPx: 96 },
      ],
      visibilityTargets: [
        { id: "checkpoint-c-dan-yuxuan-body-gt1", floorId: "4F", roomId: "gt1-classroom", rect: { x: 728, y: 488, width: 64, height: 64 } },
      ],
      scriptedMovementTargets: [
        { id: "dong-jihao-to-qin-haorui-body", target: { x: 760, y: 330 }, durationMs: 2_000, tolerancePx: 16 },
        { id: "yang-yun-to-qin-haorui-body", target: { x: 760, y: 330 }, durationMs: 2_000, tolerancePx: 16 },
      ],
      curtain: { title: "下一幕", subtitle: "敬请期待" },
      notes: [
        "任务 `无` 保留为数据，后续 UI 在显示层隐藏。",
        "F-A 在剧本中只作为 F-B 的执行目标出现，未单独定义；manifest 将 F-B 视为触发大结局：臊子。",
        "B-1 写明黑屏下对话、立绘正常显示；manifest 用 blackScreenDialogueWait 表示 500ms 黑屏对白等待。",
      ],
    },
    {
      id: "act-2",
      title: "第二幕",
      status: "reserved",
      checkpoints: [],
      branches: [],
      timers: [],
      tasks: [],
      endings: [],
      characters: [],
      notes: ["结构预留；不得包含可玩事件链。"],
    },
    {
      id: "act-3",
      title: "第三幕",
      status: "reserved",
      checkpoints: [],
      branches: [],
      timers: [],
      tasks: [],
      endings: [],
      characters: [],
      notes: ["结构预留；不得包含可玩事件链。"],
    },
  ],
};
