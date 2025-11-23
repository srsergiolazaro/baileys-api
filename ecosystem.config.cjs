module.exports = {
    apps: [
        {
            name: "baileys-api",
            script: "dist/index.js",
            instances: 1,
            exec_mode: "fork",
            watch: false,
            env: {
                NODE_ENV: "development"
            },
            env_production: {
                NODE_ENV: "production"
            },
            out_file: "./logs/out.log",
            error_file: "./logs/error.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss"
        }
    ]
};
