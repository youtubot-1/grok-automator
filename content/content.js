// Grok Video Generator - Content Script
// Interacts with the Grok Imagine page DOM

console.log('Grok Video Generator content script loaded');

// Selectors for Grok Imagine UI elements
const SELECTORS = {
  // Main page elements
  fileInput: 'input[name="files"]',
  uploadButton: 'button[aria-label="Subir imagen"]',
  modelSelector: 'button#model-select-trigger',

  // Aspect ratio buttons
  aspectRatio: {
    '2:3': 'button[aria-label="2:3"]',
    '3:2': 'button[aria-label="3:2"]',
    '1:1': 'button[aria-label="1:1"]',
    '9:16': 'button[aria-label="9:16"]',
    '16:9': 'button[aria-label="16:9"]'
  },

  // Generation page elements
  backButton: 'button[aria-label="Volver"]',
  createVideoButton: 'button[aria-label="Crear video"]',
  downloadButton: 'button[aria-label="Descargar"]',

  // Video elements
  sdVideo: 'video#sd-video',
  hdVideo: 'video#hd-video'
};

// Message listener from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message.action);

  switch (message.action) {
    case 'ping':
      sendResponse({ success: true, message: 'Content script is ready' });
      break;

    case 'checkPage':
      sendResponse({
        isGrokPage: window.location.href.includes('grok.com/imagine'),
        isMainPage: isOnMainPage(),
        isGenerationPage: isOnGenerationPage()
      });
      break;

    case 'ensureVideoMode':
      ensureVideoMode()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'setAspectRatio':
      setAspectRatio(message.ratio)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'uploadImage':
      uploadImage(message.imageData, message.filename)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'waitForVideoCompletion':
      waitForVideoCompletion(message.timeout || 300000)
        .then((videoUrl) => sendResponse({ success: true, videoUrl }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'goBack':
      goBack()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getVideoUrl':
      const videoUrl = getVideoUrl();
      sendResponse({ success: !!videoUrl, videoUrl });
      break;

    default:
      sendResponse({ error: 'Unknown action' });
  }
  return true;
});

// Check if on main page
function isOnMainPage() {
  return !!document.querySelector(SELECTORS.uploadButton);
}

// Check if on generation page
function isOnGenerationPage() {
  return !!document.querySelector(SELECTORS.backButton);
}

// Check if video mode is selected
function isVideoModeSelected() {
  const selector = document.querySelector(SELECTORS.modelSelector);
  return selector && selector.textContent.includes('Video');
}

// Ensure video mode is selected
async function ensureVideoMode() {
  if (isVideoModeSelected()) {
    console.log('Video mode already selected');
    return;
  }

  // Click the model selector to open dropdown
  const modelSelector = document.querySelector(SELECTORS.modelSelector);
  if (!modelSelector) {
    throw new Error('Could not find model selector');
  }

  modelSelector.click();
  await delay(500);

  // Find and click the Video option
  const menuItems = document.querySelectorAll('[role="menuitem"]');
  let videoOption = null;

  for (const item of menuItems) {
    if (item.textContent.includes('Video') && item.textContent.includes('Generar')) {
      videoOption = item;
      break;
    }
  }

  if (!videoOption) {
    // Try clicking anywhere to close menu
    document.body.click();
    throw new Error('Could not find Video option in menu');
  }

  videoOption.click();
  await delay(500);
  console.log('Video mode selected');
}

// Set aspect ratio
async function setAspectRatio(ratio) {
  // First ensure the dropdown is open by clicking the model selector
  const modelSelector = document.querySelector(SELECTORS.modelSelector);
  if (!modelSelector) {
    throw new Error('Could not find model selector');
  }

  modelSelector.click();
  await delay(500);

  // Find the aspect ratio button
  const ratioSelector = SELECTORS.aspectRatio[ratio];
  if (!ratioSelector) {
    document.body.click();
    throw new Error(`Invalid aspect ratio: ${ratio}`);
  }

  const ratioButton = document.querySelector(ratioSelector);
  if (!ratioButton) {
    document.body.click();
    console.log(`Aspect ratio button ${ratio} not found, may already be set`);
    return;
  }

  ratioButton.click();
  await delay(300);

  // Close dropdown by clicking elsewhere
  document.body.click();
  await delay(200);
  console.log(`Aspect ratio set to ${ratio}`);
}

// Upload image to Grok
async function uploadImage(imageData, filename) {
  const fileInput = document.querySelector(SELECTORS.fileInput);
  if (!fileInput) {
    throw new Error('Could not find file input');
  }

  // Convert base64 to File
  const file = await base64ToFile(imageData, filename);

  // Create DataTransfer and set files
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;

  // Dispatch change event
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  console.log(`Uploaded image: ${filename}`);

  // Wait for page transition to generation view
  await waitForGenerationPage(10000);
}

// Wait for generation page to load
async function waitForGenerationPage(timeout = 10000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isOnGenerationPage()) {
      console.log('Generation page loaded');
      await delay(1000); // Extra wait for page to stabilize
      return;
    }
    await delay(500);
  }
  throw new Error('Timeout waiting for generation page');
}

// Wait for video to complete generation
async function waitForVideoCompletion(timeout = 300000) {
  const startTime = Date.now();
  console.log('Waiting for video generation...');

  while (Date.now() - startTime < timeout) {
    const sdVideo = document.querySelector(SELECTORS.sdVideo);

    if (sdVideo && sdVideo.src && sdVideo.src.length > 0 && sdVideo.readyState === 4) {
      console.log('Video generation complete!');
      return sdVideo.src;
    }

    // Log progress every 10 seconds
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed > 0 && elapsed % 10 === 0) {
      console.log(`Still waiting... ${elapsed}s elapsed`);
    }

    await delay(2000);
  }

  throw new Error('Video generation timeout');
}

// Get video URL
function getVideoUrl() {
  const sdVideo = document.querySelector(SELECTORS.sdVideo);
  if (sdVideo && sdVideo.src && sdVideo.src.length > 0) {
    return sdVideo.src;
  }
  return null;
}

// Go back to main page
async function goBack() {
  const backButton = document.querySelector(SELECTORS.backButton);
  if (!backButton) {
    throw new Error('Could not find back button');
  }

  backButton.click();
  console.log('Clicked back button');

  // Wait for main page to load
  await waitForMainPage(10000);
}

// Wait for main page to load
async function waitForMainPage(timeout = 10000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (isOnMainPage()) {
      console.log('Main page loaded');
      await delay(1000); // Extra wait for page to stabilize
      return;
    }
    await delay(500);
  }
  throw new Error('Timeout waiting for main page');
}

// Convert base64 to File object
async function base64ToFile(base64Data, filename) {
  let dataUrl = base64Data;
  if (!base64Data.startsWith('data:')) {
    dataUrl = `data:image/png;base64,${base64Data}`;
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

// Utility: delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Notify that content script is loaded
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' }).catch(() => {
  // Extension context may not be ready yet
});
