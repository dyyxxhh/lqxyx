# Module Plan

这是微信客户端侧模块目录，目标是：

- 使用 **libxposed API 101**
- 监听接收到的微信消息事件
- 将事件上报到 `https://wechatapi.dyyapp.com/api/wechat/incoming`
- 根据服务端返回结果决定是否在客户端直接执行自动回复
- 自动回复调用 OpenAI-compatible 接口
- 主动发送不走自动回复链路，而由 MCP/skill 触发

后续会补：
- 设备身份认证签名
- 联系人/群对象识别
- 文本消息发送桥
- 配置页跳转（可给文件传输助手发链接）
