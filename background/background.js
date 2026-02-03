// Grok Automator - Background Service Worker

// ==================== VIDEO STATE ====================
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

// ==================== IMAGE EDIT STATE ====================
let imageEditState = {
  prompts: [],
  isProcessing: false,
  isPaused: false,
  currentIndex: 0,
  delay: 5,
  log: [],
  currentTabId: null,
  generatedImages: [],
  downloadFolder: 'grok-edits',
  error: null
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

// ==================== MESSAGE HANDLER ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    // ==================== VIDEO MESSAGES ====================
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

    // ==================== IMAGE EDIT MESSAGES ====================
    case 'getImageEditState':
      sendResponse({
        prompts: imageEditState.prompts,
        isProcessing: imageEditState.isProcessing,
        isPaused: imageEditState.isPaused,
        currentIndex: imageEditState.currentIndex,
        delay: imageEditState.delay,
        log: imageEditState.log,
        generatedImages: imageEditState.generatedImages?.length || 0,
        error: imageEditState.error
      });
      break;

    case 'startImageEdit':
      imageEditState.prompts = message.prompts;
      imageEditState.isProcessing = true;
      imageEditState.isPaused = false;
      imageEditState.currentIndex = 0;
      imageEditState.delay = message.delay || 5;
      imageEditState.log = [];
      imageEditState.currentTabId = message.tabId;
      imageEditState.generatedImages = [];
      imageEditState.downloadFolder = message.downloadFolder || 'grok-edits';
      imageEditState.error = null;
      processImageEditQueue();
      sendResponse({ success: true });
      break;

    case 'pauseImageEdit':
      imageEditState.isPaused = true;
      sendResponse({ success: true });
      break;

    case 'resumeImageEdit':
      imageEditState.isPaused = false;
      processImageEditQueue();
      sendResponse({ success: true });
      break;

    case 'stopImageEdit':
      imageEditState.isProcessing = false;
      imageEditState.isPaused = false;
      sendResponse({ success: true });
      break;

    case 'getEditGeneratedImages':
      sendResponse({
        images: imageEditState.generatedImages.map((img, index) => ({
          index,
          filename: img.filename,
          url: img.url
        }))
      });
      break;

    case 'clearEditGeneratedImages':
      imageEditState.generatedImages = [];
      sendResponse({ success: true });
      break;

    case 'debugEditDOM':
      if (message.tabId) {
        sendToContentScript(message.tabId, { action: 'debugEditDOM' })
          .then((result) => sendResponse(result))
          .catch((error) => sendResponse({ success: false, error: error.message }));
      } else {
        sendResponse({ success: false, error: 'No tabId provided' });
      }
      return true;

    case 'contentScriptLoaded':
      console.log('Content script loaded on tab');
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: true });
  }
  return true;
});

// ==================== VIDEO PROCESSING ====================

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
    title: 'Grok Automator',
    message: `Complete! ${successCount} videos ready for download.`
  });
}

// ==================== IMAGE EDIT PROCESSING ====================

