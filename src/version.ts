import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface PackageJson {
  version: string;
}

/** Single source of truth — always matches root package.json. */
export const PKG_VERSION = (require("../package.json") as PackageJson).version;
