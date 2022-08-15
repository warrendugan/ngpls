import * as glob from 'glob';

export const getFiles = (filesPath: string) => {
  return glob.sync(`**`, {
    ignore: ['.git'],
    cwd: filesPath,
    nodir: true,
    // Directory and file names may contain `.` at the beginning,
    // e.g. `.well-known/apple-app-site-association`.
    dot: true,
  });
};
