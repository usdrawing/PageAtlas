# PageAtlas privacy policy

This policy covers PageAtlas 0.4.0, including Studio and the optional Figma companion.

PageAtlas reads supported pages to create a local navigation index. When you request a capture it saves screenshots, text, image references, colors, typography and layout layers. Captures may include private content visible in your browser session. The debugger permission is used temporarily for screenshots and viewport resizing, and is detached afterwards.

Panel indexes and searches remain in memory. Panel preferences are stored in Chrome local extension storage. Studio projects, screenshots, layers, presentations and prototype flows are stored in IndexedDB in this browser profile. PageAtlas does not synchronize them. You can delete individual projects in Studio. Uninstalling the extension or clearing its storage deletes local projects. Downloaded or copied files remain at their destinations.

PageAtlas has no account, analytics, advertising, tracking service or project server. It does not sell project data. Capturing another URL loads that website in a browser tab. Media previews and imports request files from their original hosts. Downloads use Chrome's download manager or local browser files. Policy links open on GitHub. Those hosts process requests under their own policies.

Copy AI Prompt copies source content, source URL, image URLs and a presentation specification to your clipboard. PageAtlas does not send this to an AI service. If you paste it into another tool, that tool's terms apply. Export and copy actions put the selected content in local files or on your clipboard.

The optional Figma companion exports a selected frame locally, can hand its image to PageAtlas on a Figma tab, and imports SVG files you choose. It does not request network access. Figma operates under its own policies.

For questions, [contact the maintainer](https://github.com/usdrawing/PageAtlas/issues). Public issues are visible to others; share only information you intend to make public.

After an approved capture, PageAtlas attempts to copy the latest rendered image to your clipboard. The clipboardWrite permission enables this action; a success status is shown only when the write completes. You can also copy an image manually. Capture settings, device assignments, metadata-derived branding and preview images are saved with the local project. Logo imports request the original logo host. PageAtlas does not remove the source website’s own background when exporting a transparent composition.
