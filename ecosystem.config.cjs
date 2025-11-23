module.exports = {
    apps: [
        {
            name: "baileys-api",
            script: "dist/index.js",
            exec_mode: "fork",
            instances: 1,
            node_args: "--enable-source-maps",
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};
