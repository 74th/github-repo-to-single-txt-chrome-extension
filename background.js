chrome.action.onClicked.addListener(async (tab) => {
  try {
    const pageUrl = new URL(tab.url || '');
    if (pageUrl.hostname !== 'github.com') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert('This is not a GitHub page.'),
      });
      return;
    }

    const parts = pageUrl.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert('Cannot determine repository.'),
      });
      return;
    }
    const owner = parts[0];
    const repo = parts[1];

    // Try to grab the download ZIP link from the page
    const [{ result: zipLink }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const el = document.querySelector('get-repo details-menu a[href*="/zip/"]');
        return el ? el.href : null;
      },
    });

    const zipUrl = zipLink || `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;
    const response = await fetch(zipUrl);
    if (!response.ok) throw new Error('Failed to download ZIP');
    const blob = await response.blob();

    const { default: JSZip } = await import(chrome.runtime.getURL('jszip.min.js'));
    const zip = await JSZip.loadAsync(blob);

    const entries = [];
    zip.forEach((relativePath, zipEntry) => {
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
  } catch (err) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (msg) => alert(msg),
      args: [err.message],
    });
  }
});
