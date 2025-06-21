import { extractTextFromZip } from './zipUtils.js';

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

    const token = await getToken(tab.id!);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `token ${token}`;

    const repoInfoRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers }
    );
    if (!repoInfoRes.ok) {
      throw new Error(
        `Failed to fetch repo info: ${repoInfoRes.status} ${repoInfoRes.statusText}`
      );
    }
    const repoInfo = await repoInfoRes.json();

    let branch = pageUrl.searchParams.get('ref') || repoInfo.default_branch;

    if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) {
      const rest = parts.slice(3);
      for (let i = rest.length; i >= 1; i--) {
        const cand = rest.slice(0, i).join('/');
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(cand)}`,
          { headers }
        );
        if (res.ok) {
          branch = cand;
          break;
        }
      }
    }

    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
    console.log('ZIP download URL:', zipUrl);

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

    const output = await extractTextFromZip(zip, repoInfo, exts, excludeGlobs);

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
