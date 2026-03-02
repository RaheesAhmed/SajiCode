/**
 * Copyright (c) 2026 OpenAgent Team
 * Licensed under the MIT License
 */


import { allFileTools } from "./filesTools.js";
import { allShellTools } from "./shell.js";
import { allMemoryTools } from "./memory-tools.js";
import { allContextTools } from "./context-tools.js";

export const allTools = [...allFileTools, ...allShellTools, ...allMemoryTools, ...allContextTools];

export { allFileTools } from "./filesTools.js";
export { allShellTools } from "./shell.js";
export { allMemoryTools } from "./memory-tools.js";
export { allContextTools } from "./context-tools.js";
