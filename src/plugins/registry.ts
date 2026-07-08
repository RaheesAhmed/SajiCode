export {
  discoverPlugins,
  loadPluginContributions,
  installPluginFromPath,
  installPluginFromNpm,
  removePlugin,
  formatPluginList,
  formatPluginConsent,
  getUserPluginsDir,
  getProjectPluginsDir,
} from "./loader.js";
export type { LoadedPlugin, PluginContributions, PluginLayer } from "./loader.js";
export { parsePluginManifest, safeParsePluginManifest } from "./manifest.js";
export type { PluginManifest } from "./manifest.js";
