// Grok Video Generator - Background Service Worker

// State management
let state = {
  queue: [],
  isProcessing: false,
  isPaused: false,
  currentIndex: 0,
  videoCounter: 0,
  aspectRatio: '16:9',
  downloadFolder: 'grok-videos',
  log: [],
  currentTabId: null,
  generatedVideos: []
};

// Initialize state from storage
chrome.storage.local.get(['grokState'], (result) => {
  if (result.grokState) {
    state = { ...state, ...result.grokState };
  }
});

// Save state to storage
function saveState() {
  const stateToSave = { ...state };
  delete stateToSave.generatedVideos; // Don't save video URLs to storage
  chrome.storage.local.set({ grokState: stateToSave });
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getState':
      sendResponse({
        ...state,
        generatedVideos: state.generatedVideos?.length || 0
      });
      break;

    case 'updateSettings':
      if (message.aspectRatio !== undefined) state.aspectRatio = message.aspectRatio;
      if (message.downloadFolder !== undefined) state.downloadFolder = message.downloadFolder;
      saveState();
      sendResponse({ success: true });
      break;

    case 'startProcessing':
      state.queue = message.queue;
      state.isProcessing = true;
      state.isPaused = false;
      state.currentTabId = message.tabId;
      state.currentIndex = 0;
      state.videoCounter = 0;
      state.log = [];
      state.generatedVideos = [];
      state.aspectRatio = message.aspectRatio || '16:9';
      state.downloadFolder = message.downloadFolder || 'grok-videos';
      saveState();
      processQueue();
      sendResponse({ success: true });
      break;

    case 'pauseProcessing':
      state.isPaused = true;
      saveState();
      sendResponse({ success: true });
      break;

    case 'resumeProcessing':
      state.isPaused = false;
      saveState();
      processQueue();
      sendResponse({ success: true });
      break;

    case 'stopProcessing':
      state.isProcessing = false;
      state.isPaused = false;
      saveState();
      sendResponse({ success: true });
      break;

    case 'getGeneratedVideos':
      sendResponse({
        videos: state.generatedVideos.map((video, index) => ({
          index,
          filename: video.filename,
          url: video.url
        }))
      });
      break;

    case 'downloadAllVideos':
      downloadAllVideos()
        .then((count) => sendResponse({ success: true, count }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'clearGeneratedVideos':
      state.generatedVideos = [];
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown action' });
  }
  return true;
});

// Process queue
async function processQueue() {
  if (!state.isProcessing || state.isPaused || !state.currentTabId) {
    return;
  }

  // Setup on first image
  if (state.currentIndex === 0) {
    try {
      // Ensure video mode is selected
      await sendToContentScript(state.currentTabId, { action: 'ensureVideoMode' });
      await sleep(500);

      // Set aspect ratio
      await sendToContentScript(state.currentTabId, {
        action: 'setAspectRatio',
        ratio: state.aspectRatio
      });
      await sleep(500);
    } catch (error) {
      console.error('Setup failed:', error);
      addLogEntry(state.queue[0]?.filename || 'Setup', 'failed', error.message);
    }
  }

  // Process each image
  for (let i = state.currentIndex; i < state.queue.length; i++) {
    if (!state.isProcessing || state.isPaused) {
      state.currentIndex = i;
      saveState();
      return;
    }

    const item = state.queue[i];
    state.currentIndex = i;
    state.videoCounter = i + 1;
    saveState();

    // Update log to show processing
    addLogEntry(item.filename, 'processing');

    let success = false;
    let videoUrl = null;
    let error = null;

    try {
      // Upload image
      console.log(`Uploading image: ${item.filename}`);
      await sendToContentScript(state.currentTabId, {
        action: 'uploadImage',
        imageData: item.data,
        filename: item.filename
      });

      // Wait for video generation (5 minute timeout)
      console.log('Waiting for video generation...');
      const result = await sendToContentScript(state.currentTabId, {
        action: 'waitForVideoCompletion',
        timeout: 300000
      });

      if (result.success && result.videoUrl) {
        videoUrl = result.videoUrl;
        success = true;
        console.log(`Video generated: ${videoUrl}`);
      } else {
        throw new Error(result.error || 'Failed to get video URL');
      }
    } catch (e) {
      error = e.message;
      console.error(`Generation failed for ${item.filename}:`, e);
    }

    // Update log and store video
    if (success && videoUrl) {
      updateLogEntry(item.filename, 'completed');
      state.generatedVideos.push({
        filename: item.outputFilename,
        url: videoUrl,
        sourceFilename: item.filename
      });
    } else {
      updateLogEntry(item.filename, 'failed', error);
    }

    // Go back to main page for next image
    if (i < state.queue.length - 1) {
      try {
        await sendToContentScript(state.currentTabId, { action: 'goBack' });
        await sleep(2000); // Wait for main page to stabilize
      } catch (e) {
        console.error('Failed to go back:', e);
      }
    }
  }

  // All generations complete
  const successCount = state.generatedVideos.length;
  console.log(`Processing complete. ${successCount} videos generated.`);

  state.isProcessing = false;
  state.currentIndex = 0;
  saveState();

  // Notify completion
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.svg',
    title: 'Grok Video Generator',
    message: `Complete! ${successCount} videos ready for download.`
  });
}

// Send message to content script
function sendToContentScript(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response || { success: true });
      }
    });
  });
}

// Download all videos
async function downloadAllVideos() {
  const count = state.generatedVideos.length;
  if (count === 0) {
    throw new Error('No videos to download');
  }

  const folder = state.downloadFolder || 'grok-videos';

  for (const video of state.generatedVideos) {
    try {
      await downloadVideo(video.url, `${folder}/${video.filename}`);
      await sleep(500);
    } catch (e) {
      console.error(`Failed to download ${video.filename}:`, e);
    }
  }

  // Clear videos after download
  state.generatedVideos = [];
  return count;
}

// Download single video
function downloadVideo(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(downloadId);
      }
    });
  });
}

// Add log entry
function addLogEntry(filename, status, error = null) {
  // Check if entry already exists
  const existingIndex = state.log.findIndex(e => e.filename === filename);
  if (existingIndex >= 0) {
    state.log[existingIndex] = { filename, status, error, timestamp: Date.now() };
  } else {
    state.log.push({ filename, status, error, timestamp: Date.now() });
  }
  saveState();
}

// Update log entry
function updateLogEntry(filename, status, error = null) {
  const entry = state.log.find(e => e.filename === filename);
  if (entry) {
    entry.status = status;
    entry.error = error;
    entry.timestamp = Date.now();
  } else {
    addLogEntry(filename, status, error);
  }
  saveState();
}

// Utility: sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === state.currentTabId && changeInfo.url && state.isProcessing) {
    console.log('Tab URL changed during processing');
    // Might need to handle navigation away from Grok
  }
});
