import JSZip, { JSZipObject } from 'jszip';
import { minimatch } from 'minimatch';

export interface RepoInfo {
  full_name: string;
  description?: string;
}

export async function extractTextFromZip(
  zip: JSZip,
  repoInfo: RepoInfo,
  exts: string[],
  excludeGlobs: string[]
): Promise<string> {
  const extRegex = new RegExp(
    `\.(${exts.map((e) => e.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join('|')})$`,
    'i'
  );
  interface Entry {
    path: string;
    file: JSZipObject;
  }
  const entries: Entry[] = [];
  zip.forEach((relativePath: string, zipEntry: JSZipObject) => {
    if (zipEntry.dir) return;
    const trimmed = relativePath.replace(/^[^/]+\//, '');
    if (!extRegex.test(trimmed)) return;
    if (excludeGlobs.some((p) => minimatch(trimmed, p))) return;
    entries.push({ path: trimmed, file: zipEntry });
  });

  entries.sort((a, b) => a.path.localeCompare(b.path));

  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const idx = entry.path.lastIndexOf('/');
    const dir = idx >= 0 ? entry.path.slice(0, idx) : '';
    const arr = groups.get(dir) ?? [];
    arr.push(entry);
    groups.set(dir, arr);
  }

  const ordered: Entry[] = [];
  for (const dir of Array.from(groups.keys()).sort((a, b) => a.localeCompare(b))) {
    const arr = groups.get(dir)!;
    const readmeName = dir ? `${dir}/README.md` : 'README.md';
    const i = arr.findIndex((e) => e.path.toLowerCase() === readmeName.toLowerCase());
    if (i >= 0) {
      const [r] = arr.splice(i, 1);
      arr.unshift(r);
    }
    ordered.push(...arr);
  }

  let output = `${repoInfo.full_name}\n${repoInfo.description || ''}\n\n`;
  for (const entry of ordered) {
    const text = await entry.file.async('text');
    output += `---\nfile: ${entry.path}\n---\n${text}\n\n`;
  }
  return output;
}
