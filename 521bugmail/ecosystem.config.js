module.exports = {
    apps: [{
        name: 'site-monitor',
        script: 'site-monitor.js',
        cwd: '/x/521bugmail',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        watch: false,
        max_memory_restart: '200M',
        env: {
            NODE_ENV: 'production'
        },
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/site-monitor-error.log',
        out_file: './logs/site-monitor-out.log',
        merge_logs: true
    }]
};
