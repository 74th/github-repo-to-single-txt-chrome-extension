async function loadOptions() {
  const { extensions, exclude } = await chrome.storage.local.get([
    'extensions',
    'exclude',
  ]);
  const extArea = document.getElementById('exts') as HTMLTextAreaElement;
  extArea.value =
    extensions ||
    'py\njs\nts\njsx\ntsx\ngo\njava\nc\ncpp\ncs\nrb\nrs\nphp\nkt\nswift\nsh\nmd\ntxt';
  const exArea = document.getElementById('exclude') as HTMLTextAreaElement;
  exArea.value =
    exclude ||
    '.vscode/**\n.github/**\nnode_modules/**\ndist/**\nbuild/**';
}

async function saveOptions() {
  const extArea = document.getElementById('exts') as HTMLTextAreaElement;
  const exArea = document.getElementById('exclude') as HTMLTextAreaElement;
  await chrome.storage.local.set({ extensions: extArea.value, exclude: exArea.value });
  alert('Saved');
}

document.getElementById('save')!.addEventListener('click', saveOptions);
loadOptions();
