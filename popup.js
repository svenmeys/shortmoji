const toggle = document.getElementById('toggle');
const autoReplace = document.getElementById('auto-replace');

chrome.storage.sync.get({ enabled: true, autoReplace: true }, (data) => {
  toggle.checked = data.enabled;
  autoReplace.checked = data.autoReplace;
});

toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});

autoReplace.addEventListener('change', () => {
  chrome.storage.sync.set({ autoReplace: autoReplace.checked });
});
