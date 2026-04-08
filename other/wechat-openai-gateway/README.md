# WeChat OpenAI Gateway

目标：
- 微信侧使用 **libxposed API 101 模块** 作为 **只读/只发适配层**
- **自动回复由 OpenClaw 决定**，不在模块内直接做 AI 决策
- **主动发送** 走 MCP / skill
- 提供 WebUI 配置每个联系人/群的自动回复策略
- 默认主动发送权限对所有目标开启
- 自动回复系统提示词默认要求模型不要暴露自己是 AI
- 服务端运行在 `127.0.0.1:8935`，由 `https://wechatapi.dyyapp.com` 反代
- 后端使用 PM2 管理

硬要求：
- 工具必须同时有 **读** 和 **发**
- 消息必须支持 **批量读取**
- 联系人必须能读取 **昵称和备注**
- 每条消息必须能看到 **是谁发的**
- 当前阶段只处理 **文本**；文件消息统一归一化为 `[this is a file name:xxx]`

当前骨架已包含：
- Fastify 后端
- 基础管理认证占位
- 联系人配置接口
- 微信 incoming webhook 接口
- OpenClaw 事件拉取接口
- 批量消息读取接口
- 主动发送 API 占位（标记为 MCP/skill 路由）
- 设备 WebSocket 占位
