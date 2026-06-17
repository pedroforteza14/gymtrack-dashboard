module.exports = {
  apps: [
    {
      name: "adstrack-api",
      cwd: "./server",
      script: "npm",
      args: "run dev",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "adstrack-ui",
      cwd: "./client",
      script: "npm",
      args: "run dev",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
