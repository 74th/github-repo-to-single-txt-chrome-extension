import JSZip, { JSZipObject } from 'jszip';
import { minimatch } from 'minimatch';

export interface RepoInfo {
  full_name: string;
  description?: string;
}

export interface FileChunk {
  content: string;
  isLast: boolean;
  chunkIndex: number;
  progress: number;
}

export async function* extractTextFromZipChunked(
  zip: JSZip,
  repoInfo: RepoInfo,
  exts: string[],
  excludeGlobs: string[],
  includeGlobs: string[] = [],
  maxChunkSizeBytes: number = 5 * 1024 * 1024 // 5MB default
): AsyncGenerator<FileChunk, void, unknown> {
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
    if (excludeGlobs.some((p) => minimatch(trimmed, p))) return;
    if (includeGlobs.some((p) => minimatch(trimmed, p))) {
      entries.push({ path: trimmed, file: zipEntry });
      return;
    }
    if (!extRegex.test(trimmed)) return;
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
    // Sort files alphabetically by their paths.
    const arr = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    
    // Construct the expected name for a README file in the current directory.
    const readmeName = prefix ? `${prefix}/README.md` : 'README.md';
    
    // Check if a README file exists in the current list of files.
    const idx = arr.findIndex((e) => e.path.toLowerCase() === readmeName.toLowerCase());
    
    // If a README file is found, move it to the front of the list to prioritize it.
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

  function buildTreeLines(node: Node, prefix = ''): string[] {
    const files = node.files
      .map((e) => e.path.split('/').pop()!)
      .sort((a, b) => a.localeCompare(b));
    const dirs = Array.from(node.dirs.keys()).sort((a, b) => a.localeCompare(b));
    const items = [
      ...files.map((name) => ({ name, child: undefined as Node | undefined })),
      ...dirs.map((name) => ({ name, child: node.dirs.get(name)! })),
    ].sort((a, b) => a.name.localeCompare(b.name));
    const lines: string[] = [];
    items.forEach((item, idx) => {
      const isLast = idx === items.length - 1;
      const branch = isLast ? '└── ' : '├── ';
      lines.push(`${prefix}${branch}${item.name}`);
      if (item.child) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        lines.push(...buildTreeLines(item.child, childPrefix));
      }
    });
    return lines;
  }

  const treeLines = ['.', ...buildTreeLines(rootNode)];

  let currentChunk = '';
  let chunkIndex = 1;
  let processedFiles = 0;
  
  // Add header only to first chunk
  const header = `${repoInfo.full_name}\n${repoInfo.description || ''}\n\n${treeLines.join('\n')}\n\n`;
  currentChunk = header;

  function getByteLength(str: string): number {
    return new TextEncoder().encode(str).length;
  }

  const totalFiles = ordered.length;

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];
    const text = await entry.file.async('text');
    const fileContent = `---\nfile: ${entry.path}\n---\n${text}\n\n`;
    
    // Check if adding this file would exceed the limit
    const newLength = getByteLength(currentChunk + fileContent);
    
    if (newLength > maxChunkSizeBytes && currentChunk.length > header.length) {
      // Yield current chunk and start a new one
      yield {
        content: currentChunk,
        isLast: false,
        chunkIndex: chunkIndex++,
        progress: processedFiles / totalFiles
      };

      // Start new chunk with continuation header
      currentChunk = `${repoInfo.full_name} (continued - part ${chunkIndex})\n\n`;
    }

    currentChunk += fileContent;
    processedFiles++;
  }

  // Yield the final chunk
  yield {
    content: currentChunk,
    isLast: true,
    chunkIndex: chunkIndex,
    progress: 1
  };
}

export async function extractTextFromZip(
  zip: JSZip,
  repoInfo: RepoInfo,
  exts: string[],
  excludeGlobs: string[],
  includeGlobs: string[] = []
): Promise<string> {
  // Use the chunked version with a very large limit to get single file behavior
  const chunks = [];
  for await (const chunk of extractTextFromZipChunked(zip, repoInfo, exts, excludeGlobs, includeGlobs, Number.MAX_SAFE_INTEGER)) {
    chunks.push(chunk.content);
  }
  return chunks.join('');
}
