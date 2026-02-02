const API_BASE = '';
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const errorMessage = document.getElementById('errorMessage');
const errorText = errorMessage.querySelector('.error-text');
const videoCard = document.getElementById('videoCard');
const thumbnail = document.getElementById('thumbnail');
const videoTitle = document.getElementById('videoTitle');
const videoUploader = document.getElementById('videoUploader');
const platformBadge = document.getElementById('platformBadge');
const duration = document.getElementById('duration');
const formatSelect = document.getElementById('formatSelect');
const downloadBtn = document.getElementById('downloadBtn');
const downloadProgress = document.getElementById('downloadProgress');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const downloadComplete = document.getElementById('downloadComplete');
const downloadLink = document.getElementById('downloadLink');

let currentVideoData = null;

function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
    videoCard.classList.add('hidden');
    downloadProgress.classList.add('hidden');
    downloadComplete.classList.add('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function setButtonLoading(button, loading) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

//detect platform
function detectPlatform(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com')) return 'instagram';
    return 'unknown';
}

//get video info
async function fetchVideoInfo() {
    const url = urlInput.value.trim();
    
    if (!url) {
        showError('Please enter a video URL');
        return;
    }
    
    const platform = detectPlatform(url);
    if (platform === 'unknown') {
        showError('Unsupported platform. Please use YouTube, TikTok, or Instagram URLs.');
        return;
    }
    
    hideError();
    setButtonLoading(fetchBtn, true);
    videoCard.classList.add('hidden');
    downloadProgress.classList.add('hidden');
    downloadComplete.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/api/info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch video info');
        }
        
        currentVideoData = data;
        displayVideoInfo(data);
        
    } catch (error) {
        showError(error.message || 'Failed to fetch video info. Make sure the URL is valid.');
    } finally {
        setButtonLoading(fetchBtn, false);
    }
}

//display video info
function displayVideoInfo(data) {
    if (data.thumbnail) {
        thumbnail.src = data.thumbnail;
        thumbnail.onerror = () => {
            thumbnail.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect fill="%231a1a2e" width="640" height="360"/><text fill="%23666" font-family="Arial" font-size="24" x="50%" y="50%" text-anchor="middle" dy=".3em">No Preview Available</text></svg>';
        };
    }

    videoTitle.textContent = data.title;
    videoUploader.textContent = data.uploader;

    const durationText = formatDuration(data.duration);
    if (durationText) {
        duration.textContent = durationText;
        duration.style.display = 'block';
    } else {
        duration.style.display = 'none';
    }

    platformBadge.className = `platform-badge ${data.platform}`;
    platformBadge.textContent = data.platform.charAt(0).toUpperCase() + data.platform.slice(1);
    
    formatSelect.innerHTML = '';
    data.formats.forEach(format => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ format_id: format.format_id, type: format.type });
        
        let label = format.quality;
        if (format.filesize) {
            label += ` (${formatFileSize(format.filesize)})`;
        }
        if (format.type === 'audio') {
            label = '🎵' + label;
        } else {
            label = '🎬' + label;
        }
        
        option.textContent = label;
        formatSelect.appendChild(option);
    });
    
    videoCard.classList.remove('hidden');
}

//download
async function startDownload() {
    if (!currentVideoData) return;
    
    const selectedFormat = JSON.parse(formatSelect.value);
    
    setButtonLoading(downloadBtn, true);
    downloadProgress.classList.remove('hidden');
    downloadComplete.classList.add('hidden');
    
    //fake progress
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress > 90) progress = 90;
        progressFill.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;
    }, 500);
    
    try {
        const response = await fetch(`${API_BASE}/api/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: currentVideoData.original_url,
                format_id: selectedFormat.format_id,
                type: selectedFormat.type
            })
        });
        
        const data = await response.json();
        
        clearInterval(progressInterval);
        
        if (!response.ok) {
            throw new Error(data.error || 'Download failed');
        }
        
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        
        setTimeout(() => {
            downloadProgress.classList.add('hidden');
            downloadComplete.classList.remove('hidden');
            downloadLink.href = `/api/file/${data.filename}`;
            downloadLink.download = data.filename;
            const a = document.createElement('a');
            a.href = `/api/file/${data.filename}`;
            a.download = data.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
        }, 500);
        
    } catch (error) {
        clearInterval(progressInterval);
        downloadProgress.classList.add('hidden');
        showError(error.message || 'Download failed. Please try again.');
    } finally {
        setButtonLoading(downloadBtn, false);
    }
}

fetchBtn.addEventListener('click', fetchVideoInfo);

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        fetchVideoInfo();
    }
});

downloadBtn.addEventListener('click', startDownload);

urlInput.addEventListener('paste', () => {
    setTimeout(() => {
        const url = urlInput.value.trim();
        if (url && detectPlatform(url) !== 'unknown') {
            fetchVideoInfo();
        }
    }, 100);
});

window.addEventListener('load', () => {
    urlInput.focus();
});
