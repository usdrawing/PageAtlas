# PageAtlas

A free, local Chrome extension for navigating webpages and turning captures into design assets. Studio preserves the PageAtlas identity, six languages and light/dark modes.

## Install the preview

1. Open chrome://extensions and enable Developer mode.
2. Choose Load unpacked and select the extension directory.
3. Reload webpage tabs. Click PageAtlas in the toolbar or press Alt+Shift+Y.
4. Use Capture, Section, Responsive or Studio in the panel.

Chrome requires the debugger permission for full-page and responsive captures. A debugging indicator can appear during capture. PageAtlas detaches afterwards. Protected browser pages cannot be captured.

## Studio

- Capture the current page, an element or section, or desktop/tablet/mobile widths of 1440/768/390 pixels. Capture another URL from Studio. Responsive layouts are restored afterwards.
- Keep a pixel screenshot and editable text, shape, image and SVG layers. Select layers in Editable design and export SVG for Figma or XD. Complex media uses raster fallbacks. Browser CSS and font rendering may differ after import.
- Create mockups with phone, tablet, laptop, desktop, browser and unframed screen templates. Choose a device arrangement, background, text, crop and output dimensions.
- Use social post, story and App Store sizes. Export several sizes and formats in one ZIP.
- Generate a basic presentation locally from text, or copy an AI prompt and paste the resulting JSON. Edit titles, body, bullets, images and notes. Export SVG or images, print PDF or download PPTX with native editable text.
- Extract images, sanitized SVGs, colors, typography and button styles. Export assets, token JSON and a design-system SVG.
- Connect screens with clickable regions. Preview the flow and export a standalone interactive HTML file.
- Upload or paste screenshots. Import and export .pageatlas project backups. Projects live in IndexedDB in this browser profile. Uninstalling PageAtlas or clearing its storage removes local projects.

## Figma

The optional [Figma companion](figma-plugin/README.md) exports a selected frame and imports SVG. It requires one-time setup as a Figma development plugin. Direct local handoff and project-file import are included. Native Figma integration and Adobe XD import still need live verification in those applications.

## Preview limits

Captures include content already rendered in the page. Editable browser layers are an approximation, capped at 10,000 layers. Screenshots are limited to 65 million pixels, 16,384 pixels wide and 30,000 pixels tall. Use section capture for larger pages. Imported screenshots remain raster images. Device frames are vector mockups.

PageAtlas has no hosted AI model, account or project server. Capturing a URL loads that website. Remote media imports request the original host. Copying an AI prompt lets you review its content before sharing it with an external tool.

[Privacy](docs/privacy.md) · [Terms](docs/terms.md)

## Capture and responsive studio in 0.4.0

Capture, Section and Responsive now open a setup screen before doing any work. Choose viewport sizes and device frames, transparent or colored output, page height and camera details, then confirm. Section capture returns to the source page for selection; Esc cancels it. The latest rendered capture is automatically copied to the clipboard when Chrome allows the write. A manual Copy image action remains available. Thumbnails can be downloaded, removed, or opened in the editor, and additional captures can be added to the project.

Each screen keeps its own device assignment. Select one screen, all screens or any subset. Eight composition layouts adapt to the selected screens and text mode. Text, colors, output dimensions, crop and camera options update the main preview while you edit. PNG, WebP and SVG support transparent composition backgrounds. A webpage's own painted background remains part of its screenshot.

Site title, description, theme color, font family and logo candidates come from available page metadata, JSON-LD and page elements. Logo and text can be toggled. Color suggestions and automatic text contrast help reuse the site's branding. Web fonts that are unavailable in Studio use the browser's font fallback.
