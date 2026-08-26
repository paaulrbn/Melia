import { invoke } from '@tauri-apps/api/core';
import { AppInfo, Config, UpdateCheckResult } from '../types';

export async function getNativeConfig(): Promise<Config> {
  return invoke<Config>('get_config');
}

export async function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('get_app_info');
}

export async function selectFolder(): Promise<string | null> {
  return invoke<string | null>('select_folder');
}

export async function openFolder(path: string): Promise<void> {
  await invoke('open_folder', { path });
}

export async function checkUpdate(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>('check_update');
}

export async function installUpdate(): Promise<void> {
  await invoke('install_update');
}
