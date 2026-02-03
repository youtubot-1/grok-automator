// Grok Automator - Content Script
// Interacts with the Grok Imagine page DOM

console.log('Grok Automator content script loaded');

// Selectors for Grok Imagine UI elements (Video mode)
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

// Selectors for Grok Imagine Edit mode
// Multiple fallback selectors to handle DOM variations
const EDIT_SELECTORS = {
  // The textarea could have different aria-labels depending on language
  textareaSelectors: [
    'textarea[aria-label="Escribe para editar la imagen..."]',
    'textarea[aria-label*="editar"]',
    'textarea[aria-label*="edit"]',
    'textarea[placeholder*="editar"]',
    'textarea[placeholder*="edit"]'
  ],
  // Sidebar containers - try multiple patterns
  sidebarSelectors: [
    'div.snap-y.snap-mandatory',
    'div[class*="snap-y"][class*="snap-mandatory"]',
    'div.overflow-y-auto[class*="snap"]'
  ],
  // Thumbnail buttons inside sidebar
  thumbnailSelectors: [
    'button.snap-center',
    'button[class*="snap-center"]'
  ],
  centerImage: 'img.col-start-1.row-start-1'
};

// Helper: find first matching element from a list of selectors
function queryFirst(selectors, parent = document) {
  for (const sel of selectors) {
    const el = parent.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// Helper: find all matching elements from a list of selectors
function queryAllFirst(selectors, parent = document) {
  for (const sel of selectors) {
    const els = parent.querySelectorAll(sel);
    if (els.length > 0) return els;
  }
  return [];
}

// Helper: find the edit textarea
function findEditTextarea() {
  return queryFirst(EDIT_SELECTORS.textareaSelectors);
}

// Helper: find the sidebar container
function findSidebar() {
  // First try explicit selectors
  let sidebar = queryFirst(EDIT_SELECTORS.sidebarSelectors);
  if (sidebar) return sidebar;

  // Fallback: find a scrollable container that has button children with images
  const containers = document.querySelectorAll('div[class*="overflow"]');
  for (const container of containers) {
    const buttons = container.querySelectorAll('button');
    if (buttons.length > 0) {
      const hasImages = Array.from(buttons).some(btn => btn.querySelector('img'));
      if (hasImages) return container;
    }
  }
  return null;
}

// Helper: find thumbnail buttons in sidebar
function findThumbnailButtons(sidebar) {
  if (!sidebar) return [];

  // Try explicit selectors first
  let buttons = queryAllFirst(EDIT_SELECTORS.thumbnailSelectors, sidebar);
  if (buttons.length > 0) return Array.from(buttons);

  // Fallback: all direct-child buttons or buttons that contain images
  const allButtons = sidebar.querySelectorAll('button');
  const imageButtons = Array.from(allButtons).filter(btn => btn.querySelector('img'));
  return imageButtons;
}

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

    // ==================== IMAGE EDIT HANDLERS ====================

    case 'checkEditMode':
      checkEditMode()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ success: false, inEditMode: false, error: error.message }));
      return true;

    case 'enterEditPrompt':
      enterEditPrompt(message.prompt)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'submitEditPrompt':
      submitEditPrompt()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'clickReferenceImage':
      clickReferenceImage()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'getEditThumbnails':
      getEditThumbnails()
        .then((thumbnails) => sendResponse({ success: true, thumbnails }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'waitForEditGeneration':
      waitForEditGeneration(message.expectedCount, message.timeout || 300000)
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'debugEditDOM':
      debugEditDOM()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case 'fetchImageBase64':
      fetchImageBase64(message.url)
        .then((dataUrl) => sendResponse({ success: true, dataUrl }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
  }
  return true;
});

// ==================== VIDEO MODE FUNCTIONS ====================

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

// ==================== IMAGE EDIT MODE FUNCTIONS ====================

// Check if edit mode is active
async function checkEditMode() {
  const textarea = findEditTextarea();
  const inEditMode = !!textarea;
  console.log(`checkEditMode: ${inEditMode}`, textarea ? `(found: ${textarea.getAttribute('aria-label')})` : '');
  return { success: true, inEditMode };
}

// Enter prompt text into the edit textarea
async function enterEditPrompt(promptText) {
  const textarea = findEditTextarea();
  if (!textarea) {
    throw new Error('Edit mode textarea not found. Make sure you are in image edit mode.');
  }

  // Focus the textarea
  textarea.focus();
  await delay(100);

  // Clear existing text using native setter
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  ).set;
  nativeInputValueSetter.call(textarea, '');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(50);

  // Set the new prompt text
  nativeInputValueSetter.call(textarea, promptText);

  // Dispatch events React listens to
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));

  await delay(200);
  console.log(`Entered edit prompt: "${promptText.substring(0, 50)}${promptText.length > 50 ? '...' : ''}"`);
}

