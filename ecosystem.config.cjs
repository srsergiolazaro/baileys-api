module.exports = {
    apps: [
        {
            name: "baileys-api",
            script: "dist/index.js",
            instances: 1,
            exec_mode: "cluster",
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: "production",
            },
            post_update: [
                "npm install",
                "npm run build"
            ]
        }
    ]
}
