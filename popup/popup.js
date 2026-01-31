// Grok Video Generator - Popup Script

// State
let selectedFiles = [];
let isProcessing = false;
let isPaused = false;
let currentTabId = null;

// DOM Elements
const elements = {
  statusBadge: document.getElementById('status-badge'),
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
  warningBanner: document.getElementById('warning-banner')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkGrokPage();
  await loadState();
  setupEventListeners();
  updateUI();
  setInterval(refreshState, 1000);
});

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
  } catch (error) {
    console.error('Error refreshing state:', error);
  }
}

// Setup event listeners
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
      icon = '✓';
      statusClass = 'success';
    } else if (entry.status === 'failed') {
      icon = '✗';
      statusClass = 'error';
    } else if (entry.status === 'processing') {
      icon = '↻';
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

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Truncate string
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
