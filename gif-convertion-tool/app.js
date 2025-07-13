let selectedFile = null;
let videoElement = null;
let gifBlob = null;

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const fileDuration = document.getElementById('fileDuration');
const controls = document.getElementById('controls');
const convertBtn = document.getElementById('convertBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const previewContainer = document.getElementById('previewContainer');
const previewGif = document.getElementById('previewGif');
const downloadBtn = document.getElementById('downloadBtn');
const newFileBtn = document.getElementById('newFileBtn');
const errorMessage = document.getElementById('errorMessage');
const targetSizeInput = document.getElementById('targetSize');
const modeGif = document.getElementById('modeGif');
const modeCompress = document.getElementById('modeCompress');
const gifControls = document.getElementById('gifControls');
const compressControls = document.getElementById('compressControls');
const compressBtn = document.getElementById('compressBtn');

// Upload area events
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', handleDragOver);
uploadArea.addEventListener('dragleave', handleDragLeave);
uploadArea.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);

// Control events
convertBtn.addEventListener('click', convertToGif);
downloadBtn.addEventListener('click', downloadGif);
newFileBtn.addEventListener('click', resetConverter);

// Mode switching logic
modeGif.addEventListener('change', updateMode);
modeCompress.addEventListener('change', updateMode);
function updateMode() {
    if (modeGif.checked) {
        gifControls.style.display = '';
        compressControls.style.display = 'none';
    } else {
        gifControls.style.display = 'none';
        compressControls.style.display = '';
    }
}
// Initial mode setup
updateMode();

// Compress button event (logic to be implemented)
if (compressBtn) {
    compressBtn.addEventListener('click', compressVideo);
}

