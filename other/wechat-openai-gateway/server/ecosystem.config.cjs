module.exports = {
  apps: [
    {
      name: 'wechat-openai-gateway-server',
      cwd: '/x/other/wechat-openai-gateway/server',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
}
