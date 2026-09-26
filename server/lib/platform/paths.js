import path from 'node:path';

export function pathContains(directory, candidate) {
  if (!directory || !candidate) return false;
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
