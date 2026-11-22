(() => {
  const defaults = { open: false, side: 'right', theme: 'system', lang: navigator.language.split('-')[0] };
  const kinds = ['overview', 'media', 'icons', 'colors'];
  const paths = {
    brand: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
    outline: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1"/>',
    messages: '<path d="M4 4h16v12H9l-5 4zM8 9h8m-8 3h5"/>',
    videos: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4z"/>',
    images: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1"/><path d="m4 17 5-4 3 2 4-5 4 5"/>',
    files: '<path d="M6 3h8l4 4v14H6zm8 0v5h4M9 13h6m-6 4h6"/>',
    links: '<path d="m10 8 3-3a4 4 0 0 1 6 6l-3 3m-2 2-3 3a4 4 0 0 1-6-6l3-3m1 5 6-6"/>',
    colors: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16m-7-4 14-8m-14 0 14 8"/>',
    icons: '<path d="m12 3 9 9-9 9-9-9z"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
  const make = (tag, className, label) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (label) element.textContent = label;
    return element;
  };
  const clean = text => (text || '').replace(/\s+/g, ' ').trim();
  const normalize = s => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const role = document.location.hostname;
  const gmail = role === 'mail.google.com';
  const chatgpt = role === 'chatgpt.com' || role === 'chat.openai.com';
  const filePattern = /\.(pdf|docx?|xlsx?|pptx?|csv|zip|txt|rtf|odt|ods|epub|json|md|7z|tar|gz)(?:$|[?#])/i;
  const kb = 'https://github.com/usdrawing/PageAtlas/blob/main/docs/';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let preferences = defaults, host, ui, observer, timer, pulse, filter = 'overview';
  let overviewTitle, mediaFilter = 'images', palette = [], paletteDirty = true, gallery, dockSheet, toastTimer;
  const tr = key => (atlasGalleryLanguages[preferences.lang] || atlasGalleryLanguages.en)[key];
  let query = '', settingsOpen = false, records = [], current;
  let sheetPromise;
  const t = i => (atlasLanguages[preferences.lang] || atlasLanguages.en)[i];

  function scan() {
    paletteDirty = true;
    if (filter === 'colors') { renderResults(); return; }
    const root = (gmail || chatgpt) ? document.querySelector('main,[role="main"]') || document.body : document.body;
    const selector = 'h1,h2,h3,h4,h5,h6,[role=heading],img,video,svg,[class*="material-icons"],[class*="material-symbols"],[role=img],span,a[href],[download],[download_url],p,li,blockquote,pre,td,[role=article],[data-message-author-role],[data-message-id],[data-testid="message-container"],.a3s';
    const items = [];
    const seen = new Set();
    for (const node of root.querySelectorAll(selector)) {
      if (node.matches('span:not([class*="material-"]):not([role=img])') && (node.childElementCount || !node.textContent.trim() || node.textContent.length > 300 || !node.textContent.match(atlasInspect.glyphs))) continue;
      if (node.closest('script,style,[hidden],[inert]') || !node.getClientRects().length) continue;
      const style = getComputedStyle(node);
      if (style.visibility !== 'visible' || style.contentVisibility === 'hidden') continue;
      if (node.matches('span') && node.childElementCount) continue;
      let label = clean(node.getAttribute('aria-label') || node.getAttribute('title'));
      let detail = '', type, src, level, url, source, svg, glyph, font, poster;
      if (node.matches('h1,h2,h3,h4,h5,h6,[role=heading]')) {
        type = 'outline';
        level = Number(node.getAttribute('aria-level') || node.tagName.slice(1)) || 1;
        label ||= clean(node.innerText);
      } else if (node instanceof HTMLImageElement) {
        type = 'images';
        src = atlasInspect.safeURL(node.currentSrc || node.src, true);
        if (!src) continue;
        label ||= clean(node.alt);
        if (!label && !/^(?:data:|blob:)/i.test(src)) label = atlasInspect.filename(src).slice(0, 80);
        label ||= tr('imageSource');
      } else if (node instanceof HTMLVideoElement) {
        type = 'videos';
        url = atlasInspect.safeMediaURL(node.currentSrc || node.getAttribute('src') || node.querySelector('source[src]')?.getAttribute('src'));
        poster = atlasInspect.safeURL(node.getAttribute('poster'), true);
        label ||= /^https?:/i.test(url) && atlasInspect.filename(url) || tr('video');
      } else if (node.matches('svg,[role=img],span,[class*="material-icons"],[class*="material-symbols"]')) {
        const iconInfo = atlasInspect.identify(node);
        if (iconInfo) {
          ({ source, svg, glyph, font } = iconInfo);
          label ||= iconInfo.label || source;
          if (!svg && !glyph) continue;
          if (svg && source === 'SVG' && !atlasInspect.isSVGIcon(node)) {
            type = 'images';
            src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            label = iconInfo.label || 'SVG';
          }
        } else {
          for (const [glyph] of node.innerText?.matchAll(atlasInspect.glyphs) || []) {
            const key = 'unicode:' + glyph;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({ node, type: 'icons', label: glyph, glyph, source: 'Unicode', match: normalize(glyph + ' Unicode') });
          }
          continue;
        }
        type ||= 'icons';
      } else if (node.matches('[download],[download_url],a[href]')) {
        const href = node.getAttribute('href') || '';
        url = atlasInspect.safeURL(href);
        const filename = node.getAttribute('download') || '';
        const attachment = node.getAttribute('download_url');
        if (attachment) url = atlasInspect.safeURL(attachment.match(/(?:https?:|blob:).+$/i)?.[0]) || url;
        label ||= clean(node.innerText) || filename;
        const isDrive = /https:\/\/(?:drive|docs)\.google\.com\//i.test(url);
        const isFile = node.hasAttribute('download') || attachment || filePattern.test(url) || filePattern.test(label) || isDrive;
        if (!isFile && (!url || /^(?:#|javascript:)/i.test(url))) continue;
        type = isFile ? 'files' : 'links';
        if (url && /\.(?:gif|png|apng|jpe?g|avif|webp|svgz?|bmp|ico|tiff?|jxl|heic)(?:[?#]|$)/i.test(url)) {
          type = 'images';
          src = url;
        } else if (url && /\.(?:mp4|webm|ogv|mov|m4v|mkv)(?:[?#]|$)/i.test(url)) type = 'videos';
        if (!label && attachment) label = attachment.split(':').slice(1, 2)[0];
        if (!label && url) {
          try { label = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()) || new URL(url, location.href).hostname; } catch {}
        }
      } else {
        const message = node.matches('[data-message-author-role],[data-message-id],[data-testid="message-container"],.a3s') ||
          node.matches('[role=article]') && /(?:slack|teams|discord|whatsapp)\./i.test(role);
        if (message && node.querySelector('[data-message-author-role],.a3s')) continue;
        if (!message && !node.matches('p,li,blockquote,pre,td')) continue;
        if (!message && node.matches('li,blockquote,td') && node.querySelector('p,li,pre')) continue;
        const body = clean(node.innerText);
        if (body.length < (message ? 1 : 4)) continue;
        type = message ? 'messages' : 'text';
        label = body.slice(0, message ? 76 : 160);
        detail = message ? clean(node.getAttribute('data-message-author-role') || body.slice(76, 175)) : '';
        if (chatgpt && message) detail = body.slice(76, 175);
        if (gmail && message) {
          const wrapper = node.closest('[data-message-id]');
          const sender = wrapper?.querySelector('[email], [data-hovercard-id]');
          detail = clean(sender?.textContent || sender?.getAttribute('email')) || detail;
        }
        items.push({ node, type, label, detail, match: normalize(body) });
        if (!node.querySelector('span,p,li')) for (const [glyph] of body.matchAll(atlasInspect.glyphs)) {
          const key = 'unicode:' + glyph;
          if (!seen.has(key)) items.push({ node, type: 'icons', label: glyph, glyph, source: 'Unicode', match: normalize(glyph + ' Unicode') });
          seen.add(key);
        }
        continue;
      }
      if (!label) continue;
      label = label.slice(0, 250);
      if (['icons', 'images', 'files', 'videos'].includes(type)) {
        const key = type + ':' + (svg || glyph || src || url || (type === 'videos' ? items.length : label));
        if (seen.has(key)) continue;
        seen.add(key);
      }
      items.push({ node, type, label, src, level, url, poster, source, svg, glyph, font, match: normalize(label + ' ' + (source || '')) });
    }
    const main = document.querySelector('main,[role=main]') || root;
    const candidates = items.filter(item => item.type === 'outline' && item.level === 1);
    const heading = candidates.find(item => main.contains(item.node)) || candidates[0];
    const labelled = clean(main.getAttribute('aria-label') || main.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent).filter(Boolean).join(' '));
    overviewTitle = heading || { node: main, label: labelled || clean(document.title) || location.hostname };
    records = items;
    renderResults();
    updateCurrent();
  }

  function updateCurrent() {
    if (!host || settingsOpen || filter !== 'overview') return;
    const headings = records.filter(item => item.type === 'outline');
    const threshold = Math.min(140, innerHeight / 4);
    const visible = headings.filter(item => item.node.getBoundingClientRect().bottom > 0 &&
      item.node.getBoundingClientRect().top <= threshold);
    const next = visible.at(-1)?.node ||
      headings.filter(item => item.node.getBoundingClientRect().top <= threshold).at(-1)?.node;
    if (current === next && ui.results.querySelector('[aria-current]')) return;
    current = next;
    ui.results.querySelector('[aria-current]')?.removeAttribute('aria-current');
    const index = records.findIndex(item => item.node === current);
    if (index >= 0) ui.results.querySelector('[data-index="' + index + '"]')?.setAttribute('aria-current', 'location');
  }

  function navigate(item) {
    if (!item.node.isConnected) return scan();
    item.node.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
    pulse?.cancel();
    if (!reducedMotion.matches) pulse = item.node.animate([
      { outline: '3px solid #2b976f', outlineOffset: '4px' },
      { outline: '3px solid #2b976f00', outlineOffset: '4px' }
    ], { duration: 1400, easing: 'ease-out' });
  }

  function renderResults() {
    if (!host || settingsOpen) return;
    ui.resultHeader.hidden = true;
    if (filter === 'colors') return renderPalette();
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const filtered = records.filter(item => {
      if (filter === 'overview') {
        if (!['outline', 'messages'].includes(item.type) && !(words.length && ['text', 'links'].includes(item.type))) return false;
      } else if (item.type !== (filter === 'media' ? mediaFilter : filter)) return false;
      return words.every(word => item.match.includes(word));
    });
    ui.status.textContent = new Intl.NumberFormat(preferences.lang in atlasLanguages ? preferences.lang : 'en').format(filtered.length) + ' · ' + t(25);
    const focused = ui.results.getRootNode().activeElement?.dataset.index;
    const fragment = document.createDocumentFragment();
    if (!filtered.length) {
      const empty = make('div', 'empty');
      empty.append(make('strong', '', t(words.length ? 21 : 23)), make('span', '', t(words.length ? 22 : 24)));
      fragment.append(empty);
    }
    if (filter === 'overview' && overviewTitle) {
      const heading = make('button', 'overview-title', overviewTitle.label);
      heading.dir = 'auto';
      heading.addEventListener('click', () => navigate(overviewTitle));
      ui.resultHeader.replaceChildren(heading);
      ui.resultHeader.hidden = false;
    } else if (filter !== 'overview' && filtered.length) {
      const kind = filter === 'media' ? mediaFilter : filter;
      const open = make('button', 'gallery-action open-gallery', tr('openGallery'));
      open.addEventListener('click', () => gallery.open(kind, filtered, filtered[0], open));
      ui.resultHeader.replaceChildren(open);
      ui.resultHeader.hidden = false;
    }
    const positions = new Map(records.map((item, index) => [item, index]));
    filtered.forEach(item => {
      if (!words.length && filter === 'overview' && item === overviewTitle) return;
      const row = make('button', 'item');
      row.dataset.type = item.type;
      row.type = 'button';
      row.dataset.index = positions.get(item);
      if (item.node === current && item.type === 'outline') row.setAttribute('aria-current', 'location');
      if (item.level) row.style.paddingInlineStart = (7 + Math.min(4, item.level - 1) * 8) + 'px';
      if (item.glyph) {
        const glyph = make('span', 'row-glyph', item.glyph);
        if (item.font) glyph.style.fontFamily = item.font;
        row.append(glyph);
      } else if (item.svg) {
        const visual = atlasInspect.svgPreview(item.svg);
        if (item.type === 'images') visual.classList.add('svg-thumb');
        row.append(visual);
      } else if (item.type === 'videos') {
        row.append(gallery.thumbnail(item));
      } else if (item.src || item.poster) {
        const thumb = make('img');
        thumb.src = item.poster || item.src;
        thumb.loading = 'lazy';
        thumb.alt = '';
        thumb.referrerPolicy = 'no-referrer';
        row.append(thumb);
      } else row.innerHTML = icon(item.type === 'text' ? 'messages' : item.type);
      const copy = make('span');
      copy.dir = 'auto';
      let title = item.label;
      if (words.length && (item.type === 'text' || item.type === 'messages')) {
        const full = clean(item.node.innerText);
        const index = normalize(full).indexOf(words[0]);
        if (index > 50) title = '…' + full.slice(index - 40, index + 105);
      }
      copy.append(make('strong', '', title));
      if (item.source || item.detail && item.detail !== title) copy.append(make('small', '', item.source || item.detail));
      row.append(copy);
      row.addEventListener('click', () => navigate(item));
      fragment.append(row);
    });
    ui.results.replaceChildren(fragment);
    gallery.pruneFrames();
    if (focused !== undefined) ui.results.querySelector('[data-index="' + focused + '"]')?.focus({ preventScroll: true });
  }

  function announce(message) {
    if (!host || gallery?.notify(message)) return;
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    toastTimer = setTimeout(() => { if (host) ui.toast.hidden = true; }, 2000);
  }

  function renderPalette() {
    if (paletteDirty) { palette = atlasInspect.colors(document.body); paletteDirty = false; }
    const shown = palette.filter(color => color.includes(query.trim().toUpperCase()));
    ui.status.textContent = shown.length + ' · ' + tr('colors');
    if (!shown.length) {
      ui.results.replaceChildren(make('p', 'empty', t(21)));
      return;
    }
    const toolbar = make('div', 'palette-tools');
    const css = make('button', 'gallery-action', tr('copyCode'));
    css.addEventListener('click', () => gallery.copy(':root {\n' + shown.map((color, index) => '  --color-' + (index + 1) + ': ' + color + ';').join('\n') + '\n}'));
    const svg = make('button', 'gallery-action', tr('copySvg'));
    svg.addEventListener('click', () => gallery.copy(atlasInspect.paletteSVG(shown), true));
    const save = make('button', 'gallery-action', tr('saveSvg'));
    save.addEventListener('click', () => gallery.save(atlasInspect.paletteSVG(shown), 'pageatlas-palette.svg'));
    toolbar.append(css, svg, save);
    const swatches = make('div', 'swatches');
    for (const color of shown) {
      const button = make('button', 'swatch');
      button.title = tr('copyCode') + ' ' + color;
      const preview = make('span', 'swatch-color');
      preview.style.backgroundColor = color;
      button.append(preview, make('span', '', color));
      button.addEventListener('click', () => gallery.copy(color));
      swatches.append(button);
    }
    ui.results.replaceChildren(toolbar, swatches);
  }

  function setPreference(key, value) {
    preferences = { ...preferences, [key]: value };
    chrome.storage.local.set({ [key]: value });
    applyPreferences();
  }

  function applyPreferences() {
    if (!host) return;
    host.dataset.side = preferences.side;
    ui.shell.dataset.theme = preferences.theme;
    ui.shell.dir = preferences.lang === 'he' ? 'rtl' : 'ltr';
    ui.shell.lang = preferences.lang in atlasLanguages ? preferences.lang : 'en';
    ui.subtitle.textContent = t(8);
    ui.search.placeholder = t(0);
    ui.search.setAttribute('aria-label', t(0));
    ui.gear.setAttribute('aria-label', t(settingsOpen ? 27 : 26));
    ui.gear.title = t(settingsOpen ? 27 : 26);
    ui.close.setAttribute('aria-label', t(10));
    ui.close.title = t(10);
    ui.privacy.textContent = t(19);
    ui.terms.textContent = t(20);
    ui.filters.replaceChildren(...kinds.map(kind => {
      const button = make('button', 'filter', tr(kind));
      button.type = 'button';
      button.dataset.kind = kind;
      button.setAttribute('aria-pressed', String(filter === kind));
      button.addEventListener('click', () => {
        filter = kind;
        ui.results.scrollTop = 0;
        applyPreferences();
        ui.filters.querySelector('[data-kind="' + kind + '"]')?.focus();
        if (kind !== 'colors') scan();
      });
      return button;
    }));
    ui.media.hidden = filter !== 'media';
    ui.media.replaceChildren(...['images', 'videos', 'files'].map(kind => {
      const button = make('button', 'filter', kind === 'videos' ? tr('videos') : t(kind === 'images' ? 4 : 5));
      button.dataset.media = kind;
      button.setAttribute('aria-pressed', String(kind === mediaFilter));
      button.addEventListener('click', () => {
        mediaFilter = kind;
        ui.results.scrollTop = 0;
        applyPreferences();
        ui.media.querySelector('[data-media="' + kind + '"]')?.focus();
      });
      return button;
    }));
    if (settingsOpen) renderSettings();
    renderResults();
  }

  function renderSettings() {
    const previouslyFocused = ui.settings.getRootNode().activeElement?.dataset.preference;
    const fields = [
      ['lang', 11, Object.entries({ en: 'English', he: 'עברית', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português' })],
      ['theme', 12, [['system', t(13)], ['light', t(14)], ['dark', t(15)]]],
      ['side', 16, [['left', t(17)], ['right', t(18)]]]
    ];
    ui.settings.replaceChildren(make('h2', '', t(9)), ...fields.map(([key, label, options]) => {
      const wrapper = make('label', '', t(label));
      const select = make('select');
      select.dataset.preference = key;
      for (const [value, name] of options) {
        const option = make('option', '', name);
        option.value = value;
        select.append(option);
      }
      select.value = key === 'lang' && !(preferences.lang in atlasLanguages) ? 'en' : preferences[key];
      select.addEventListener('change', () => setPreference(key, select.value));
      wrapper.append(select);
      return wrapper;
    }));
    if (previouslyFocused) ui.settings.querySelector('[data-preference="' + previouslyFocused + '"]')?.focus();
  }

  function toggleSettings(force) {
    settingsOpen = force ?? !settingsOpen;
    ui.settings.hidden = !settingsOpen;
    ui.controls.hidden = ui.status.hidden = ui.results.hidden = settingsOpen;
    if (settingsOpen) ui.resultHeader.hidden = true;
    applyPreferences();
  }

  async function mount() {
    if (host || !preferences.open) return;
    sheetPromise ||= chrome.runtime.sendMessage({ type: 'stylesheet' }).then(css => {
      if (!css) throw new Error('Styles unavailable');
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    }).catch(error => {
      sheetPromise = undefined;
      throw error;
    });
    const sheet = await sheetPromise;
    if (host || !preferences.open) return;
    host = make('page-atlas-panel');
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.adoptedStyleSheets = [sheet];
    const shell = make('aside', 'shell');
    shell.setAttribute('aria-label', 'PageAtlas');
    const header = make('header');
    const mark = make('span', 'brand');
    mark.innerHTML = icon('brand');
    const wordmark = make('div', 'wordmark');
    const subtitle = make('small');
    wordmark.append(make('strong', '', 'PageAtlas'), subtitle);
    const gear = make('button', 'iconbtn');
    gear.innerHTML = icon('settings');
    gear.addEventListener('click', () => toggleSettings());
    const close = make('button', 'iconbtn');
    close.innerHTML = icon('close');
    close.addEventListener('click', () => setOpen(false));
    header.append(mark, wordmark, gear, close);
    const controls = make('div', 'controls');
    const studioTools = make('div', 'studio-tools');
    const studioLabels = {
      en: ['Capture', 'Section', 'Responsive', 'Studio', 'Point to an element and click. Esc to cancel.'],
      he: ['צילום', 'סקשן', 'גדלים', 'סטודיו', 'בחרו אלמנט בלחיצה. Esc לביטול.'],
      es: ['Capturar', 'Sección', 'Adaptable', 'Estudio', 'Selecciona un elemento. Esc para cancelar.'],
      fr: ['Capturer', 'Section', 'Adaptatif', 'Studio', 'Cliquez sur un élément. Échap pour annuler.'],
      de: ['Aufnehmen', 'Bereich', 'Größen', 'Studio', 'Element anklicken. Esc zum Abbrechen.'],
      pt: ['Capturar', 'Seção', 'Tamanhos', 'Estúdio', 'Selecione um elemento. Esc para cancelar.']
    };
    for (const [index, kind] of ['page', 'selection', 'responsive', 'studio'].entries()) {
      const control = make('button', 'filter', (studioLabels[preferences.lang] || studioLabels.en)[index]);
      control.addEventListener('click', async () => {
        control.disabled = true;
        try {
          const message = kind === 'studio' ? { type: 'open-studio' } : kind === 'selection' ?
            { type: 'choose-element', help: (studioLabels[preferences.lang] || studioLabels.en)[4] } :
            { type: 'capture', mode: 'page', responsive: kind === 'responsive' };
          const result = await chrome.runtime.sendMessage(message);
          if (result?.error) announce(result.error);
        } catch (error) { announce(error.message); }
        finally { control.disabled = false; }
      });
      studioTools.append(control);
    }
    const searchLabel = make('label', 'search');
    searchLabel.innerHTML = icon('search');
    const search = make('input');
    search.type = 'search';
    search.value = query;
    const filters = make('div', 'filters');
    const media = make('div', 'media-filters');
    const toast = make('div', 'toast');
    toast.setAttribute('role', 'status');
    toast.hidden = true;
    const status = make('div', 'status');
    status.setAttribute('aria-live', 'polite');
    const resultHeader = make('div', 'result-header');
    resultHeader.hidden = true;
    const results = make('div', 'results');
    const settings = make('section', 'settings');
    const footer = make('footer');
    const privacy = make('a'), terms = make('a');
    for (const [link, path] of [[privacy, 'privacy.md'], [terms, 'terms.md']]) {
      link.href = kb + path;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    footer.append(privacy, terms);
    search.addEventListener('input', () => {
      query = search.value;
      results.scrollTop = 0;
      renderResults();
    });
    search.addEventListener('keydown', event => {
      if (event.key === 'Enter') results.querySelector('button')?.focus();
    });
    results.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const next = event.key === 'ArrowDown' ? event.target.nextElementSibling : event.target.previousElementSibling;
      if (next instanceof HTMLButtonElement) {
        event.preventDefault();
        next.focus();
      }
    });
    shadow.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (settingsOpen) toggleSettings(false);
        else setOpen(false);
      }
    });
    searchLabel.append(search);
    controls.append(studioTools, searchLabel, filters, media);
    shell.append(header, controls, status, resultHeader, results, settings, footer);
    shadow.append(shell, toast);
    gallery = createAtlasGallery({ shadow, make, tr, preferences: () => preferences, navigate, feedback: announce });
    ui = { shell, subtitle, gear, close, controls, search, filters, media, status, resultHeader, results, settings, privacy, terms, toast };
    dockSheet = new CSSStyleSheet();
    dockSheet.replaceSync('html:has(> page-atlas-panel[data-side="right"]) { margin-right: min(288px, 50vw) !important; max-width: calc(100% - min(288px, 50vw)) !important; } html:has(> page-atlas-panel[data-side="left"]) { margin-left: min(288px, 50vw) !important; max-width: calc(100% - min(288px, 50vw)) !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, dockSheet];
    document.documentElement.append(host);
    toggleSettings(false);
    scan();
    observer = new MutationObserver(() => {
      if (!timer) timer = setTimeout(() => { timer = undefined; scan(); }, 250);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['src', 'srcset', 'poster', 'href', 'aria-expanded', 'hidden', 'aria-hidden', 'download', 'class', 'style'] });
    document.addEventListener('loadedmetadata', onMediaLoad, true);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  }

  function onMediaLoad() { if (host) scan(); }

  let frame;
  function onScroll() {
    if (!frame) frame = requestAnimationFrame(() => { frame = undefined; updateCurrent(); });
  }

  function unmount() {
    observer?.disconnect();
    clearTimeout(timer);
    timer = undefined;
    cancelAnimationFrame(frame);
    frame = undefined;
    document.removeEventListener('loadedmetadata', onMediaLoad, true);
    document.removeEventListener('scroll', onScroll, true);
    clearTimeout(toastTimer);
    if (dockSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== dockSheet);
    dockSheet = undefined;
    gallery?.destroy();
    gallery = undefined;
    host?.remove();
    host = undefined;
    records = [];
    current = undefined;
    filter = 'overview';
    mediaFilter = 'images';
    palette = [];
    paletteDirty = true;
  }

  function syncPanel() {
    if (preferences.open) mount().catch(error => console.warn('PageAtlas:', error));
    else unmount();
  }

  function setOpen(open) {
    setPreference('open', open);
    syncPanel();
  }

  const ready = chrome.storage.local.get(defaults).then(saved => {
    preferences = saved;
    syncPanel();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(changes)) {
      if (key in defaults) preferences[key] = changes[key].newValue ?? defaults[key];
    }
    if (changes.open) syncPanel();
    if (changes.lang || changes.theme || changes.side) applyPreferences();
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.type === 'capture-prepare') { unmount(); reply({ ok: true }); return; }
    if (message.type === 'capture-restore') { syncPanel(); reply({ ok: true }); return; }
    if (message.type !== 'toggle') return;
    ready.then(() => {
      setOpen(!preferences.open);
      reply({ open: preferences.open });
    });
    return true;
  });
})();
