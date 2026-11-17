function createAtlasGallery({ shadow, make, tr, preferences, navigate, feedback }) {
  const modal = make('dialog', 'atlas-modal shell');
  const section = make('section', 'gallery');
  modal.append(section);
  shadow.append(modal);
  let items = [], selected = 0, kind, opener, controller;
  const controls = {
    close: '<path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 13.41l-4.89 4.9-1.42-1.42L10.59 12l-4.9-4.89 1.42-1.42L12 10.59l4.89-4.9z"/>',
    next: '<path d="m12 4-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>',
    previous: '<path d="m20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20z"/>',
    download: '<path d="M19 9h-4V3H9v6H5l7 7zM5 18h14v2H5z"/>',
    copy: '<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11z"/>'
  };
  const material = name => '<svg class="material" viewBox="0 0 24 24" aria-hidden="true">' + controls[name] + '</svg>';
  function button(label, action, symbol) {
    const element = make('button', 'gallery-action');
    element.type = 'button';
    if (symbol) element.innerHTML = material(symbol);
    element.append(make('span', '', label));
    element.addEventListener('click', action);
    return element;
  }
  function download(url, filename) {
    if (!url) return;
    if (url.startsWith("blob:")) {
      const anchor = make("a");
      anchor.href = url;
      anchor.download = filename || "";
      section.append(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    chrome.runtime.sendMessage({ type: 'download', url, filename }).catch(() => null)
      .then(reply => { if (!reply?.ok) feedback(tr('unavailable')); });
  }
  function save(text, filename, mime = 'image/svg+xml') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = make('a');
    anchor.href = url;
    anchor.download = filename;
    section.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function copy(text, svg = false) {
    try {
      if (svg && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([text], { type: 'text/html' })
          })]);
          feedback(tr('copied'));
          return;
        } catch {}
      }
      try { await navigator.clipboard.writeText(text); }
      catch {
        const previous = shadow.activeElement;
        const field = make('textarea', 'clipboard');
        field.value = text;
        (modal.open ? section : shadow).append(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        previous?.focus({ preventScroll: true });
        if (!copied) throw new Error('Clipboard unavailable');
      }
      feedback(tr('copied'));
    } catch { feedback(tr('unavailable')); }
  }
  function image(src, label) {
    const img = make('img');
    img.alt = label;
    img.referrerPolicy = 'no-referrer';
    img.src = src;
    return img;
  }
  function thumbnail(item) {
    if (item.src) {
      const img = image(item.src, '');
      img.loading = 'lazy';
      return img;
    }
    const type = make('span', 'file-format', atlasDocuments.type(item)?.toUpperCase() || 'FILE');
    return type;
  }
  function renderDocument(item, stage) {
    if (atlasDocuments.type(item) === 'pdf' && item.url) {
      const frame = make('iframe', 'pdf-preview');
      frame.title = item.label;
      frame.src = item.url;
      const open = make('a', 'document-open', tr('open'));
      open.href = item.url;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      stage.append(frame, open);
      return;
    }
    const contents = make('div', 'document-preview');
    contents.append(make('p', '', tr('loading')));
    stage.append(contents);
    const abort = new AbortController();
    controller = abort;
    const loadingTimeout = setTimeout(() => abort.abort('timeout'), 12000);
    const unavailable = () => {
      contents.replaceChildren(make('p', '', tr('previewUnavailable')));
      if (item.url) {
        const open = make('a', 'document-open', tr('open'));
        open.href = item.url;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        contents.append(open);
      }
    };
    if (!item.url) { clearTimeout(loadingTimeout); unavailable(); return; }
    atlasDocuments.preview(item, abort.signal).then(data => {
      if (controller !== abort || !modal.open) return;
      if (!data || !(data.text || data.sections?.length || data.sheets?.length)) return unavailable();
      contents.replaceChildren();
      if (data.text) contents.append(make('pre', '', data.text));
      for (const [index, text] of (data.sections || []).entries()) {
        contents.append(make('h3', '', tr('slide') + ' ' + (index + 1)), make('pre', '', text));
      }
      for (const [index, sheet] of (data.sheets || []).entries()) {
        const table = make('table');
        const body = make('tbody');
        for (const values of sheet) {
          const row = make('tr');
          row.append(...values.map(value => make('td', '', value)));
          body.append(row);
        }
        table.append(body);
        contents.append(make('h3', '', tr('sheet') + ' ' + (index + 1)), table);
      }
    }).catch(() => { if (controller === abort && modal.open) unavailable(); }).finally(() => clearTimeout(loadingTimeout));
  }
  function iconVisual(item) {
    const visual = make('div', 'icon-visual');
    if (item.svg) {
      const parsed = new DOMParser().parseFromString(item.svg, 'image/svg+xml').documentElement;
      visual.append(document.importNode(parsed, true));
    } else if (item.src) visual.append(thumbnail(item));
    else {
      visual.textContent = item.glyph || '◇';
      if (item.font) visual.style.fontFamily = item.font;
    }
    return visual;
  }
  function iconGrid() {
    const grid = make('div', 'icon-grid');
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const entry = make('article', 'icon-entry');
      const source = make('small', '', item.source);
      const label = make('strong', '', item.label);
      label.title = item.label;
      const actions = make('div', 'icon-actions');
      const code = item.svg || item.glyph || item.src;
      if (code) {
        actions.append(button(tr('copyCode'), () => copy(code, Boolean(item.svg)), 'copy'));
        actions.append(button(tr('download'), () => {
          if (item.svg) save(item.svg, item.label + '.svg');
          else if (item.src) download(item.src);
          else save(item.glyph, 'unicode.txt', 'text/plain');
        }, 'download'));
      }
      entry.append(iconVisual(item), label, source, actions);
      fragment.append(entry);
    }
    grid.append(fragment);
    return grid;
  }
  function render() {
    const position = section.querySelector('.strip')?.scrollLeft || 0;
    const activeAction = shadow.activeElement?.dataset.galleryAction;
    controller?.abort();
    controller = undefined;
    const item = items[selected];
    const title = make('h2', '', kind === 'icons' ? tr('icons') : item.label);
    title.id = 'atlas-gallery-title';
    const bar = make('div', 'gallery-bar');
    const heading = make('div', 'gallery-heading');
    heading.append(title, make('small', '', kind === 'icons' ? String(items.length) : (selected + 1) + ' / ' + items.length));
    const actions = make('div', 'gallery-toolbar');
    const url = item.src || item.url;
    if (kind !== 'icons') {
      if (url) actions.append(button(tr('copyLink'), () => copy(url), 'copy'), button(tr('download'), () => download(url), 'download'));
      actions.append(button(tr('jump'), () => { modal.close(); navigate(item); }));
    }
    const close = button(tr('close'), () => modal.close(), 'close');
    close.dataset.galleryAction = 'close';
    actions.append(close);
    bar.append(heading, actions);
    section.replaceChildren(bar);
    if (kind === 'icons') { section.append(iconGrid()); return; }
    const stage = make('div', 'gallery-stage');
    if (kind === 'files') renderDocument(item, stage);
    else {
      const preview = image(item.src, item.label);
      preview.addEventListener('error', () => preview.replaceWith(make('p', '', tr('previewUnavailable'))), { once: true });
      stage.append(preview);
    }
    if (items.length > 1) {
      const previous = button(tr('previous'), () => move(-1), 'previous');
      const next = button(tr('next'), () => move(1), 'next');
      previous.dataset.galleryAction = 'previous';
      next.dataset.galleryAction = 'next';
      stage.prepend(previous);
      stage.append(next);
    }
    const strip = make('div', 'strip');
    for (const [index, option] of items.entries()) {
      const thumb = make('button', 'strip-thumb');
      thumb.type = 'button';
      thumb.title = option.label;
      thumb.setAttribute('aria-label', option.label);
      thumb.setAttribute('aria-current', String(index === selected));
      thumb.append(thumbnail(option));
      thumb.addEventListener('click', () => { selected = index; render(); });
      strip.append(thumb);
    }
    section.append(stage, strip);
    strip.scrollLeft = position;
    const active = strip.children[selected];
    if (active) {
      const remaining = active.getBoundingClientRect();
      const bounds = strip.getBoundingClientRect();
      if (remaining.left < bounds.left || remaining.right > bounds.right) {
        active.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    }
    if (activeAction) section.querySelector('[data-gallery-action="' + activeAction + '"]')?.focus({ preventScroll: true });
  }
  function move(delta) { selected = (selected + delta + items.length) % items.length; render(); }
  modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
  modal.addEventListener('close', () => {
    if (modal.open) return;
    controller?.abort();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    section.replaceChildren();
  });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') event.stopPropagation();
    if (kind === 'icons' || items.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    move(event.key === 'ArrowRight' ? 1 : -1);
  });
  function open(nextKind, list, item, origin) {
    if (modal.open || !list.length) return;
    kind = nextKind;
    items = list;
    selected = Math.max(0, list.indexOf(item));
    opener = origin;
    notice.hidden = true;
    const pref = preferences();
    modal.dataset.theme = pref.theme;
    modal.dir = pref.lang === 'he' ? 'rtl' : 'ltr';
    modal.setAttribute('aria-labelledby', 'atlas-gallery-title');
    render();
    modal.showModal();
    section.querySelector('[data-gallery-action=close]')?.focus({ preventScroll: true });
  }
  const notice = make('div', 'gallery-notice');
  notice.setAttribute('role', 'status');
  modal.append(notice);
  let noticeTimer;
  return { open, copy, save, destroy() { controller?.abort(); clearTimeout(noticeTimer); if (modal.open) modal.close(); }, notify(message) {
    if (!modal.open) return false;
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 2000);
    return true;
  } };
}