// Submit the edit prompt
async function submitEditPrompt() {
  const textarea = findEditTextarea();
  if (!textarea) {
    throw new Error('Edit mode textarea not found.');
  }

  // Strategy 1: Find and click a submit/send button
  const submitButton = findSubmitButton(textarea);
  if (submitButton) {
    console.log('Found submit button, clicking it');
    submitButton.click();
    await delay(500);
    console.log('Submitted edit prompt via button click');
    return;
  }

  // Strategy 2: Full Enter key event sequence on the textarea
  console.log('No submit button found, trying Enter key simulation');
  textarea.focus();
  await delay(50);

  const enterEventInit = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    charCode: 13,
    bubbles: true,
    cancelable: true,
    composed: true
  };

  textarea.dispatchEvent(new KeyboardEvent('keydown', enterEventInit));
  textarea.dispatchEvent(new KeyboardEvent('keypress', enterEventInit));
  textarea.dispatchEvent(new KeyboardEvent('keyup', enterEventInit));

  await delay(500);
  console.log('Submitted edit prompt via Enter key');
}

// Find the submit/send button near the textarea
function findSubmitButton(textarea) {
  // Strategy A: Look for a button with a send/submit aria-label
  const ariaLabels = [
    'button[aria-label="Enviar"]',
    'button[aria-label="Send"]',
    'button[aria-label="Submit"]',
    'button[aria-label*="enviar"]',
    'button[aria-label*="send"]',
    'button[type="submit"]'
  ];

  for (const selector of ariaLabels) {
    const btn = document.querySelector(selector);
    if (btn) return btn;
  }

  // Strategy B: Find a button that is a sibling or nearby the textarea
  // Walk up from textarea to find its form or container, then look for a button
  let container = textarea.parentElement;
  for (let depth = 0; depth < 5 && container; depth++) {
    // Look for buttons in this container (skip buttons that are clearly not submit)
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').toLowerCase().trim();

      // Skip known non-submit buttons
      if (label.includes('salir') || label.includes('exit') || label.includes('back') ||
          label.includes('volver') || label.includes('cerrar') || label.includes('close')) {
        continue;
      }

      // Check if it has an SVG (likely an icon button like send)
      const hasSvg = btn.querySelector('svg');
      // Check if it's near the textarea (in the same row/form)
      if (hasSvg && !btn.disabled) {
        // Likely a send button with an icon
        console.log(`Found candidate submit button: aria-label="${btn.getAttribute('aria-label')}", text="${text}"`);
        return btn;
      }
    }
    container = container.parentElement;
  }

  return null;
}

// Click the reference image (first thumbnail in sidebar)
async function clickReferenceImage() {
  const sidebar = findSidebar();
  if (!sidebar) {
    throw new Error('Sidebar not found. Make sure you are in image edit mode.');
  }

  const thumbnails = findThumbnailButtons(sidebar);
  if (thumbnails.length === 0) {
    throw new Error('No thumbnails found in sidebar.');
  }

  // Click the first thumbnail (reference image)
  thumbnails[0].click();
  await delay(500);
  console.log('Clicked reference image thumbnail');
}

// Get all thumbnails from the sidebar
async function getEditThumbnails() {
  const sidebar = findSidebar();
  if (!sidebar) {
    // Fallback: look for ALL images on the page that look like generated results
    console.log('Sidebar not found, trying fallback image search');
    return getEditThumbnailsFallback();
  }

  const thumbnailBtns = findThumbnailButtons(sidebar);
  const thumbnails = [];

  thumbnailBtns.forEach((btn, index) => {
    const img = btn.querySelector('img');
    if (img && img.src) {
      thumbnails.push({
        src: img.src,
        alt: img.alt || '',
        index: index
      });
    }
  });

  console.log(`Found ${thumbnails.length} thumbnails in sidebar`);
  return thumbnails;
}

