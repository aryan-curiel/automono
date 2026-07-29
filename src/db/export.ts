import { invoke } from "@tauri-apps/api/core";

/** Writes `contents` to `path` on disk, overwriting any existing file. */
export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file_cmd", { path, contents });
}
