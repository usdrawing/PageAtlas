function createAtlasGallery({ shadow, make, tr, preferences, navigate, feedback }) {
  const modal = make('dialog', 'atlas-modal shell');
  const section = make('section', 'gallery');
  modal.append(section);
  shadow.append(modal);
  let items = [], selected = 0, kind, opener, controller;
  const previewURLs = new Set();
  function previewURL(blob) {
    const url = URL.createObjectURL(blob);
    previewURLs.add(url);
    return url;
  }
  function clearDocument() {
    controller?.abort();
    controller = undefined;
    for (const url of previewURLs) URL.revokeObjectURL(url);
    previewURLs.clear();
  }
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
  const pendingFrames = new Map();
  const frameObserver = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      frameObserver.unobserve(target);
      const url = pendingFrames.get(target);
      pendingFrames.delete(target);
      if (url) target.src = url;
    }
  });
  function pruneFrames() {
    for (const video of pendingFrames.keys()) {
      if (video.isConnected) continue;
      frameObserver.unobserve(video);
      pendingFrames.delete(video);
    }
  }
  function thumbnail(item) {
    if (item.svg) return atlasInspect.svgPreview(item.svg);
    if (item.poster || item.src) {
      const img = image(item.poster || item.src, '');
      img.loading = 'lazy';
      return img;
    }
    if (item.type === 'videos' && item.url && !item.node.srcObject) {
      const film = make('span', 'video-thumb');
      const video = make('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-hidden', 'true');
      video.addEventListener('loadedmetadata', () => {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA && video.seekable.length) {
          video.currentTime = video.seekable.start(0) + Math.min(0.05, (video.seekable.end(0) - video.seekable.start(0)) / 2);
        }
      }, { once: true });
      video.addEventListener('loadeddata', () => film.classList.add('has-frame'), { once: true });
      film.append(make('span', 'file-format', tr('video')), video);
      pendingFrames.set(video, item.url);
      frameObserver.observe(video);
      return film;
    }
    const type = make('span', 'file-format', (item.type === 'videos' ? tr('video') : atlasDocuments.type(item)?.toUpperCase() || 'FILE'));
    return type;
  }
  function renderDocument(item, stage) {
    const contents = make('div', 'document-preview');
    contents.append(make('p', '', tr('loading')));
    stage.append(contents);
    const abort = new AbortController();
    controller = abort;
    const loadingTimeout = setTimeout(() => abort.abort('timeout'), 12000);
    const openOriginal = () => {
      const open = make('a', 'document-open', tr('open'));
      open.href = item.url;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      return open;
    };
    const addPDF = url => {
      contents.remove();
      const frame = make('iframe', 'pdf-preview');
      frame.title = item.label;
      frame.src = url;
      stage.append(frame, openOriginal());
    };
    const unavailable = () => {
      if (item.url && atlasDocuments.type(item) === 'pdf') return addPDF(item.url);
      contents.replaceChildren(make('p', '', tr('previewUnavailable')));
      if (item.url) contents.append(openOriginal());
    };
    if (!item.url) { clearTimeout(loadingTimeout); unavailable(); return; }
    atlasDocuments.preview(item, abort.signal).then(data => {
      if (controller !== abort || !modal.open) return;
      if (data?.pdf) return addPDF(previewURL(data.pdf));
      if (!data || !(data.text || data.blocks?.length || data.slides?.length || data.sheets?.length)) return unavailable();
      contents.replaceChildren();
      if (data.text) {
        const paper = make('article', 'document-paper');
        paper.append(make('pre', '', data.text));
        contents.append(paper);
      }
      if (data.blocks?.length) {
        const paper = make('article', 'document-paper');
        for (const block of data.blocks) {
          if (block.rows) { paper.append(renderTable(block.rows)); continue; }
          const heading = /^(?:heading\s*([1-3])|title)$/i.exec(block.style);
          const paragraph = make(heading ? 'h' + (heading[1] || 1) : 'p');
          paragraph.dir = 'auto';
          if (['left', 'right', 'center', 'justify'].includes(block.align)) paragraph.style.textAlign = block.align;
          for (const run of block.runs) {
            const span = make(run.bold ? 'strong' : 'span', '', run.text);
            if (run.italic) span.style.fontStyle = 'italic';
            paragraph.append(span);
          }
          if (!paragraph.textContent) paragraph.append(make('br'));
          paper.append(paragraph);
          for (const blob of block.images) paper.append(image(previewURL(blob), ''));
        }
        contents.append(paper);
      }
      for (const [index, slide] of (data.slides || []).entries()) {
        const page = make('article', 'document-slide');
        page.setAttribute('aria-label', tr('slide') + ' ' + (index + 1));
        page.style.aspectRatio = String(slide.ratio);
        for (const shape of slide.shapes) {
          const block = make('div', 'slide-shape');
          if (shape.box?.every(Number.isFinite)) {
            block.classList.add('placed');
            ['left', 'top', 'width', 'height'].forEach((property, index) => { block.style[property] = shape.box[index] * 100 + '%'; });
          }
          if (shape.image) block.append(image(previewURL(shape.image), ''));
          for (const line of shape.lines) block.append(make('p', '', line));
          page.append(block);
        }
        contents.append(page);
      }
      for (const [index, sheet] of (data.sheets || []).entries()) {
        const wrapper = make('section', 'document-sheet');
        wrapper.append(make('h3', '', tr('sheet') + ' ' + (index + 1)), renderTable(sheet, true));
        contents.append(wrapper);
      }
    }).catch(() => { if (controller === abort && modal.open) unavailable(); }).finally(() => clearTimeout(loadingTimeout));
  }

  function renderTable(rows, spreadsheet = false) {
    const table = make('table');
    const body = make('tbody');
    const columns = Math.max(0, ...rows.map(row => row.length));
    if (spreadsheet) {
      const head = make('thead');
      const row = make('tr');
      row.append(make('th'));
      for (let index = 0; index < columns; index++) row.append(make('th', '', String.fromCharCode(65 + index)));
      head.append(row);
      table.append(head);
    }
    for (const [index, values] of rows.entries()) {
      const row = make('tr');
      if (spreadsheet) row.append(make('th', '', String(index + 1)));
      const length = spreadsheet ? columns : values.length;
      for (let index = 0; index < length; index++) row.append(make('td', '', values[index]));
      body.append(row);
    }
    table.append(body);
    return table;
  }

  function iconVisual(item) {
    const visual = make('div', 'icon-visual');
    if (item.svg) {
      visual.append(atlasInspect.svgPreview(item.svg));
    } else if (item.src) visual.append(thumbnail(item));
    else {
      const glyph = make('span', '', item.glyph || '◇');
      if (item.font) glyph.style.fontFamily = item.font;
      visual.append(glyph);
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
    clearDocument();
    const item = items[selected];
    const title = make('h2', '', kind === 'icons' ? tr('icons') : item.label);
    title.id = 'atlas-gallery-title';
    const bar = make('div', 'gallery-bar');
    const heading = make('div', 'gallery-heading');
    heading.append(title, make('small', '', kind === 'icons' ? String(items.length) : (selected + 1) + ' / ' + items.length));
    const actions = make('div', 'gallery-toolbar');
    const url = item.src || item.url;
    if (kind !== 'icons') {
      if (url && !/^(?:data:|blob:)/i.test(url)) actions.append(button(tr('copyLink'), () => copy(url), 'copy'));
      if (item.svg && kind === 'images') actions.append(button(tr('download'), () => save(item.svg, 'pageatlas-image.svg'), 'download'));
      else if (url && !(kind === 'videos' && url.startsWith('blob:'))) actions.append(button(tr('download'), () => download(url), 'download'));
      actions.append(button(tr('jump'), () => { modal.close(); navigate(item); }));
    }
    const close = button(tr('close'), () => modal.close(), 'close');
    close.dataset.galleryAction = 'close';
    actions.append(close);
    bar.append(heading, actions);
    section.replaceChildren(bar);
    if (kind === 'icons') { section.append(iconGrid()); return; }
    const stage = make('div', 'gallery-stage');
    stage.dataset.kind = kind;
    if (kind === 'files') renderDocument(item, stage);
    else if (kind === 'videos') {
      if (item.url && !item.node.srcObject) {
        const video = make('video', 'video-preview');
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        if (item.poster) video.poster = item.poster;
        video.src = item.url;
        video.addEventListener('error', () => video.replaceWith(make('p', '', tr('videoUnavailable'))), { once: true });
        stage.append(video);
      } else stage.append(make('p', '', tr('videoUnavailable')));
    } else if (item.svg) {
      const preview = atlasInspect.svgPreview(item.svg);
      preview.classList.add('svg-preview');
      preview.setAttribute('aria-label', item.label);
      stage.append(preview);
    } else {
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
    strip.dataset.kind = kind;
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
    pruneFrames();
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
    clearDocument();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    section.replaceChildren();
    pruneFrames();
  });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') event.stopPropagation();
    if (event.target instanceof HTMLVideoElement || kind === 'icons' || items.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
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
  return { open, copy, save, thumbnail, pruneFrames, destroy() { frameObserver.disconnect(); pendingFrames.clear(); clearDocument(); clearTimeout(noticeTimer); if (modal.open) modal.close(); }, notify(message) {
    if (!modal.open) return false;
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 2000);
    return true;
  } };
}
