import type {ChangedFile} from '../../shared/contracts';

export interface FolderStatus { label: string; title: string }

/** Summarize all matching descendants, independently of tree expansion. */
export function aggregateFolderStatuses(files: readonly ChangedFile[]): Map<string, FolderStatus> {
  const folders = new Map<string, Set<ChangedFile['status']>>();
  for (const file of files) {
    let path = '';
    for (const part of file.path.split('/').slice(0, -1)) {
      path = path ? `${path}/${part}` : part;
      const statuses = folders.get(path) ?? new Set<ChangedFile['status']>();
      statuses.add(file.status);
      folders.set(path, statuses);
    }
  }
  return new Map([...folders].map(([path, statuses]) => {
    // Keep file conventions, including U (not A) for untracked files.
    const labels = {added: 'A', modified: 'M', deleted: 'D', renamed: 'R', untracked: 'U'};
    const kinds = (['added', 'modified', 'deleted', 'renamed', 'untracked'] as const).filter(status => statuses.has(status));
    const description = kinds.join(' and ');
    return [path, {label: kinds.map(status => labels[status]).join('/'),
      title: description.charAt(0).toUpperCase() + description.slice(1) + ' files'}];
  }));
}
