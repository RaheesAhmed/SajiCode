export type DaemonBackendKind = "local" | "docker" | "modal" | "daytona";

export interface BackendDeployResult {
  backend: DaemonBackendKind;
  artifactPaths: string[];
  instructions: string;
}

export interface BackendStartResult {
  backend: DaemonBackendKind;
  started: boolean;
  message: string;
  pid?: number;
}
