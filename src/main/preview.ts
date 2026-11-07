import {join} from 'node:path';
/** Opt-in side-by-side owner testing: never load ordinary Rift review data. */
export function previewUserData(argv: string[], appData: string): string | null {
  return argv.includes('--rift-preview') ? join(appData,'Rift Preview') : null;
}
