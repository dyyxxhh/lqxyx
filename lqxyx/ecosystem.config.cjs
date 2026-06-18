module.exports = {
  apps: [
    {
      name: 'ying-zhong-jiu-static',
      script: './server/static-server.js',
      interpreter: 'node',
      autorestart: true,
      max_memory_restart: '512M',
      max_restarts: 5,
      restart_delay: 5000,
      min_uptime: '10s',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8949'
      }
    }
  ]
};
