import Bull from "bull";

/**
 * Bull Queue for background game analysis jobs
 * Requires Redis running (local or Railway)
 */
const analysisQueue = new Bull("game-analysis", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

export default analysisQueue;
