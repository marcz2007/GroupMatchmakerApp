module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "react-native-reanimated/plugin",
      [
        "module:react-native-dotenv",
        {
          moduleName: "@env",
          path: ".env",
          blacklist: null,
          whitelist: null,
          // Don't fail the BUILD when an @env var is missing (e.g. CI has no
          // .env, or GOOGLE_PLACES_API_KEY isn't set) — resolve to `undefined`
          // instead. Real builds still supply the required vars
          // (SUPABASE_URL/ANON) via .env / EAS secrets; optional ones like
          // GOOGLE_PLACES_API_KEY just degrade gracefully.
          safe: false,
          allowUndefined: true,
        },
      ],
    ],
  };
};
