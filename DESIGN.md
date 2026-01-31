# Grok Video Generator - Chrome Extension

## Overview
A Chrome extension to bulk generate videos using Grok Imagine. The extension takes a folder of images as input and automatically generates one animated video for each image.

## Target URL
`https://grok.com/imagine`

---

## Architecture

### File Structure
```
grok-video-generator/
├── manifest.json          # Extension config (Manifest V3)
├── popup/
│   ├── popup.html         # Main UI
│   ├── popup.css          # Styling (dark theme matching Grok)
│   └── popup.js           # Popup logic
├── content/
│   └── content.js         # Injected into Grok, manipulates DOM
├── background/
│   └── background.js      # Service worker, manages downloads & state
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── DESIGN.md              # This file
```

### Components

1. **Popup (popup/)** - Main user interface
2. **Content Script (content/)** - Injected into Grok Imagine page, interacts with DOM
3. **Background Script (background/)** - Service worker for downloads and state management

---

## UI Layout

```
┌─────────────────────────────────────┐
│  Grok Video Generator               │
├─────────────────────────────────────┤
│  Status: Connected / Not on Grok    │
├─────────────────────────────────────┤
│  Settings                           │
│  ┌─────────────────────────────┐   │
│  │ Aspect Ratio: [16:9 ▼]     │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  Input Images                       │
│  [Select Folder] or [Select Files]  │
│  ┌─────────────────────────────┐   │
│  │ 📁 12 images selected       │   │
│  │ cat.png, dog.png, bird.png  │   │
│  │ ...                         │   │
│  └─────────────────────────────┘   │
│  [Clear]                            │
├─────────────────────────────────────┤
│  [▶ Start Generation]               │
│  [⏸ Pause]  [Stop]                  │
├─────────────────────────────────────┤
│  Progress: 3/12 videos              │
│  ████████░░░░░░░░ 25%               │
│  Status: Generating video for       │
│          "cat.png"...               │
├─────────────────────────────────────┤
│  Log:                               │
│  ✓ 01-grok-cat.mp4                  │
│  ✓ 02-grok-dog.mp4                  │
│  ⟳ 03-grok-bird.mp4 (generating)   │
└─────────────────────────────────────┘
```

---

## Features

### Core Features
1. **Folder/File Selection** - Select multiple images or a folder
2. **Aspect Ratio Selection** - Choose from 2:3, 3:2, 1:1, 9:16, 16:9
3. **Automatic Video Generation** - One video per input image
4. **Smart Completion Detection** - Detects when video is ready via DOM changes (not fixed delay)
5. **Sequential Processing** - Process one image at a time
6. **Progress Display** - Visual progress bar and status text
7. **Activity Log** - Shows success/failure for each video
8. **Pause/Resume** - Ability to pause and resume processing

### File Naming
- Format: `{counter}-grok-{original_name}.mp4`
- Example: `01-grok-cat.mp4`, `02-grok-landscape.mp4`
- Counter padded to 2 digits (or more if >99 images)

### Error Handling
- If generation fails or times out (5 minutes max): skip, log error, continue to next
- Notify user of skipped images

---

## Workflow

### User Flow
1. Open extension popup while on Grok Imagine page
2. Select aspect ratio (default: 16:9)
3. Select images (folder or multiple files)
4. Click "Start Generation"
5. Extension processes each image automatically
6. Videos are downloaded as they complete

### Processing Flow (per image)
1. **Setup** (first image only):
   - Ensure Video mode is selected
   - Set aspect ratio
2. **Upload Image**:
   - Use hidden file input `input[name="files"]`
   - Page automatically transitions to generation page
   - **Video generation starts automatically** (no button click needed)
3. **Wait for Completion**:
   - Poll for `video#sd-video` element
   - Check `src` is not empty AND `readyState === 4`
   - Timeout after 5 minutes
4. **Store Video**:
   - Get video URL from `video#sd-video.src`
   - Store in memory for batch download later
5. **Return to Main Page**:
   - Click back button `button[aria-label="Volver"]`
   - Wait for main page to load
