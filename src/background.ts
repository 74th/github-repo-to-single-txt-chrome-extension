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

    const [{ result: zipLink }] = await chrome.scripting.executeScript<{ result: string | null }>({
      target: { tabId: tab.id! },
      func: () => {
        const el = document.querySelector<HTMLAnchorElement>('get-repo details-menu a[href*="/zip/"]');
        return el ? el.href : null;
      },
    });

    const zipUrl = zipLink || `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;
    const response = await fetch(zipUrl);
    if (!response.ok) throw new Error('Failed to download ZIP');
    const blob = await response.blob();

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);

    interface Entry { path: string; file: any; }
    const entries: Entry[] = [];
    zip.forEach((relativePath: string, zipEntry: any) => {
      if (zipEntry.dir) return;
      if (!/\.(py|go|md|txt)$/i.test(relativePath)) return;
      entries.push({ path: relativePath, file: zipEntry });
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
    const urlObj = URL.createObjectURL(outBlob);
    chrome.downloads.download({ url: urlObj, filename: `${repo}.txt`, saveAs: true });
  } catch (err: any) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: (msg: string) => alert(msg),
      args: [err.message],
    });
  }
});
