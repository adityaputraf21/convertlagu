import { Container, getContainer } from "@cloudflare/containers";

// One Container class = one Durable Object = one running instance of our
// Dockerfile. Since our app keeps its own session state via JWT (not
// per-visitor container state), we route everyone to a single shared
// instance rather than spinning up a container per user.
export class AppContainer extends Container {
  defaultPort = 3000; // must match the port our Express app listens on
  sleepAfter = "10m"; // shuts down after 10 min idle to save cost, wakes on next request

  constructor(ctx, env) {
    super(ctx, env);
    // Forward Worker secrets/vars into the container's process.env
    this.envVars = {
      PORT: "3000",
      DATA_DIR: "/app/data",
      TMP_DIR: "/app/tmp",
      JWT_SECRET: env.JWT_SECRET,
      APP_URL: env.APP_URL,
      DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
      DISCORD_REDIRECT_URI: env.DISCORD_REDIRECT_URI,
      ROBLOX_API_KEY: env.ROBLOX_API_KEY,
      ROBLOX_DEFAULT_USER_ID: env.ROBLOX_DEFAULT_USER_ID,
      ROBLOX_DEFAULT_GROUP_ID: env.ROBLOX_DEFAULT_GROUP_ID,
      MIDTRANS_SERVER_KEY: env.MIDTRANS_SERVER_KEY,
      MIDTRANS_CLIENT_KEY: env.MIDTRANS_CLIENT_KEY,
      MIDTRANS_IS_PRODUCTION: env.MIDTRANS_IS_PRODUCTION,
      FREE_DAILY_LIMIT: env.FREE_DAILY_LIMIT,
    };
  }
}

export default {
  async fetch(request, env) {
    const container = getContainer(env.APP_CONTAINER);
    return container.fetch(request);
  },
};
