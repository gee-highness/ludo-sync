import type { CapacitorConfig } from "@capacitor/cli";

/** The Android app: the whole game bundle (out/, made by `npm run build:native`) lives inside the APK, so every game works with no connection. */
const config: CapacitorConfig = {
  appId: "app.ludosync.games",
  appName: "Ludo Sync",
  webDir: "out",
  backgroundColor: "#303030",
  android: { allowMixedContent: false },
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchShowDuration: 1500, backgroundColor: "#303030", showSpinner: false },
  },
};

export default config;
