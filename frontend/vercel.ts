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
    }
  ]
};
