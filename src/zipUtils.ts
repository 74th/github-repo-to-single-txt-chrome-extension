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

  interface Node {
    files: Entry[];
    dirs: Map<string, Node>;
  }

  const rootNode: Node = { files: [], dirs: new Map() };

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let node = rootNode;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let child = node.dirs.get(part);
      if (!child) {
        child = { files: [], dirs: new Map() };
        node.dirs.set(part, child);
      }
      node = child;
    }
    node.files.push(entry);
  }

  function collect(node: Node, prefix: string): Entry[] {
    const arr = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    const readmeName = prefix ? `${prefix}/README.md` : 'README.md';
    const idx = arr.findIndex((e) => e.path.toLowerCase() === readmeName.toLowerCase());
    if (idx >= 0) {
      const [r] = arr.splice(idx, 1);
      arr.unshift(r);
    }

    const result: Entry[] = [...arr];
    const subNames = Array.from(node.dirs.keys()).sort((a, b) => a.localeCompare(b));
    for (const name of subNames) {
      const child = node.dirs.get(name)!;
      const childPrefix = prefix ? `${prefix}/${name}` : name;
      result.push(...collect(child, childPrefix));
    }
    return result;
  }

  const ordered = collect(rootNode, '');

  let output = `${repoInfo.full_name}\n${repoInfo.description || ''}\n\n`;
  for (const entry of ordered) {
    const text = await entry.file.async('text');
    output += `---\nfile: ${entry.path}\n---\n${text}\n\n`;
  }
  return output;
}
