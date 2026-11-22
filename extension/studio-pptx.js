/* Native Open XML export. All text remains editable in PowerPoint. */
async function atlasPptx(deck) {
  const escape = value => String(value || '').replace(/[<>&"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char]);
  const files = [];
  const add = (name, text) => files.push({ name, blob: new Blob([text], { type: 'application/xml' }) });
  const xml = text => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + text;
  const relationships = (entries) => xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('') + '</Relationships>');
  const emptyTree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const namespace = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const color = (value, fallback) => /^#[a-f0-9]{6}$/i.test(value || '') ? value.slice(1) : fallback;
  const box = (id, name, text, x, y, width, height, size, ink, bold = false, bullets = false) => {
    const values = Array.isArray(text) ? text : String(text || '').split('\n');
    const paragraphs = values.map(line => `<a:p><a:pPr ${bullets ? 'marL="220000" indent="-160000"' : ''}>${bullets ? '<a:buChar char="•"/>' : '<a:buNone/>'}</a:pPr><a:r><a:rPr lang="en-US" sz="${Math.round(size * 60)}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${ink}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t xml:space="preserve">${escape(line)}</a:t></a:r><a:endParaRPr sz="${Math.round(size * 60)}"/></a:p>`).join('');
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x * 7620)}" y="${Math.round(y * 7620)}"/><a:ext cx="${Math.round(width * 7620)}" cy="${Math.round(height * 7620)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
  };
  add('_rels/.rels', relationships([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
  const slideIds = deck.slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('');
  add('ppt/presentation.xml', xml(`<p:presentation ${namespace}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`));
  add('ppt/_rels/presentation.xml.rels', relationships([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...deck.slides.map((_, index) => ['rId' + (index + 2), 'slide', `slides/slide${index + 1}.xml`])]));
  add('ppt/slideMasters/slideMaster1.xml', xml(`<p:sldMaster ${namespace}><p:cSld name="PageAtlas"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`));
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
  add('ppt/slideLayouts/slideLayout1.xml', xml(`<p:sldLayout ${namespace} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`));
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  const themeColors = { dk1: '202D25', lt1: 'FFFFFF', dk2: '153B29', lt2: 'F4F6EF', accent1: '176248', accent2: '77A889', accent3: 'D6B075', accent4: '6397A4', accent5: '9F8CB5', accent6: 'BC7963', hlink: '176248', folHlink: '6397A4' };
  add('ppt/theme/theme1.xml', xml(`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PageAtlas"><a:themeElements><a:clrScheme name="PageAtlas">${Object.entries(themeColors).map(([key, value]) => `<a:${key}><a:srgbClr val="${value}"/></a:${key}>`).join('')}</a:clrScheme><a:fontScheme name="PageAtlas"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="PageAtlas"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst>${[1,2,3].map(n => `<a:ln w="${n * 12700}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>`).join('')}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`));
  const overrides = [['/ppt/presentation.xml', 'presentation.main'], ['/ppt/slideMasters/slideMaster1.xml', 'slideMaster'], ['/ppt/slideLayouts/slideLayout1.xml', 'slideLayout'], ['/ppt/theme/theme1.xml', 'theme']];
  for (const [index, slide] of deck.slides.entries()) {
    const number = index + 1;
    const ink = color(slide.color || deck.theme?.color, '153B29');
    const background = color(slide.background || deck.theme?.background, 'F4F6EF');
    const hasImage = /^data:image\//.test(slide.image || '');
    const width = hasImage ? 680 : 1420;
    let shapes = box(2, 'Title', slide.title, 80, 95, width, 240, slide.layout === 'cover' ? 80 : 58, ink, true);
    shapes += box(3, 'Body', slide.body, 84, 350, width, 230, 30, ink);
    if (slide.bullets?.length) shapes += box(4, 'Bullets', slide.bullets, 84, 585, width, 220, 28, ink, false, true);
    if (slide.footer) shapes += box(5, 'Source', slide.footer, 84, 840, 1420, 40, 18, ink);
    const rels = [['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']];
    if (hasImage) {
      const image = await atlasRender.loadImage(slide.image);
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      files.push({ name: `ppt/media/image${number}.png`, blob });
      rels.push(['rId2', 'image', `../media/image${number}.png`]);
      const scale = Math.min(670 / canvas.width, 700 / canvas.height);
      const w = canvas.width * scale, h = canvas.height * scale;
      shapes += `<p:pic><p:nvPicPr><p:cNvPr id="6" name="Image"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((850 + (670 - w) / 2) * 7620)}" y="${Math.round((100 + (700 - h) / 2) * 7620)}"/><a:ext cx="${Math.round(w * 7620)}" cy="${Math.round(h * 7620)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }
    add(`ppt/slides/slide${number}.xml`, xml(`<p:sld ${namespace}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${emptyTree}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`));
    add(`ppt/slides/_rels/slide${number}.xml.rels`, relationships(rels));
    overrides.push([`/ppt/slides/slide${number}.xml`, 'slide']);
  }
  add('[Content_Types].xml', xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' + overrides.map(([part, type]) => `<Override PartName="${part}" ContentType="${type === 'theme' ? 'application/vnd.openxmlformats-officedocument.theme+xml' : 'application/vnd.openxmlformats-officedocument.presentationml.' + type + '+xml'}"/>`).join('') + '</Types>'));
  return atlasRender.zip(files);
}
