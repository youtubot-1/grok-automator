// Grok Automator - Popup Script

// ==================== VIDEO TAB STATE ====================
let selectedFiles = [];
let isProcessing = false;
let isPaused = false;
let currentTabId = null;

// ==================== IMAGE EDIT TAB STATE ====================
let editIsProcessing = false;
let editIsPaused = false;

// ==================== DOM ELEMENTS ====================
const elements = {
  // Common
  statusBadge: document.getElementById('status-badge'),

  // Video tab
  aspectRatio: document.getElementById('aspect-ratio'),
  downloadFolder: document.getElementById('download-folder'),
  selectFolderBtn: document.getElementById('select-folder-btn'),
  selectFilesBtn: document.getElementById('select-files-btn'),
  folderInput: document.getElementById('folder-input'),
  filesInput: document.getElementById('files-input'),
  filesPreview: document.getElementById('files-preview'),
  filesCount: document.getElementById('files-count'),
  clearFilesBtn: document.getElementById('clear-files-btn'),
  startBtn: document.getElementById('start-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  stopBtn: document.getElementById('stop-btn'),
  progressSection: document.getElementById('progress-section'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  currentStatus: document.getElementById('current-status'),
  generatedVideosSection: document.getElementById('generated-videos-section'),
  generatedVideosList: document.getElementById('generated-videos-list'),
  generatedCount: document.getElementById('generated-count'),
  downloadAllBtn: document.getElementById('download-all-btn'),
  clearVideosBtn: document.getElementById('clear-videos-btn'),
  logList: document.getElementById('log-list'),
  warningBanner: document.getElementById('warning-banner'),

  // Image Edit tab
  editPrompts: document.getElementById('edit-prompts'),
  editUploadPromptsBtn: document.getElementById('edit-upload-prompts-btn'),
  editPromptsFile: document.getElementById('edit-prompts-file'),
  editPromptsCount: document.getElementById('edit-prompts-count'),
  editClearPromptsBtn: document.getElementById('edit-clear-prompts-btn'),
  editDelay: document.getElementById('edit-delay'),
  editDelayValue: document.getElementById('edit-delay-value'),
  editDownloadFolder: document.getElementById('edit-download-folder'),
  editStartBtn: document.getElementById('edit-start-btn'),
  editPauseBtn: document.getElementById('edit-pause-btn'),
  editStopBtn: document.getElementById('edit-stop-btn'),
  editWarningBanner: document.getElementById('edit-warning-banner'),
  editProgressSection: document.getElementById('edit-progress-section'),
  editProgressFill: document.getElementById('edit-progress-fill'),
  editProgressText: document.getElementById('edit-progress-text'),
  editCurrentStatus: document.getElementById('edit-current-status'),
  editGeneratedImagesSection: document.getElementById('edit-generated-images-section'),
  editGeneratedImagesList: document.getElementById('edit-generated-images-list'),
  editGeneratedCount: document.getElementById('edit-generated-count'),
  editDownloadAllBtn: document.getElementById('edit-download-all-btn'),
  editClearImagesBtn: document.getElementById('edit-clear-images-btn'),
  editLogList: document.getElementById('edit-log-list')
};

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', async () => {
  await checkGrokPage();
  await loadState();
  await loadEditState();
  setupTabSwitching();
  setupEventListeners();
  setupEditEventListeners();
  updateUI();
  updateEditUI();
  setInterval(refreshState, 1000);
});

