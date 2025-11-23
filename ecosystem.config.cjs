module.exports = {
    apps: [
        {
            name: "baileys-api",
            script: "dist/index.js",
            cwd: __dirname,
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: "production"
            },
            // 👇 Esto hace que cada reinicio compile y ejecute tu script de fix
            post_update: [
                "npm install",
                "npm run build"
            ]
        }
    ]
}
