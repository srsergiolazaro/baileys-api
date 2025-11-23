module.exports = {
    apps: [
        {
            name: "baileys-api",
            script: "dist/index.js",
            instances: 1,
            exec_mode: "cluster",
            autorestart: true,
            watch: false,
            instance_var: "NODE_APP_INSTANCE",  // PM2 will set this for each instance
            env: {
                NODE_ENV: "production",
                PM2_INSTANCES: 1,  // Should match 'instances' above
            },
            post_update: [
                "npm install",
                "npm run build"
            ]
        }
    ]
}
