(() => {
  let cleanup;
  window.addEventListener('message', event => {
    if (!/(^|\.)figma\.com$/i.test(location.hostname) || event.data?.type !== 'PAGEATLAS_FRAME') return;
    const frame = event.data.frame;
    if (!frame || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > 65000000 ||
      typeof frame.screenshot !== 'string' || frame.screenshot.length > 30000000 || !frame.screenshot.startsWith('data:image/png;base64,')) return;
    chrome.runtime.sendMessage({ type: 'figma-frame', frame }).then(result => {
      if (result.error) alert(result.error);
    });
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === 'cancel-picker') { cleanup?.(); reply({ ok: true }); return; }
    if (message.type !== 'choose-element') return;
    cleanup?.();
    const host = document.createElement('page-atlas-picker');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;inset:0;z-index:2147483647;pointer-events:none}div{position:fixed;border:2px solid #3ed297;background:#17624822;box-sizing:border-box;pointer-events:none}p{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#172b21;color:white;padding:12px 18px;border-radius:9px;font:14px system-ui;pointer-events:none}';
    const marker = document.createElement('div');
    const help = document.createElement('p');
    help.textContent = message.help;
    shadow.append(style, marker, help);
    document.documentElement.append(host);
    let chosen;
    function move(event) {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element || element.closest('page-atlas-panel')) return;
      chosen = element;
      const rect = element.getBoundingClientRect();
      Object.assign(marker.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    }
    function select(event) {
      if (!chosen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelector('[data-pageatlas-selected]')?.removeAttribute('data-pageatlas-selected');
      chosen.setAttribute('data-pageatlas-selected', '');
      cleanup();
      chrome.runtime.sendMessage(message.token ? { type: 'selected-element', token: message.token } : { type: 'capture', mode: 'selection' }).then(result => {
        if (result?.error) alert(result.error);
      });
    }
    function key(event) {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); cleanup(); if (message.token) chrome.runtime.sendMessage({ type: 'selection-cancel', token: message.token }); }
    }
    cleanup = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('click', select, true);
      document.removeEventListener('keydown', key, true);
      host.remove();
      cleanup = undefined;
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('click', select, true);
    document.addEventListener('keydown', key, true);
    reply({ ok: true });
  });
})();
