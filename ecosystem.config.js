module.exports = {
  apps: [
    {
      name: 'jtl-super-app',
      script: './backend/src/app.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HTTP_PORT: 3001,
        HTTPS_PORT: 3443,
        PUBLIC_HTTP_PORT: 80,
        PUBLIC_HTTPS_PORT: 443,
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
