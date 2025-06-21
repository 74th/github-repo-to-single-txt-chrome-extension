async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    document.body.textContent = 'Unable to determine active tab.';
    return;
  }
  const url = new URL(tab.url);
  if (url.hostname !== 'github.com') {
    document.body.textContent = 'Not a GitHub page.';
    return;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    document.body.textContent = 'Cannot determine repository.';
    return;
  }
  const repoFull = `${parts[0]}/${parts[1]}`;

  const { extensions, exclude, repoSettings } = await chrome.storage.local.get([
    'extensions',
    'exclude',
    'repoSettings',
  ]);

  const extArea = document.getElementById('exts') as HTMLTextAreaElement;
  const exArea = document.getElementById('exclude') as HTMLTextAreaElement;

  const repoVals = (repoSettings && repoSettings[repoFull]) || {};
  extArea.value =
    repoVals.extensions ||
    extensions ||
    'py\njs\nts\njsx\ntsx\ngo\njava\nc\ncpp\ncs\nrb\nrs\nphp\nkt\nswift\nsh\nmd\ntxt';
  exArea.value =
    repoVals.exclude ||
    exclude ||
    '.vscode/**\n.github/**\nnode_modules/**\ndist/**\nbuild/**';

  document.getElementById('extract')?.addEventListener('click', async () => {
    const newExts = extArea.value;
    const newEx = exArea.value;
    const updated = { ...(repoSettings || {}) } as Record<string, any>;
    updated[repoFull] = { extensions: newExts, exclude: newEx };
    await chrome.storage.local.set({ repoSettings: updated });
    await chrome.runtime.sendMessage({
      action: 'extract',
      tabId: tab.id,
      extensions: newExts,
      exclude: newEx,
    });
    window.close();
  });
}

init();
