async function loadOptions() {
  const { extensions, exclude } = await chrome.storage.local.get([
    'extensions',
    'exclude',
  ]);
  const extArea = document.getElementById('exts') as HTMLTextAreaElement;
  extArea.value = extensions || 'py\ngo\nmd\ntxt';
  const exArea = document.getElementById('exclude') as HTMLTextAreaElement;
  exArea.value = exclude || '';
}

async function saveOptions() {
  const extArea = document.getElementById('exts') as HTMLTextAreaElement;
  const exArea = document.getElementById('exclude') as HTMLTextAreaElement;
  await chrome.storage.local.set({ extensions: extArea.value, exclude: exArea.value });
  alert('Saved');
}

document.getElementById('save')!.addEventListener('click', saveOptions);
loadOptions();
