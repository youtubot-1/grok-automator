# Grok Video Generator

Chrome extension for bulk video generation on [Grok Imagine](https://grok.com/imagine). Select a batch of images and the extension will automatically generate an animated video for each one.

## Features

- **Batch processing** - Select a folder or multiple image files at once
- **Aspect ratio selection** - Choose from 2:3, 3:2, 1:1, 9:16, or 16:9
- **Smart completion detection** - Detects when each video is ready via DOM polling (no fixed delay)
- **Auto-download** - Videos are saved as `01-grok-{name}.mp4`, `02-grok-{name}.mp4`, etc.
- **Pause/Resume** - Pause processing and resume from where you left off
- **Timeout protection** - Skips any generation that takes longer than 5 minutes
- **Activity log** - Real-time success/failure status for each video

## Installation

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder

## Usage

1. Navigate to [Grok Imagine](https://grok.com/imagine)
2. Click the extension icon to open the popup
3. Select an aspect ratio (default: 16:9)
4. Select your input images (folder or files)
5. Click **Start Generation**
6. Videos are downloaded automatically as they complete

## Tech Stack

- Chrome Extension Manifest V3
- Content script injected into `grok.com/imagine`
- Background service worker for download management
- State persisted via `chrome.storage.local`

## Project Structure

```
grok-video-generator/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   └── content.js
├── background/
│   └── background.js
├── icons/
│   ├── icon16.svg
│   ├── icon48.svg
│   └── icon128.svg
└── lib/
    └── jszip.min.js
```

## Notes

- You must be signed in to Grok before using the extension.
- When an image is uploaded, video generation starts automatically (no need to click "Create video").
- The extension uses DOM selectors that may break if Grok updates its UI.
