import { invokeSynced } from './runtime';

export async function playVideo(pathOrUrl: string): Promise<void> {
  await invokeSynced('play_video', { url: pathOrUrl });
}
