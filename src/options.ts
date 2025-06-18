async function loadExts() {
  const { extensions } = await chrome.storage.local.get('extensions');
  const textarea = document.getElementById('exts') as HTMLTextAreaElement;
  textarea.value = (extensions || 'py\ngo\nmd\ntxt');
}

async function saveExts() {
  const textarea = document.getElementById('exts') as HTMLTextAreaElement;
  await chrome.storage.local.set({ extensions: textarea.value });
  alert('Saved');
}

document.getElementById('save')!.addEventListener('click', saveExts);
loadExts();
