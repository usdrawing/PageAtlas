chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'Toggle PageAtlas' });
  } catch {
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#9d412b' });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '–' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'PageAtlas is unavailable here. Reload this tab if you just installed it.' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type !== 'stylesheet' || sender.id !== chrome.runtime.id) return;
  fetch(chrome.runtime.getURL('panel.css')).then(response => response.text()).then(reply, () => reply(null));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type !== 'download' || sender.id !== chrome.runtime.id || !sender.tab) return;
  if (typeof message.url !== 'string' || !/^(?:https?:|data:(?:image|video)\/)/i.test(message.url)) {
    reply({ ok: false });
    return;
  }
  chrome.downloads.download({ url: message.url, saveAs: true })
    .then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});

importScripts('capture-background.js');
