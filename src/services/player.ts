import { invoke } from '@tauri-apps/api/core';

export async function playVideo(pathOrUrl: string): Promise<void> {
  await invoke('play_video', { url: pathOrUrl });
}