6. **Repeat** for next image
7. **Batch Download** (after all complete):
   - Download all videos to a folder with sequential naming

**Note**: The "Crear video" button is only used when entering a text prompt without an image. When an image is uploaded, generation starts automatically.

### Pause Behavior
- Completes current video generation
- Stops before starting next image
- Resume continues from where it left off

---

## Technical Details

### Manifest V3 Requirements
- Service worker for background script
- Content scripts with appropriate permissions
- Downloads permission for saving videos

### Permissions Needed
```json
{
  "permissions": [
    "activeTab",
    "downloads",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "https://grok.com/*"
  ]
}
```

### Communication
- Popup ↔ Content Script: `chrome.tabs.sendMessage` / `chrome.runtime.onMessage`
- Popup ↔ Background: `chrome.runtime.sendMessage`
- State persistence: `chrome.storage.local`

### Grok Imagine DOM Selectors
```javascript
const SELECTORS = {
  // Main page elements
  fileInput: 'input[name="files"]',
  uploadButton: 'button[aria-label="Subir imagen"]',
  attachButton: 'button[aria-label="Adjuntar"]',
  modelSelector: 'button#model-select-trigger',

  // Aspect ratio buttons (in dropdown)
  aspectRatio: {
    '2:3': 'button[aria-label="2:3"]',
    '3:2': 'button[aria-label="3:2"]',
    '1:1': 'button[aria-label="1:1"]',
    '9:16': 'button[aria-label="9:16"]',
    '16:9': 'button[aria-label="16:9"]'
  },

  // Video mode option in dropdown
  videoOption: '[role="menuitem"]:has-text("Video")',

  // Generation page elements
  backButton: 'button[aria-label="Volver"]',
  createVideoButton: 'button[aria-label="Crear video"]',
  downloadButton: 'button[aria-label="Descargar"]',

  // Video elements (for completion detection)
  sdVideo: 'video#sd-video',
  hdVideo: 'video#hd-video'
};
```

### Video Completion Detection
```javascript
function isVideoReady() {
  const sdVideo = document.querySelector('video#sd-video');
  return sdVideo &&
         sdVideo.src &&
         sdVideo.src.length > 0 &&
         sdVideo.readyState === 4;
}

// Poll every 2 seconds, timeout after 5 minutes
async function waitForVideoCompletion(timeout = 300000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isVideoReady()) {
      return document.querySelector('video#sd-video').src;
    }
    await sleep(2000);
  }
  throw new Error('Video generation timeout');
}
```

### Page State Detection
```javascript
function isOnMainPage() {
  return !!document.querySelector('button[aria-label="Subir imagen"]');
}

function isOnGenerationPage() {
  return !!document.querySelector('button[aria-label="Volver"]');
}

function isVideoModeSelected() {
  const selector = document.querySelector('button#model-select-trigger');
  return selector && selector.textContent.includes('Video');
}
```

---

## Visual Design

### Color Scheme (Dark theme matching Grok)
- **Background**: #0a0a0a (near black)
- **Surface**: #1a1a1a (dark gray)
- **Primary**: #ffffff (white text)
- **Secondary**: #888888 (muted text)
- **Accent**: #3b82f6 (blue for buttons)
- **Success**: #22c55e (green)
- **Error**: #ef4444 (red)

### Style Notes
- Dark theme to match Grok's interface
- Clean, minimal design
- Clear visual hierarchy
- Monospace font for filenames

---

## State Management

### Stored State
```javascript
{
  queue: [
    {
      filename: 'cat.png',
      data: 'base64...', // or blob URL
      status: 'pending' | 'processing' | 'completed' | 'failed',
      outputFilename: '01-grok-cat.mp4',
      error: null
    }
  ],
  settings: {
    aspectRatio: '16:9'
  },
  isProcessing: false,
  isPaused: false,
  currentIndex: 0,
  videoCounter: 0
}
```

---

## Future Enhancements (Not in v1)
- Custom prompts per image
- Batch aspect ratio changes
- Re-generate failed videos
- Preview generated videos in extension
- Export generation history
