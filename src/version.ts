/**
 * The app version is injected by Vite from package.json. There is deliberately
 * no second hard-coded version string in the application.
 */
declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;

export function versionLabel(): string {
  return `BJJ Timer · v${APP_VERSION}`;
}