async function processImageEditQueue() {
  if (!imageEditState.isProcessing || imageEditState.isPaused || !imageEditState.currentTabId) {
    return;
  }

  const tabId = imageEditState.currentTabId;
  const prompts = imageEditState.prompts;
  const delayMs = imageEditState.delay * 1000;

  try {
    // Step 1: Ensure content script is reachable
    try {
      await sendToContentScript(tabId, { action: 'ping' });
    } catch (error) {
      // Content script not loaded - try injecting it
      console.log('Content script not reachable, attempting injection...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content/content.js']
        });
        await sleep(500);
        await sendToContentScript(tabId, { action: 'ping' });
      } catch (injectError) {
        const msg = 'Content script not available. Please refresh the Grok page and try again.';
        addEditLogEntry('Setup', 'failed', msg);
        imageEditState.error = msg;
        return; // finally block will set isProcessing = false
      }
    }

    // Step 2: Verify edit mode is active
    const editCheck = await sendToContentScript(tabId, { action: 'checkEditMode' });
    if (!editCheck.inEditMode) {
      const msg = 'Not in edit mode. Upload an image, click "Editar imagen", then try again.';
      addEditLogEntry('Setup', 'failed', msg);
      imageEditState.error = msg;
      return; // finally block will set isProcessing = false
    }

    addEditLogEntry('Edit mode verified', 'completed');

    // Step 3: Get initial thumbnail count (should be 1 = reference)
    let initialThumbnailCount = 1;
    try {
      const thumbResult = await sendToContentScript(tabId, { action: 'getEditThumbnails' });
      if (thumbResult.success && thumbResult.thumbnails) {
        initialThumbnailCount = thumbResult.thumbnails.length;
      }
    } catch (e) {
      console.log('Could not get initial thumbnail count, assuming 1');
    }

    // Step 4: Submit each prompt
    for (let i = imageEditState.currentIndex; i < prompts.length; i++) {
      if (!imageEditState.isProcessing || imageEditState.isPaused) {
        imageEditState.currentIndex = i;
        return;
      }

      const prompt = prompts[i];
      const promptLabel = `Prompt ${i + 1}: "${prompt.substring(0, 40)}${prompt.length > 40 ? '...' : ''}"`;

      addEditLogEntry(promptLabel, 'processing');
      imageEditState.currentIndex = i;

      try {
        // For prompts after the first: click the reference thumbnail first
        if (i > 0) {
          console.log('Clicking reference image before next prompt...');
          await sendToContentScript(tabId, { action: 'clickReferenceImage' });
          await sleep(500);
        }

        // Enter prompt text
        await sendToContentScript(tabId, {
          action: 'enterEditPrompt',
          prompt: prompt
        });
        await sleep(200);

        // Submit prompt (Enter key)
        await sendToContentScript(tabId, { action: 'submitEditPrompt' });

        updateEditLogEntry(promptLabel, 'processing');

        // Wait configured delay before next prompt
        console.log(`Waiting ${imageEditState.delay}s delay...`);
        await sleep(delayMs);

      } catch (error) {
        console.error(`Failed to process prompt ${i + 1}:`, error);
        updateEditLogEntry(promptLabel, 'failed', error.message);
      }
    }

    // Step 5: All prompts submitted - wait for all generations to complete
    // Expected: initial thumbnails + 2 per prompt (each prompt generates 2 images)
    const expectedThumbnailCount = initialThumbnailCount + (2 * prompts.length);
    addEditLogEntry('Waiting for generations...', 'processing');

    try {
      console.log(`Waiting for ${expectedThumbnailCount} thumbnails (${initialThumbnailCount} initial + ${2 * prompts.length} generated)...`);
      await sendToContentScript(tabId, {
        action: 'waitForEditGeneration',
        expectedCount: expectedThumbnailCount,
        timeout: 300000
      });
      updateEditLogEntry('Waiting for generations...', 'completed');
    } catch (error) {
      console.warn('Timeout or error waiting for all generations:', error.message);
      updateEditLogEntry('Waiting for generations...', 'failed', error.message);
    }

    // Step 6: Collect generated image URLs and fetch as base64
    addEditLogEntry('Collecting images...', 'processing');
    try {
      const thumbResult = await sendToContentScript(tabId, { action: 'getEditThumbnails' });
      if (thumbResult.success && thumbResult.thumbnails && thumbResult.thumbnails.length > 0) {
        const allThumbnails = thumbResult.thumbnails;

        // Skip initial thumbnails (reference image(s))
        // From the generated thumbnails, each prompt generates 2 images, we take 1 per prompt
        const generatedThumbnails = allThumbnails.slice(initialThumbnailCount);

        for (let p = 0; p < prompts.length; p++) {
          // Each prompt generates 2 thumbnails; take the first one (index 0, 2, 4, ...)
          const thumbIndex = p * 2;
          if (thumbIndex < generatedThumbnails.length) {
            const thumb = generatedThumbnails[thumbIndex];
            const filename = `${String(p + 1).padStart(2, '0')}-edit-${sanitizeFilename(prompts[p].substring(0, 30))}.png`;

            // Fetch image as base64 via content script (has grok.com cookies)
            let imageDataUrl = thumb.src;
            try {
              const fetchResult = await sendToContentScript(tabId, {
                action: 'fetchImageBase64',
                url: thumb.src
              });
              if (fetchResult.success && fetchResult.dataUrl) {
                imageDataUrl = fetchResult.dataUrl;
                console.log(`Fetched image ${p + 1} as base64 (${Math.round(fetchResult.dataUrl.length / 1024)}KB)`);
              }
            } catch (fetchErr) {
              console.warn(`Could not fetch image ${p + 1} as base64, keeping original URL:`, fetchErr.message);
            }

            imageEditState.generatedImages.push({
              filename: filename,
              url: imageDataUrl,
              prompt: prompts[p]
            });

            // Update the prompt log entry to completed
            const promptLabel = `Prompt ${p + 1}: "${prompts[p].substring(0, 40)}${prompts[p].length > 40 ? '...' : ''}"`;
            updateEditLogEntry(promptLabel, 'completed');
          }
        }

        console.log(`Collected ${imageEditState.generatedImages.length} generated images`);
        updateEditLogEntry('Collecting images...', 'completed');
      } else {
        updateEditLogEntry('Collecting images...', 'failed', 'No thumbnails found');
      }
    } catch (error) {
      console.error('Error collecting generated images:', error);
      updateEditLogEntry('Collecting images...', 'failed', error.message);
    }

    // Step 7: Complete
    imageEditState.currentIndex = prompts.length;
    const successCount = imageEditState.generatedImages.length;
    console.log(`Image edit processing complete. ${successCount} images collected.`);

    // Notify completion
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.svg',
      title: 'Grok Automator',
      message: `Image editing complete! ${successCount} images ready for download.`
    });

  } catch (error) {
    // Top-level catch: ensure isProcessing is always reset
    console.error('processImageEditQueue unexpected error:', error);
    imageEditState.error = error.message;
    addEditLogEntry('Unexpected error', 'failed', error.message);
  } finally {
    imageEditState.isProcessing = false;
  }
}

