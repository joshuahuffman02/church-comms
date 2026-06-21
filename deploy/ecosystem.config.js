// ecosystem.config.js — PM2 process config for the Church Communications app.
//
// PM2 is cross-platform and is the easiest "keep it running" option on the
// church's Mac (it also works on Linux). It restarts the app on crash and can
// resurrect it on boot.
//
// ── INSTALL ────────────────────────────────────────────────────────────────
//   npm install -g pm2
//   npm ci && npm run build               # build first; PM2 only runs `start`
//   pm2 start deploy/ecosystem.config.js  # run from the repo root
//   pm2 save                              # remember this process list
//   pm2 startup                           # print the command to start PM2 on boot
//                                         # (run the command it prints, once)
//
// ── OPERATE ────────────────────────────────────────────────────────────────
//   pm2 status                 # is it up?
//   pm2 logs comms             # tail logs
//   pm2 restart comms          # after an upgrade (build first, then restart)
//   pm2 stop comms             # before a DB restore
//
// ── NIGHTLY BACKUP (cron-like) ──────────────────────────────────────────────
// PM2 can also run the backup on a schedule instead of system cron. Either:
//   (a) use system cron — see deploy/backup.cron (recommended), OR
//   (b) run the backup as a PM2 cron app:
//         pm2 start npm --name comms-backup --no-autorestart \
//           --cron-restart="0 2 * * *" -- run backup
//       (PM2 restarts the process on the schedule, which re-runs `npm run backup`.)
//
// TZ is pinned to America/Chicago: dates are stored as church-local midnight,
// so a different timezone shifts days.

module.exports = {
  apps: [
    {
      name: "comms",
      // `npm run start` -> `next start`. Using npm keeps it identical to the
      // systemd/Docker path.
      script: "npm",
      args: "run start",
      // Run from the repo root regardless of where pm2 is invoked.
      cwd: __dirname + "/..",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // next start is single-process; do not cluster (SQLite is single-writer).
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        TZ: "America/Chicago",
        PORT: 3000,
      },
    },
  ],
};