// Fallback: find generated images anywhere on the page
function getEditThumbnailsFallback() {
  const thumbnails = [];
  // Look for images whose src contains patterns typical of Grok generated images
  const allImages = document.querySelectorAll('img');
  for (const img of allImages) {
    const src = img.src || '';
    if (src.includes('/generated/') || src.includes('grok') || src.includes('imagine')) {
      // Check it's not a tiny icon
      if (img.naturalWidth > 50 || img.width > 50) {
        thumbnails.push({
          src: src,
          alt: img.alt || '',
          index: thumbnails.length
        });
      }
    }
  }
  console.log(`Fallback: found ${thumbnails.length} candidate images`);
  return thumbnails;
}

// Wait for edit generation to complete (poll thumbnail count)
async function waitForEditGeneration(expectedCount, timeout = 300000) {
  const startTime = Date.now();
  console.log(`Waiting for ${expectedCount} thumbnails in sidebar...`);

  // Get initial state for logging
  const sidebar0 = findSidebar();
  const initial0 = sidebar0 ? findThumbnailButtons(sidebar0).length : 0;
  console.log(`Initial thumbnail count: ${initial0}, sidebar found: ${!!sidebar0}`);

  while (Date.now() - startTime < timeout) {
    const sidebar = findSidebar();
    if (sidebar) {
      const thumbnails = findThumbnailButtons(sidebar);
      const currentCount = thumbnails.length;

      if (currentCount >= expectedCount) {
        console.log(`Generation complete! Found ${currentCount} thumbnails (expected ${expectedCount})`);
        // Wait for images to fully load
        await delay(2000);
        return { thumbnailCount: currentCount };
      }

      // Log progress every 10 seconds
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed > 0 && elapsed % 10 === 0) {
        console.log(`Waiting for thumbnails... ${currentCount}/${expectedCount} (${elapsed}s elapsed)`);
      }
    } else {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed > 0 && elapsed % 10 === 0) {
        console.log(`Sidebar not found yet... (${elapsed}s elapsed)`);
      }
    }

    await delay(2000);
  }

  // On timeout, return what we have
  const sidebar = findSidebar();
  const finalCount = sidebar ? findThumbnailButtons(sidebar).length : 0;
  throw new Error(`Timeout waiting for generations. Got ${finalCount}/${expectedCount} thumbnails.`);
}

// Debug: inspect the edit mode DOM and report what we find
async function debugEditDOM() {
  const textarea = findEditTextarea();
  const sidebar = findSidebar();
  const thumbnails = sidebar ? findThumbnailButtons(sidebar) : [];

  // Collect info about nearby buttons (potential submit)
  const nearbyButtons = [];
  if (textarea) {
    let container = textarea.parentElement;
    for (let depth = 0; depth < 5 && container; depth++) {
      const buttons = container.querySelectorAll('button');
      for (const btn of buttons) {
        nearbyButtons.push({
          depth,
          ariaLabel: btn.getAttribute('aria-label'),
          text: btn.textContent?.trim().substring(0, 50),
          disabled: btn.disabled,
          hasSvg: !!btn.querySelector('svg'),
          classes: btn.className?.substring(0, 80)
        });
      }
      container = container.parentElement;
    }
  }

  // Collect sidebar info
  const sidebarInfo = sidebar ? {
    tag: sidebar.tagName,
    classes: sidebar.className?.substring(0, 100),
    childCount: sidebar.children.length,
    buttonCount: sidebar.querySelectorAll('button').length,
    imgCount: sidebar.querySelectorAll('img').length
  } : null;

  const thumbnailInfo = thumbnails.map((btn, i) => ({
    index: i,
    hasImg: !!btn.querySelector('img'),
    imgSrc: btn.querySelector('img')?.src?.substring(0, 80),
    classes: btn.className?.substring(0, 80)
  }));

  const result = {
    success: true,
    textarea: textarea ? {
      ariaLabel: textarea.getAttribute('aria-label'),
      placeholder: textarea.getAttribute('placeholder'),
      value: textarea.value?.substring(0, 30)
    } : null,
    sidebar: sidebarInfo,
    thumbnails: thumbnailInfo,
    nearbyButtons: nearbyButtons,
    url: window.location.href
  };

  console.log('debugEditDOM result:', JSON.stringify(result, null, 2));
  return result;
}

// Fetch an image URL and return as base64 data URL
// This runs in the page context so it has access to grok.com cookies
async function fetchImageBase64(url) {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`fetchImageBase64 failed for ${url}:`, error);
    throw error;
  }
}

// ==================== UTILITIES ====================

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