async function compressVideo() {
    if (!selectedFile) {
        showError('Please select a video file to compress.');
        return;
    }
    hideError();
    convertBtn.disabled = true;
    if (compressBtn) compressBtn.disabled = true;
    progressContainer.classList.add('active');
    updateProgress(0, 'Loading FFmpeg...');

    // Get user settings
    const targetSizeMB = parseFloat(document.getElementById('compressTargetSize').value) || null;
    const quality = parseInt(document.getElementById('compressQuality').value) || 28;
    const speed = parseFloat(document.getElementById('speedSelect').value) || 1;
    const { createFFmpeg, fetchFile } = window.FFmpeg;
    const ffmpeg = createFFmpeg({ log: true });
    const inputExt = selectedFile.name.split('.').pop();
    const inputName = 'input.' + inputExt;
    const outputName = 'output.' + inputExt;

    try {
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }
        updateProgress(10, 'Preparing video...');
        await ffmpeg.FS('writeFile', inputName, await fetchFile(selectedFile));

        // If speed is not 1, adjust video and audio speed
        if (speed !== 1) {
            // For audio, atempo only supports 0.5-2.0, so chain if needed
            let atempoFilters = [];
            let remaining = speed;
            while (remaining > 2.0) {
                atempoFilters.push('atempo=2.0');
                remaining /= 2.0;
            }
            while (remaining < 0.5) {
                atempoFilters.push('atempo=0.5');
                remaining *= 2.0;
            }
            atempoFilters.push(`atempo=${remaining}`);
            const atempo = atempoFilters.join(',');
            updateProgress(20, 'Adjusting speed...');
            await ffmpeg.run(
                '-i', inputName,
                '-filter_complex', `[0:v]setpts=${(1/speed).toFixed(3)}*PTS[v];[0:a]${atempo}[a]`,
                '-map', '[v]',
                '-map', '[a]',
                '-preset', 'fast',
                outputName
            );
        } else {
            // If speed is 1, use previous compression logic
            // Estimate bitrate if target size is set
            let bitrateArg = [];
            if (targetSizeMB) {
                let duration = 0;
                if (videoElement && videoElement.duration) {
                    duration = videoElement.duration;
                } else {
                    duration = 10;
                }
                const targetKbits = targetSizeMB * 8192;
                const bitrate = Math.floor(targetKbits / duration);
                bitrateArg = ['-b:v', bitrate + 'k'];
            }
            updateProgress(20, 'Compressing video...');
            await ffmpeg.run(
                '-i', inputName,
                '-vcodec', 'libx264',
                '-crf', quality.toString(),
                ...bitrateArg,
                '-preset', 'fast',
                '-movflags', '+faststart',
                outputName
            );
        }
        updateProgress(90, 'Finalizing...');
        const data = ffmpeg.FS('readFile', outputName);
        const mimeType = selectedFile.type || 'video/mp4';
        const compressedBlob = new Blob([data.buffer], { type: mimeType });
        const url = URL.createObjectURL(compressedBlob);
        // Show preview and download
        previewGif.src = '';
        previewGif.style.display = 'none';
        previewContainer.classList.add('active');
        let previewVideo = document.getElementById('previewVideo');
        if (!previewVideo) {
            previewVideo = document.createElement('video');
            previewVideo.id = 'previewVideo';
            previewVideo.controls = true;
            previewVideo.style.maxWidth = '100%';
            previewVideo.style.maxHeight = '400px';
            previewVideo.style.borderRadius = '10px';
            previewVideo.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
            previewContainer.insertBefore(previewVideo, previewContainer.firstChild.nextSibling);
        }
        previewVideo.src = url;
        previewVideo.style.display = '';
        // Update download button
        downloadBtn.onclick = function() {
            const a = document.createElement('a');
            a.href = url;
            a.download = selectedFile.name.replace(/\.[^/.]+$/, '') + `-speed${speed}x.` + inputExt;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
        updateProgress(100, `Done! Output size: ${(compressedBlob.size / (1024*1024)).toFixed(2)} MB`);
    } catch (err) {
        showError('Video processing failed: ' + err.message);
        console.error(err);
    } finally {
        convertBtn.disabled = false;
        if (compressBtn) compressBtn.disabled = false;
        progressContainer.classList.remove('active');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
}

function handleFile(file) {
    if (!file.type.startsWith('video/')) {
        showError('Please select a valid video file.');
        return;
    }
    selectedFile = file;
    displayFileInfo(file);
    loadVideo(file);
}

function displayFileInfo(file) {
    fileName.textContent = `Name: ${file.name}`;
    fileSize.textContent = `Size: ${formatFileSize(file.size)}`;
    fileInfo.classList.add('active');
}

function loadVideo(file) {
    const url = URL.createObjectURL(file);
    videoElement = document.createElement('video');
    videoElement.src = url;
    videoElement.preload = 'metadata';
    videoElement.addEventListener('loadedmetadata', () => {
        fileDuration.textContent = `Duration: ${formatTime(videoElement.duration)}`;
        document.getElementById('endTime').value = Math.min(10, videoElement.duration);
        document.getElementById('endTime').max = videoElement.duration;
        document.getElementById('startTime').max = videoElement.duration;
        controls.classList.add('active');
    });
    videoElement.addEventListener('error', () => {
        showError('Error loading video. Please try a different file.');
    });
}

async function convertToGif() {
    if (!selectedFile || !videoElement) return;
    let startTime = parseFloat(document.getElementById('startTime').value) || 0;
    let endTime = parseFloat(document.getElementById('endTime').value) || 10;
    let width = parseInt(document.getElementById('width').value) || 480;
    let fps = parseInt(document.getElementById('fps').value) || 10;
    let quality = document.getElementById('quality').value;
    const targetSizeMB = parseFloat(targetSizeInput.value) || null;
    if (startTime >= endTime) {
        showError('Start time must be less than end time.');
        return;
    }
    if (endTime > videoElement.duration) {
        showError('End time cannot exceed video duration.');
        return;
    }
    convertBtn.disabled = true;
    progressContainer.classList.add('active');
    hideError();

    // Helper to try different settings
    async function tryGenerateGif(width, fps, quality, maxTries = 3) {
        let tries = 0;
        let lastBlob = null;
        let lastSettings = { width, fps, quality };
        let qualities = ['high', 'medium', 'low'];
        let qualityIndex = qualities.indexOf(quality);
        let minWidth = 120;
        let minFps = 3;
        while (tries < maxTries) {
            updateProgress(0, `Attempt ${tries + 1}...`);
            lastBlob = await generateGif(width, fps, qualities[qualityIndex]);
            const sizeMB = lastBlob.size / (1024 * 1024);
            if (!targetSizeMB || sizeMB <= targetSizeMB) {
                return { blob: lastBlob, width, fps, quality: qualities[qualityIndex], sizeMB };
            }
            // Try to reduce settings
            if (qualityIndex < qualities.length - 1) {
                qualityIndex++;
            } else if (fps > minFps) {
                fps = Math.max(minFps, Math.floor(fps * 0.7));
                qualityIndex = qualities.length - 1;
            } else if (width > minWidth) {
                width = Math.max(minWidth, Math.floor(width * 0.7));
                qualityIndex = qualities.length - 1;
            } else {
                break;
            }
            tries++;
        }
        return { blob: lastBlob, width, fps, quality: qualities[qualityIndex], sizeMB: lastBlob.size / (1024 * 1024), warning: true };
    }

    // Main GIF generation logic
    async function generateGif(width, fps, quality) {
        return new Promise(async (resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const height = Math.round((width * videoElement.videoHeight) / videoElement.videoWidth);
                canvas.width = width;
                canvas.height = height;
                const gif = new GIF({
                    workers: 2,
                    quality: quality === 'high' ? 1 : quality === 'medium' ? 10 : 20,
                    width: width,
                    height: height,
                    workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
                });
                const duration = endTime - startTime;
                const frameCount = Math.floor(duration * fps);
                const frameInterval = duration / frameCount;
                for (let i = 0; i < frameCount; i++) {
                    const currentTime = startTime + (i * frameInterval);
                    videoElement.currentTime = currentTime;
                    await new Promise(resolveSeek => {
                        videoElement.addEventListener('seeked', resolveSeek, { once: true });
                    });
                    ctx.drawImage(videoElement, 0, 0, width, height);
                    gif.addFrame(canvas, {
                        copy: true,
                        delay: Math.round(1000 / fps)
                    });
                    const progress = Math.round((i / frameCount) * 80);
                    updateProgress(progress, `Extracting frames... ${i + 1}/${frameCount}`);
                }
                updateProgress(85, 'Generating GIF...');
                gif.on('finished', function(blob) {
                    resolve(blob);
                });
                gif.on('progress', function(progress) {
                    const percent = Math.round(85 + (progress * 15));
                    updateProgress(percent, `Generating GIF... ${Math.round(progress * 100)}%`);
                });
                gif.render();
            } catch (err) {
                reject(err);
            }
        });
    }

    try {
        const result = await tryGenerateGif(width, fps, quality, 3);
        gifBlob = result.blob;
        const url = URL.createObjectURL(gifBlob);
        previewGif.src = url;
        updateProgress(100, 'Complete!');
        setTimeout(() => {
            progressContainer.classList.remove('active');
            previewContainer.classList.add('active');
            convertBtn.disabled = false;
            // Show output size
            showOutputSize(result.sizeMB, result.warning);
        }, 1000);
        if (result.warning) {
            showError('Could not reach the target file size with minimum settings. Try reducing duration or resolution.');
        }
    } catch (error) {
        showError('Error converting video. Please try again.');
        convertBtn.disabled = false;
        progressContainer.classList.remove('active');
        console.error('Conversion error:', error);
    }
}

function downloadGif() {
    if (!gifBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(gifBlob);
    a.download = selectedFile.name.replace(/\.[^/.]+$/, '') + '.gif';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function resetConverter() {
    selectedFile = null;
    videoElement = null;
    gifBlob = null;
    fileInfo.classList.remove('active');
    controls.classList.remove('active');
    progressContainer.classList.remove('active');
    previewContainer.classList.remove('active');
    fileInput.value = '';
    convertBtn.disabled = false;
    hideError();
}

function updateProgress(percent, text) {
    progressFill.style.width = percent + '%';
    progressText.textContent = text;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('active');
}

function hideError() {
    errorMessage.classList.remove('active');
}

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function showOutputSize(sizeMB, warning) {
    let msg = `Output GIF size: ${sizeMB.toFixed(2)} MB.`;
    if (warning) {
        msg += ' (Target not reached)';
    }
    progressText.textContent = msg;
} 