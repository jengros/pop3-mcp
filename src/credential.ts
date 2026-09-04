import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function scriptPath(name: string): string {
  return fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
}

function powershellExecutable(): string {
  return `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

export function readWindowsCredential(target: string): string {
  if (process.platform !== "win32") {
    throw new Error("POP3_CREDENTIAL_TARGET is supported only on Windows; use POP3_PASSWORD on this platform");
  }
  if (!target || target.length > 256 || /[\r\n]/.test(target)) {
    throw new Error("POP3_CREDENTIAL_TARGET is invalid");
  }
  try {
    return execFileSync(
      powershellExecutable(),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", scriptPath("get-credential.ps1"), "-Target", target],
      { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1024 * 1024 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Unable to read '${target}' from Windows Credential Manager: ${message}`);
  }
}

export function runCredentialSetup(target: string, username: string): number {
  if (process.platform !== "win32") {
    console.error("Credential Manager setup is available only on Windows.");
    return 1;
  }
  const result = spawnSync(
    powershellExecutable(),
    ["-NoLogo", "-NoProfile", "-File", scriptPath("set-credential.ps1"), "-Target", target, "-Username", username],
    { stdio: "inherit", windowsHide: false }
  );
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}


