async function loadOptions() {
  const { extensions, exclude, chunkSizeMB } = await chrome.storage.local.get([
    'extensions',
    'exclude',
    'chunkSizeMB',
  ]);
  const extArea = document.getElementById('exts') as HTMLTextAreaElement;
  extArea.value =
    extensions ||
    'py\njs\nts\njsx\ntsx\ngo\njava\nc\ncpp\ncs\nrb\nrs\nphp\nkt\nswift\nsh\nmd\ntxt';
  const exArea = document.getElementById('exclude') as HTMLTextAreaElement;
  exArea.value =
    exclude ||
    '.vscode/**\n.github/**\nnode_modules/**\ndist/**\nbuild/**';
  const chunkInput = document.getElementById('chunkSizeMB') as HTMLInputElement;
  chunkInput.value = String(chunkSizeMB || 2);
}

async function saveOptions() {
  const extArea = document.getElementById('exts') as HTMLTextAreaElement;
  const exArea = document.getElementById('exclude') as HTMLTextAreaElement;
  const chunkInput = document.getElementById('chunkSizeMB') as HTMLInputElement;
  await chrome.storage.local.set({
    extensions: extArea.value,
    exclude: exArea.value,
    chunkSizeMB: parseFloat(chunkInput.value) || 2,
  });
  alert('Saved');
}

document.getElementById('save')!.addEventListener('click', saveOptions);
loadOptions();
