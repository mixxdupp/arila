module.exports = {
  apps: [
    {
      name: "arila-server",
      script: "dist/index.js",
      cwd: "./server",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "256M",
      error_file: "/var/log/arila/error.log",
      out_file: "/var/log/arila/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
