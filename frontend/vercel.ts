import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    {
      path: "/api/cron/calibration",
      schedule: "15 * * * *"
    },
    {
      path: "/api/cron/calibration",
      schedule: "5 6 * * *"
    },
    {
      path: "/api/cron/calibration/ops",
      schedule: "35 6 * * *"
    },
    {
      path: "/api/cron/calibration/ops",
      schedule: "*/20 * * * *"
    }
  ]
};
