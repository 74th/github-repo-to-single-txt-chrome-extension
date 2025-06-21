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
  let readmeIndex = entries.findIndex((e) => /^README\.md$/i.test(e.path));
  if (readmeIndex < 0) {
    readmeIndex = entries.findIndex((e) => /(^|\/)README\.md$/i.test(e.path));
  }
  if (readmeIndex >= 0) {
    const [readme] = entries.splice(readmeIndex, 1);
    entries.unshift(readme);
  }

  let output = `${repoInfo.full_name}\n${repoInfo.description || ''}\n\n`;
  for (const entry of entries) {
    const text = await entry.file.async('text');
    output += `---\nfile: ${entry.path}\n---\n${text}\n\n`;
  }
  return output;
}