// ==================== TAB SWITCHING ====================
function setupTabSwitching() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      // Update tab buttons
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update tab content
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${tabName}`).classList.add('active');
    });
  });
}

// ==================== COMMON ====================

// Check if current tab is Grok Imagine page
async function checkGrokPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;

    if (tab.url && tab.url.includes('grok.com/imagine')) {
      elements.statusBadge.textContent = 'Connected';
      elements.statusBadge.classList.add('connected');
    } else {
      elements.statusBadge.textContent = 'Not on Grok';
      elements.statusBadge.classList.remove('connected');
    }
  } catch (error) {
    console.error('Error checking page:', error);
  }
}

// Truncate string
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ==================== VIDEO TAB ====================

// Load state from background
async function loadState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getState' });
    if (response) {
      isProcessing = response.isProcessing || false;
      isPaused = response.isPaused || false;
      elements.aspectRatio.value = response.aspectRatio || '16:9';
      elements.downloadFolder.value = response.downloadFolder || 'grok-videos';
      updateProgressDisplay(response);
      updateLogDisplay(response.log || []);
      updateControlButtons();
      await loadGeneratedVideos();
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

// Refresh state periodically
async function refreshState() {
  try {
    // Refresh video state
    const response = await chrome.runtime.sendMessage({ action: 'getState' });
    if (response) {
      const wasProcessing = isProcessing;
      isProcessing = response.isProcessing || false;
      isPaused = response.isPaused || false;
      updateProgressDisplay(response);
      updateLogDisplay(response.log || []);
      updateControlButtons();

      if (isProcessing && !isPaused) {
        const currentFile = response.queue?.[response.currentIndex];
        if (currentFile) {
          elements.currentStatus.textContent = `Generating: "${truncate(currentFile.filename, 30)}"`;
        }
      } else if (isPaused) {
        elements.currentStatus.textContent = 'Paused';
      } else if (!isProcessing && response.videoCounter > 0) {
        elements.currentStatus.textContent = 'Complete!';
      }

      if (wasProcessing && !isProcessing) {
        await loadGeneratedVideos();
      }
    }

    // Refresh image edit state
    const editResponse = await chrome.runtime.sendMessage({ action: 'getImageEditState' });
    if (editResponse) {
      const wasEditProcessing = editIsProcessing;
      editIsProcessing = editResponse.isProcessing || false;
      editIsPaused = editResponse.isPaused || false;
      updateEditProgressDisplay(editResponse);
      updateEditLogDisplay(editResponse.log || []);
      updateEditControlButtons();

      if (editIsProcessing && !editIsPaused) {
        const currentPrompt = editResponse.prompts?.[editResponse.currentIndex];
        if (currentPrompt) {
          elements.editCurrentStatus.textContent = `Editing: "${truncate(currentPrompt, 30)}"`;
        }
      } else if (editIsPaused) {
        elements.editCurrentStatus.textContent = 'Paused';
      } else if (!editIsProcessing && editResponse.error) {
        elements.editCurrentStatus.textContent = `Error: ${truncate(editResponse.error, 50)}`;
      } else if (!editIsProcessing && editResponse.currentIndex >= (editResponse.prompts?.length || 0) && (editResponse.prompts?.length || 0) > 0) {
        elements.editCurrentStatus.textContent = 'Complete!';
      } else if (!editIsProcessing && wasEditProcessing) {
        elements.editCurrentStatus.textContent = 'Stopped';
      }

      if (wasEditProcessing && !editIsProcessing) {
        await loadEditGeneratedImages();
      }
    }
  } catch (error) {
    console.error('Error refreshing state:', error);
  }
}

// Setup event listeners (Video tab)
function setupEventListeners() {
  elements.selectFolderBtn.addEventListener('click', () => elements.folderInput.click());
  elements.selectFilesBtn.addEventListener('click', () => elements.filesInput.click());
  elements.folderInput.addEventListener('change', handleFolderSelect);
  elements.filesInput.addEventListener('change', handleFilesSelect);
  elements.clearFilesBtn.addEventListener('click', clearFiles);
  elements.aspectRatio.addEventListener('change', saveSettings);
  elements.downloadFolder.addEventListener('change', saveSettings);
  elements.startBtn.addEventListener('click', startGeneration);
  elements.pauseBtn.addEventListener('click', togglePause);
  elements.stopBtn.addEventListener('click', stopGeneration);
  elements.downloadAllBtn.addEventListener('click', downloadAllVideos);
  elements.clearVideosBtn.addEventListener('click', clearGeneratedVideos);
}

// Handle folder selection
async function handleFolderSelect(event) {
  const files = Array.from(event.target.files).filter(isImageFile);
  if (files.length > 0) {
    selectedFiles = files;
    updateFilesPreview();
  }
  event.target.value = '';
}

// Handle files selection
async function handleFilesSelect(event) {
  const files = Array.from(event.target.files).filter(isImageFile);
  if (files.length > 0) {
    selectedFiles = [...selectedFiles, ...files];
    updateFilesPreview();
  }
  event.target.value = '';
}

// Check if file is an image
function isImageFile(file) {
  return file.type.startsWith('image/');
}

// Update files preview
function updateFilesPreview() {
  if (selectedFiles.length === 0) {
    elements.filesPreview.innerHTML = '<p class="empty-files">No images selected</p>';
    elements.filesCount.textContent = '0 images';
    elements.clearFilesBtn.disabled = true;
  } else {
    const previewHtml = selectedFiles.slice(0, 20).map(file => {
      const url = URL.createObjectURL(file);
      return `
        <div class="file-item">
          <img src="${url}" alt="${file.name}">
          <span>${file.name}</span>
        </div>
      `;
    }).join('');

    const moreText = selectedFiles.length > 20 ? `<p class="empty-files">...and ${selectedFiles.length - 20} more</p>` : '';
    elements.filesPreview.innerHTML = previewHtml + moreText;
    elements.filesCount.textContent = `${selectedFiles.length} images`;
    elements.clearFilesBtn.disabled = false;
  }
  updateControlButtons();
}

// Clear selected files
function clearFiles() {
  selectedFiles = [];
  updateFilesPreview();
}

// Save settings
async function saveSettings() {
  await chrome.runtime.sendMessage({
    action: 'updateSettings',
    aspectRatio: elements.aspectRatio.value,
    downloadFolder: elements.downloadFolder.value
  });
}

// Start generation
async function startGeneration() {
  if (selectedFiles.length === 0) {
    alert('Please select some images first.');
    return;
  }

  if (!elements.statusBadge.classList.contains('connected')) {
    alert('Please navigate to Grok Imagine page first.');
    return;
  }

  // Convert files to base64 for storage
  const queue = await Promise.all(selectedFiles.map(async (file, index) => {
    const base64 = await fileToBase64(file);
    return {
      filename: file.name,
      data: base64,
      status: 'pending',
      outputFilename: `${String(index + 1).padStart(2, '0')}-grok-${file.name.replace(/\.[^/.]+$/, '')}.mp4`
    };
  }));

  isProcessing = true;
  isPaused = false;

  await chrome.runtime.sendMessage({
    action: 'startProcessing',
    tabId: currentTabId,
    queue: queue,
    aspectRatio: elements.aspectRatio.value,
    downloadFolder: elements.downloadFolder.value
  });

  elements.progressSection.style.display = 'block';
  elements.currentStatus.textContent = 'Starting...';
  updateControlButtons();
}

// Toggle pause
async function togglePause() {
  if (isPaused) {
    isPaused = false;
    await chrome.runtime.sendMessage({ action: 'resumeProcessing' });
    elements.pauseBtn.textContent = 'Pause';
    elements.currentStatus.textContent = 'Resuming...';
  } else {
    isPaused = true;
    await chrome.runtime.sendMessage({ action: 'pauseProcessing' });
    elements.pauseBtn.textContent = 'Resume';
    elements.currentStatus.textContent = 'Paused';
  }
  updateControlButtons();
}

// Stop generation
async function stopGeneration() {
  if (!confirm('Are you sure you want to stop generation?')) return;

  isProcessing = false;
  isPaused = false;
  await chrome.runtime.sendMessage({ action: 'stopProcessing' });
  updateControlButtons();
}

// Update progress display
function updateProgressDisplay(state) {
  if (state.isProcessing || state.isPaused || state.videoCounter > 0 || (state.log && state.log.length > 0)) {
    elements.progressSection.style.display = 'block';
    const total = state.queue?.length || state.videoCounter || 0;
    const current = state.videoCounter || 0;
    const percent = total > 0 ? (current / total) * 100 : 0;
    elements.progressFill.style.width = `${percent}%`;
    elements.progressText.textContent = `${current}/${total} videos`;
  }
}

// Update log display
function updateLogDisplay(log) {
  if (!log || log.length === 0) {
    elements.logList.innerHTML = '<p class="empty-log">No activity yet</p>';
    return;
  }

  elements.logList.innerHTML = log.map(entry => {
    let icon = '';
    let statusClass = '';
    if (entry.status === 'completed') {
      icon = '\u2713';
      statusClass = 'success';
    } else if (entry.status === 'failed') {
      icon = '\u2717';
      statusClass = 'error';
    } else if (entry.status === 'processing') {
      icon = '\u21BB';
      statusClass = 'processing';
    }

    return `
      <div class="log-entry ${statusClass}">
        <span class="log-icon">${icon}</span>
        <span class="log-filename">${entry.filename}</span>
        ${entry.error ? `<span class="log-error">(${truncate(entry.error, 20)})</span>` : ''}
      </div>
    `;
  }).join('');

  elements.logList.scrollTop = elements.logList.scrollHeight;
}

// Update control buttons
function updateControlButtons() {
  const isOnGrok = elements.statusBadge.classList.contains('connected');

  if (isProcessing) {
    elements.startBtn.disabled = true;
    elements.pauseBtn.disabled = false;
    elements.stopBtn.disabled = false;
    elements.pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    elements.selectFolderBtn.disabled = true;
    elements.selectFilesBtn.disabled = true;
    elements.clearFilesBtn.disabled = true;
    elements.warningBanner.style.display = 'flex';
  } else {
    elements.startBtn.disabled = selectedFiles.length === 0 || !isOnGrok;
    elements.pauseBtn.disabled = true;
    elements.stopBtn.disabled = true;
    elements.pauseBtn.textContent = 'Pause';
    elements.selectFolderBtn.disabled = false;
    elements.selectFilesBtn.disabled = false;
    elements.clearFilesBtn.disabled = selectedFiles.length === 0;
    elements.warningBanner.style.display = 'none';
  }
}

// Update UI
function updateUI() {
  updateFilesPreview();
  updateControlButtons();
}

// Load generated videos from background
async function loadGeneratedVideos() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getGeneratedVideos' });
    if (response && response.videos) {
      displayGeneratedVideos(response.videos);
    }
  } catch (error) {
    console.error('Error loading generated videos:', error);
  }
}

// Display generated videos
function displayGeneratedVideos(videos) {
  if (!videos || videos.length === 0) {
    elements.generatedVideosSection.style.display = 'none';
    return;
  }

  elements.generatedVideosSection.style.display = 'block';
  elements.generatedCount.textContent = `(${videos.length})`;

  elements.generatedVideosList.innerHTML = videos.map((video, index) => `
    <div class="generated-video-item" data-index="${index}" title="${video.filename}">
      <video src="${video.url}" muted></video>
      <span class="video-name">${video.filename}</span>
    </div>
  `).join('');

  // Add hover play functionality
  elements.generatedVideosList.querySelectorAll('.generated-video-item').forEach(item => {
    const video = item.querySelector('video');
    item.addEventListener('mouseenter', () => video.play());
    item.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });
  });
}

// Download all videos as a zip file
async function downloadAllVideos() {
  try {
    elements.downloadAllBtn.disabled = true;
    elements.downloadAllBtn.textContent = 'Preparing...';

    // Get video URLs from background
    const response = await chrome.runtime.sendMessage({ action: 'getGeneratedVideos' });
    if (!response || !response.videos || response.videos.length === 0) {
      alert('No videos to download');
      return;
    }

    const videos = response.videos;
    const zip = new JSZip();
    const folderName = elements.downloadFolder.value || 'grok-videos';

    // Fetch each video and add to zip
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      elements.downloadAllBtn.textContent = `Fetching ${i + 1}/${videos.length}...`;

      try {
        const videoResponse = await fetch(video.url);
        if (!videoResponse.ok) {
          console.error(`Failed to fetch ${video.filename}: ${videoResponse.status}`);
          continue;
        }
        const blob = await videoResponse.blob();
        zip.file(video.filename, blob);
      } catch (e) {
        console.error(`Error fetching ${video.filename}:`, e);
      }
    }

    // Generate zip
    elements.downloadAllBtn.textContent = 'Creating zip...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Download zip
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Clear videos after download
    await chrome.runtime.sendMessage({ action: 'clearGeneratedVideos' });
    elements.generatedVideosSection.style.display = 'none';
    elements.generatedVideosList.innerHTML = '';

  } catch (error) {
    console.error('Error downloading videos:', error);
    alert('Download failed: ' + error.message);
  } finally {
    elements.downloadAllBtn.disabled = false;
    elements.downloadAllBtn.textContent = 'Download All';
  }
}

// Clear generated videos
async function clearGeneratedVideos() {
  if (!confirm('Are you sure you want to clear all generated videos?')) return;

  try {
    await chrome.runtime.sendMessage({ action: 'clearGeneratedVideos' });
    elements.generatedVideosSection.style.display = 'none';
    elements.generatedVideosList.innerHTML = '';
  } catch (error) {
    console.error('Error clearing videos:', error);
  }
}

// ==================== IMAGE EDIT TAB ====================

// Get prompts from textarea as array
function getEditPrompts() {
  const text = elements.editPrompts.value.trim();
  if (!text) return [];
  return text.split('\n').map(p => p.trim()).filter(p => p.length > 0);
}

// Update prompts count display
function updateEditPromptsCount() {
  const prompts = getEditPrompts();
  elements.editPromptsCount.textContent = `${prompts.length} prompt${prompts.length !== 1 ? 's' : ''}`;
  elements.editClearPromptsBtn.disabled = prompts.length === 0;
  updateEditControlButtons();
}

// Setup Image Edit event listeners
function setupEditEventListeners() {
  // Prompts input
  elements.editPrompts.addEventListener('input', updateEditPromptsCount);

  // .txt file upload
  elements.editUploadPromptsBtn.addEventListener('click', () => elements.editPromptsFile.click());
  elements.editPromptsFile.addEventListener('change', handlePromptsFileUpload);

  // Clear prompts
  elements.editClearPromptsBtn.addEventListener('click', () => {
    elements.editPrompts.value = '';
    updateEditPromptsCount();
  });

  // Delay slider
  elements.editDelay.addEventListener('input', () => {
    elements.editDelayValue.textContent = elements.editDelay.value;
  });

  // Download folder
  elements.editDownloadFolder.value = 'grok-edits';

  // Control buttons
  elements.editStartBtn.addEventListener('click', startImageEdit);
  elements.editPauseBtn.addEventListener('click', toggleEditPause);
  elements.editStopBtn.addEventListener('click', stopImageEdit);

  // Generated images actions
  elements.editDownloadAllBtn.addEventListener('click', downloadAllEditImages);
  elements.editClearImagesBtn.addEventListener('click', clearEditGeneratedImages);

  // Debug button
  document.getElementById('edit-debug-btn').addEventListener('click', debugEditDOM);
}

// Handle .txt file upload for prompts
async function handlePromptsFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    // Append to existing prompts
    const existing = elements.editPrompts.value.trim();
    elements.editPrompts.value = existing ? existing + '\n' + text : text;
    updateEditPromptsCount();
  } catch (error) {
    console.error('Error reading prompts file:', error);
    alert('Failed to read file: ' + error.message);
  }

  event.target.value = '';
}

// Load edit state from background
async function loadEditState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getImageEditState' });
    if (response) {
      editIsProcessing = response.isProcessing || false;
      editIsPaused = response.isPaused || false;
      if (response.delay) {
        elements.editDelay.value = response.delay;
        elements.editDelayValue.textContent = response.delay;
      }
      updateEditProgressDisplay(response);
      updateEditLogDisplay(response.log || []);
      updateEditControlButtons();
      await loadEditGeneratedImages();
    }
  } catch (error) {
    console.error('Error loading edit state:', error);
  }
}

// Start image edit processing
async function startImageEdit() {
  const prompts = getEditPrompts();
  if (prompts.length === 0) {
    alert('Please enter at least one prompt.');
    return;
  }

  if (!elements.statusBadge.classList.contains('connected')) {
    alert('Please navigate to Grok Imagine page first.');
    return;
  }

  editIsProcessing = true;
  editIsPaused = false;

  await chrome.runtime.sendMessage({
    action: 'startImageEdit',
    tabId: currentTabId,
    prompts: prompts,
    delay: parseInt(elements.editDelay.value, 10),
    downloadFolder: elements.editDownloadFolder.value || 'grok-edits'
  });

  elements.editProgressSection.style.display = 'block';
  elements.editCurrentStatus.textContent = 'Starting...';
  updateEditControlButtons();
}

// Toggle edit pause
async function toggleEditPause() {
  if (editIsPaused) {
    editIsPaused = false;
    await chrome.runtime.sendMessage({ action: 'resumeImageEdit' });
    elements.editPauseBtn.textContent = 'Pause';
    elements.editCurrentStatus.textContent = 'Resuming...';
  } else {
    editIsPaused = true;
    await chrome.runtime.sendMessage({ action: 'pauseImageEdit' });
    elements.editPauseBtn.textContent = 'Resume';
    elements.editCurrentStatus.textContent = 'Paused';
  }
  updateEditControlButtons();
}

// Stop image edit
async function stopImageEdit() {
  if (!confirm('Are you sure you want to stop image editing?')) return;

  editIsProcessing = false;
  editIsPaused = false;
  await chrome.runtime.sendMessage({ action: 'stopImageEdit' });
  updateEditControlButtons();
}

// Update edit progress display
function updateEditProgressDisplay(state) {
  if (state.isProcessing || state.isPaused || (state.log && state.log.length > 0)) {
    elements.editProgressSection.style.display = 'block';
    const total = state.prompts?.length || 0;
    const current = state.currentIndex || 0;
    const percent = total > 0 ? (current / total) * 100 : 0;
    elements.editProgressFill.style.width = `${percent}%`;
    elements.editProgressText.textContent = `${current}/${total} prompts`;
  }
}

// Update edit log display
function updateEditLogDisplay(log) {
  if (!log || log.length === 0) {
    elements.editLogList.innerHTML = '<p class="empty-log">No activity yet</p>';
    return;
  }

  elements.editLogList.innerHTML = log.map(entry => {
    let icon = '';
    let statusClass = '';
    if (entry.status === 'completed') {
      icon = '\u2713';
      statusClass = 'success';
    } else if (entry.status === 'failed') {
      icon = '\u2717';
      statusClass = 'error';
    } else if (entry.status === 'processing') {
      icon = '\u21BB';
      statusClass = 'processing';
    }

    return `
      <div class="log-entry ${statusClass}">
        <span class="log-icon">${icon}</span>
        <span class="log-filename">${entry.filename}</span>
        ${entry.error ? `<span class="log-error">(${truncate(entry.error, 20)})</span>` : ''}
      </div>
    `;
  }).join('');

  elements.editLogList.scrollTop = elements.editLogList.scrollHeight;
}

// Update edit control buttons
function updateEditControlButtons() {
  const isOnGrok = elements.statusBadge.classList.contains('connected');
  const hasPrompts = getEditPrompts().length > 0;

  if (editIsProcessing) {
    elements.editStartBtn.disabled = true;
    elements.editPauseBtn.disabled = false;
    elements.editStopBtn.disabled = false;
    elements.editPauseBtn.textContent = editIsPaused ? 'Resume' : 'Pause';
    elements.editPrompts.disabled = true;
    elements.editUploadPromptsBtn.disabled = true;
    elements.editClearPromptsBtn.disabled = true;
    elements.editWarningBanner.style.display = 'flex';
  } else {
    elements.editStartBtn.disabled = !hasPrompts || !isOnGrok;
    elements.editPauseBtn.disabled = true;
    elements.editStopBtn.disabled = true;
    elements.editPauseBtn.textContent = 'Pause';
    elements.editPrompts.disabled = false;
    elements.editUploadPromptsBtn.disabled = false;
    elements.editClearPromptsBtn.disabled = !hasPrompts;
    elements.editWarningBanner.style.display = 'none';
  }
}

// Update edit UI
function updateEditUI() {
  updateEditPromptsCount();
  updateEditControlButtons();
}

// Load generated images from background
async function loadEditGeneratedImages() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getEditGeneratedImages' });
    if (response && response.images) {
      displayEditGeneratedImages(response.images);
    }
  } catch (error) {
    console.error('Error loading edit generated images:', error);
  }
}

// Display generated images
function displayEditGeneratedImages(images) {
  if (!images || images.length === 0) {
    elements.editGeneratedImagesSection.style.display = 'none';
    return;
  }

  elements.editGeneratedImagesSection.style.display = 'block';
  elements.editGeneratedCount.textContent = `(${images.length})`;

  elements.editGeneratedImagesList.innerHTML = images.map((image, index) => `
    <div class="generated-image-item" data-index="${index}" title="${image.filename}">
      <img src="${image.url}" alt="${image.filename}">
      <span class="image-name">${image.filename}</span>
    </div>
  `).join('');
}

// Convert a base64 data URL to a Blob
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

// Download all edit images as a zip file
async function downloadAllEditImages() {
  try {
    elements.editDownloadAllBtn.disabled = true;
    elements.editDownloadAllBtn.textContent = 'Preparing...';

    const response = await chrome.runtime.sendMessage({ action: 'getEditGeneratedImages' });
    if (!response || !response.images || response.images.length === 0) {
      alert('No images to download');
      return;
    }

    const images = response.images;
    const zip = new JSZip();
    const folderName = elements.editDownloadFolder.value || 'grok-edits';
    let addedCount = 0;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      elements.editDownloadAllBtn.textContent = `Adding ${i + 1}/${images.length}...`;

      try {
        let blob;
        if (image.url.startsWith('data:')) {
          // Base64 data URL - convert directly
          blob = dataUrlToBlob(image.url);
        } else {
          // Regular URL - try fetching
          const imgResponse = await fetch(image.url, { credentials: 'include' });
          if (!imgResponse.ok) {
            console.error(`Failed to fetch ${image.filename}: ${imgResponse.status}`);
            continue;
          }
          blob = await imgResponse.blob();
        }
        zip.file(image.filename, blob);
        addedCount++;
      } catch (e) {
        console.error(`Error processing ${image.filename}:`, e);
      }
    }

    if (addedCount === 0) {
      alert('Could not retrieve any images. Try running the generation again.');
      return;
    }

    elements.editDownloadAllBtn.textContent = 'Creating zip...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Error downloading images:', error);
    alert('Download failed: ' + error.message);
  } finally {
    elements.editDownloadAllBtn.disabled = false;
    elements.editDownloadAllBtn.textContent = 'Download All';
  }
}

// Clear generated images
async function clearEditGeneratedImages() {
  if (!confirm('Are you sure you want to clear all generated images?')) return;

  try {
    await chrome.runtime.sendMessage({ action: 'clearEditGeneratedImages' });
    elements.editGeneratedImagesSection.style.display = 'none';
    elements.editGeneratedImagesList.innerHTML = '';
  } catch (error) {
    console.error('Error clearing images:', error);
  }
}

// Debug: inspect the edit mode DOM
async function debugEditDOM() {
  const output = document.getElementById('edit-debug-output');
  const btn = document.getElementById('edit-debug-btn');
  btn.textContent = 'Inspecting...';
  output.style.display = 'block';
  output.textContent = 'Loading...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'debugEditDOM',
      tabId: currentTabId
    });
    output.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    output.textContent = 'Error: ' + error.message;
  } finally {
    btn.textContent = 'Debug: Inspect Edit DOM';
  }
}
