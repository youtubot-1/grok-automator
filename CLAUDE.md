# Grok Automator

Chrome extension for bulk automation on Grok Imagine (grok.com/imagine).

## Features

1. **Video Tab**: Bulk generate videos from multiple input images
   - Select folder or individual images
   - Configure aspect ratio (16:9, 9:16, 1:1, etc.)
   - Automatic video mode selection
   - Progress tracking and activity log
   - Download all as zip

2. **Image Edit Tab**: Bulk edit a reference image with multiple prompts
   - User manually uploads image and enters edit mode on Grok
   - Extension submits prompts sequentially
   - Clicks reference thumbnail between prompts
   - Waits for all generations to complete
   - Collects generated images as base64 for download

## Architecture

```
manifest.json          - Extension config, permissions, content script injection
popup/
  popup.html          - UI with tab navigation (Video / Image Edit)
  popup.css           - Dark theme styling
  popup.js            - Tab switching, state management, UI updates, zip download
background/
  background.js       - Service worker: state management, queue processing, message routing
content/
  content.js          - DOM interaction on grok.com: selectors, element finding, image fetching
lib/
  jszip.min.js        - Zip file creation
icons/                - Extension icons (SVG)
```

## Key DOM Selectors (Spanish UI)

### Video Mode
- File input: `input[name="files"]`
- Model selector: `button#model-select-trigger`
- Aspect ratio buttons: `button[aria-label="16:9"]`, etc.
- Back button: `button[aria-label="Volver"]`
- Video elements: `video#sd-video`, `video#hd-video`

### Edit Mode
- Textarea: `textarea[aria-label="Escribe para editar la imagen..."]` (+ fallbacks)
- Sidebar with thumbnails: `div.snap-y.snap-mandatory` (+ fallback search)
- Thumbnail buttons: `button.snap-center` or buttons containing `<img>`
- Submit: Find button with SVG near textarea, or Enter key simulation

## Message Flow

**Popup → Background → Content Script**

1. Popup sends `startImageEdit` with prompts array to background
2. Background calls `processImageEditQueue()`:
   - Pings content script (injects if needed)
   - Verifies edit mode via `checkEditMode`
   - For each prompt: `enterEditPrompt` → `submitEditPrompt` → delay
   - Between prompts: `clickReferenceImage`
   - Waits for thumbnails via `waitForEditGeneration`
   - Fetches images as base64 via `fetchImageBase64`
3. Popup polls `getImageEditState` every second for progress
4. On download, popup converts base64 data URLs to blobs → zip

## Development Notes

- Content script uses flexible selectors with fallbacks for DOM variations
- Images are fetched as base64 by content script (has grok.com cookies)
- Popup can't fetch grok.com images directly (no cookie access)
- `debugEditDOM` message helps inspect actual page structure
- Always wrap async processing in try/finally to reset `isProcessing`
