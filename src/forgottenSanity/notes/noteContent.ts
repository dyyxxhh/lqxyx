// src/forgottenSanity/notes/noteContent.ts
// 遗落的纸条内容数据（9 条，纯 TS，无 Phaser import）。
// spec §3：正文按用户原文照存，无标题、无编号。部分内容自带开头，部分为裸陈述。

export interface NoteContent {
  readonly id: string;   // "note-content-1" .. "note-content-9"
  readonly body: string; // 原文全文，无标题、无编号
}

export const NOTE_CONTENT_COUNT = 9;

export const NOTE_CONTENTS: readonly NoteContent[] = [
  {
    id: "note-content-1",
    body: "天气晴\n今天我上午去单位上班，把yokua波的持续观测搞定了，下午听说他妈的竟然敢这么干，我他妈的不干了。",
  },
  {
    id: "note-content-2",
    body: "研究员 U497261 需要离开，预计原因为心脏骤停。",
  },
  {
    id: "note-content-3",
    body: "已向***方位发送 yokua 波，正在持续观测。",
  },
  {
    id: "note-content-4",
    body: "已造成严重影响，需要发射***。",
  },
  {
    id: "note-content-5",
    body: "敬爱的楚博士：\n经过多日的观察，共发现一个实验体 185296 出现了「神迹」与严重的暴力倾向，借此向您询问后续方向。",
  },
  {
    id: "note-content-6",
    body: "敬爱的楚博士：\n收到，正在持续监测。",
  },
  {
    id: "note-content-7",
    body: "敬爱的楚博士：\n特殊实验体 185296 已自行完成分离，保留结果为 185296-2。",
  },
  {
    id: "note-content-8",
    body: "实验体 185297 发生特殊变化，需要注意。",
  },
  {
    id: "note-content-9",
    body: "实验体 185297 已确认遗失部分人类特征，无明显正面效果，yokua 负面案例已发现。",
  },
];
