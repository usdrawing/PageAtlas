# PageAtlas

A free in-page Chrome sidebar for searching headings, messages, images, files, links, icons and text on the current page. Gmail and ChatGPT have dedicated content selectors. PageAtlas uses the content already loaded in the open thread or conversation.

## Load unpacked

1. Open chrome://extensions in Chrome.
2. Enable Developer mode.
3. Choose Load unpacked and select this repository's `extension` folder.
4. Reload any tabs that were already open. Click PageAtlas in the toolbar or press Alt+Shift+Y.

The panel stays open on supported pages until you close it. Its settings include a physical left or right position, light/dark/system themes, and six languages. Overview starts with headings and messages. Media contains image, video and file galleries. Video playback depends on the source, codec and access controls. Icons includes detected Material, Lucide, SVG and Unicode assets. Colors lists computed RGB colors and exports CSS variables or SVG. The panel reserves space beside normal page layout. Elements pinned to the viewport by the site can still overlap the dock.

PDF preview uses the browser’s viewer. For accessible DOCX, XLSX and PPTX files, PageAtlas shows extracted paragraphs, cells and slide text locally. Some files must be opened or downloaded at their original location. Chrome's internal pages and some embedded content are inaccessible to extensions.

[Privacy](docs/privacy.md) · [Terms](docs/terms.md)
