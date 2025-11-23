module.exports = {
    apps: [
        {
            name: "baileys-api",
            script: "./dist/index.js",   // ajusta si tu entrypoint es diferente
            instances: 1,
            exec_mode: "fork",
            watch: false,
            env: {
                NODE_ENV: "development",
            },
            env_production: {
                NODE_ENV: "production",
            },
            out_file: "/root/.pm2/logs/baileys-api-out.log",
            error_file: "/root/.pm2/logs/baileys-api-error.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss",
        }
    ]
}
