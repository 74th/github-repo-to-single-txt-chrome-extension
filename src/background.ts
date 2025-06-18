import { minimatch } from 'minimatch';

async function getToken(tabId: number): Promise<string | undefined> {
  const stored = await chrome.storage.local.get('token');
  if (stored.token) return stored.token as string;
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () =>
      prompt(
        'Enter GitHub Personal Access Token (used for private repos). This will be stored locally:'
      ),
  });
  if (result) {
    await chrome.storage.local.set({ token: result });
    return result as string;
  }
  return undefined;
}

chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  try {
    const pageUrl = new URL(tab.url || '');
    if (pageUrl.hostname !== 'github.com') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => alert('This is not a GitHub page.'),
      });
      return;
    }

    const parts = pageUrl.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => alert('Cannot determine repository.'),
      });
      return;
    }
    const owner = parts[0];
    const repo = parts[1];

    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;
    console.log('ZIP download URL:', zipUrl);

    const token = await getToken(tab.id!);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `token ${token}`;

    const response = await fetch(zipUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download ZIP: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);

    const { extensions, exclude } = await chrome.storage.local.get([
      'extensions',
      'exclude',
    ]);
    let exts = [
      'py',
      'js',
      'ts',
      'jsx',
      'tsx',
      'go',
      'java',
      'c',
      'cpp',
      'cs',
      'rb',
      'rs',
      'php',
      'kt',
      'swift',
      'sh',
      'md',
      'txt',
    ];
    if (typeof extensions === 'string' && extensions.trim()) {
      exts = extensions
        .split(/\s+/)
        .map((e: string) => e.replace(/^\./, '').trim())
        .filter(Boolean);
    }
    const extRegex = new RegExp(`\.(${exts.map((e) => e.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})$`, 'i');

    let excludeGlobs: string[] = [
      '.vscode/**',
      '.github/**',
      'node_modules/**',
      'dist/**',
      'build/**',
    ];
    if (typeof exclude === 'string' && exclude.trim()) {
      excludeGlobs = exclude
        .split(/\r?\n/)
        .map((e: string) => e.trim())
        .filter(Boolean);
    }

    interface Entry { path: string; file: any; }
    const entries: Entry[] = [];
    zip.forEach((relativePath: string, zipEntry: any) => {
      if (zipEntry.dir) return;
      const trimmed = relativePath.replace(/^[^/]+\//, '');
      if (!extRegex.test(trimmed)) return;
      if (excludeGlobs.some((p) => minimatch(trimmed, p))) return;
      entries.push({ path: trimmed, file: zipEntry });
    });

    const readmeIndex = entries.findIndex((e) => /(^|\/)README\.md$/i.test(e.path));
    entries.sort((a, b) => a.path.localeCompare(b.path));
    if (readmeIndex >= 0) {
      const [readme] = entries.splice(readmeIndex, 1);
      entries.unshift(readme);
    }

    let output = `${repo}\n\n`;
    for (const entry of entries) {
      const text = await entry.file.async('text');
      output += `---\nfile: ${entry.path}\n---\n${text}\n\n`;
    }

    const outBlob = new Blob([output], { type: 'text/plain' });
    let downloadUrl: string;
    if (typeof URL.createObjectURL === 'function') {
      downloadUrl = URL.createObjectURL(outBlob);
    } else {
      const buf = await outBlob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (const b of bytes) binary += String.fromCharCode(b);
      const base64 = btoa(binary);
      downloadUrl = `data:text/plain;base64,${base64}`;
    }
    chrome.downloads.download({ url: downloadUrl, filename: `${repo}.txt`, saveAs: true });
  } catch (err: any) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: (msg: string) => alert(msg),
      args: [err.message],
    });
  }
});