// ==================== UTILITIES ====================

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
      await downloadFile(video.url, `${folder}/${video.filename}`);
      await sleep(500);
    } catch (e) {
      console.error(`Failed to download ${video.filename}:`, e);
    }
  }

  // Clear videos after download
  state.generatedVideos = [];
  return count;
}

// Download single file
function downloadFile(url, filename) {
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

// Sanitize filename
function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// Video log entries
function addLogEntry(filename, status, error = null) {
  const existingIndex = state.log.findIndex(e => e.filename === filename);
  if (existingIndex >= 0) {
    state.log[existingIndex] = { filename, status, error, timestamp: Date.now() };
  } else {
    state.log.push({ filename, status, error, timestamp: Date.now() });
  }
  saveState();
}

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

// Image edit log entries
function addEditLogEntry(filename, status, error = null) {
  const existingIndex = imageEditState.log.findIndex(e => e.filename === filename);
  if (existingIndex >= 0) {
    imageEditState.log[existingIndex] = { filename, status, error, timestamp: Date.now() };
  } else {
    imageEditState.log.push({ filename, status, error, timestamp: Date.now() });
  }
}

function updateEditLogEntry(filename, status, error = null) {
  const entry = imageEditState.log.find(e => e.filename === filename);
  if (entry) {
    entry.status = status;
    entry.error = error;
    entry.timestamp = Date.now();
  } else {
    addEditLogEntry(filename, status, error);
  }
}

// Utility: sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === state.currentTabId && changeInfo.url && state.isProcessing) {
    console.log('Tab URL changed during video processing');
  }
  if (tabId === imageEditState.currentTabId && changeInfo.url && imageEditState.isProcessing) {
    console.log('Tab URL changed during image edit processing');
  }
});
