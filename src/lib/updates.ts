import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type { Update };

/** The newer release published on GitHub, or null when this version is current. */
export function checkForUpdate(): Promise<Update | null> {
  return check();
}

/** Backs up the data first, so a bad update can always be rolled back, then installs and relaunches. */
export async function installUpdate(update: Update): Promise<void> {
  await invoke("backup_before_update_cmd");
  await update.downloadAndInstall();
  await relaunch();
}
