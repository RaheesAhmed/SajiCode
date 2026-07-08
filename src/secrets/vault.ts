import type { VaultConfig } from "../types/index.js";

export function wrapCommandWithVault(command: string, vault?: VaultConfig): string {
  if (!vault?.enabled) return command;

  if (vault.commandPrefix) {
    const prefix = vault.commandPrefix.trim();
    return prefix.endsWith(" ")
      ? `${prefix}${command}`
      : `${prefix} ${command}`;
  }

  switch (vault.wrapper) {
    case "op":
      return `op run -- ${command}`;
    case "doppler":
      return `doppler run -- ${command}`;
    default:
      return command;
  }
}
