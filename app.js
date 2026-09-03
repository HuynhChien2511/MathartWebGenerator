const { FFmpeg } = FFmpegWASM;
const { fetchFile } = FFmpegUtil;
const ffmpeg = new FFmpeg();
ffmpeg.on('log', ({ message }) => { console.log(message); });

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const songInfo = document.getElementById('songInfo');
const generateBtn = document.getElementById('generateBtn');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');

let currentFile = null;
let isProcessing = false;

// UI Interactions
dropzone.addEventListener('click', () => {
    if (!isProcessing) fileInput.click();
});
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isProcessing) dropzone.classList.add('border-blue-500', 'bg-gray-700');
});
dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-blue-500', 'bg-gray-700');
});
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-500', 'bg-gray-700');
    if (!isProcessing && e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (file.type !== 'audio/mpeg' && !file.name.toLowerCase().endsWith('.mp3')) {
        alert("Please select an MP3 file.");
        return;
    }
    currentFile = file;
    document.getElementById('dropzoneText').textContent = file.name;
    songInfo.classList.remove('hidden');

    // Default ID
    let baseName = file.name.replace(/\.mp3$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '_');
    document.getElementById('idInput').value = baseName;

    // Extract ID3 Tags
    jsmediatags.read(file, {
        onSuccess: function(tag) {
            if (tag.tags.title) document.getElementById('titleInput').value = tag.tags.title;
            if (tag.tags.artist) document.getElementById('artistInput').value = tag.tags.artist;
        },
        onError: function(error) {
            console.log("No ID3 tags found.", error);
        }
    });
}

generateBtn.addEventListener('click', async () => {
    if (isProcessing) return;
    
    // Strict Sanitization of Song ID
    let songId = document.getElementById('idInput').value.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[^a-z0-9_.-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (!songId) {
        alert("Song ID is required and must contain valid characters");
        return;
    }
    
    // Update input box with sanitized ID so user sees what was actually used
    document.getElementById('idInput').value = songId;

    isProcessing = true;
    generateBtn.disabled = true;
    generateBtn.classList.add('opacity-50', 'cursor-not-allowed');

    songInfo.classList.add('hidden');
    dropzone.classList.add('hidden');
    progressSection.classList.remove('hidden');

    try {
        statusText.textContent = "Loading FFmpeg...";
        if (!ffmpeg.loaded) {
            const baseURL = new URL('./lib/', window.location.href.split('#')[0].split('?')[0]).href;
            await ffmpeg.load({
                coreURL: baseURL + 'ffmpeg-core.js',
                wasmURL: baseURL + 'ffmpeg-core.wasm',
                workerURL: baseURL + '814.ffmpeg.js'
            });
        }

        statusText.textContent = "Converting to OGG (This might take a minute)...";
        progressBar.style.width = "20%";
        
        let oggData = null;
        try {
            await ffmpeg.writeFile('input.mp3', await fetchFile(currentFile));
            
            // CRITICAL: Minecraft Jukeboxes require Mono audio (-ac 1) for 3D spatial attenuation to work.
            const ret = await ffmpeg.exec(['-i', 'input.mp3', '-c:a', 'libvorbis', '-ac', '1', '-q:a', '4', 'output.ogg']);
            if (ret !== 0) {
                throw new Error(`FFmpeg encoding failed with exit code ${ret}. File may be corrupted.`);
            }
            oggData = await ffmpeg.readFile('output.ogg');
        } finally {
            // Ensure memory is always freed even if encoding fails
            try { await ffmpeg.deleteFile('input.mp3'); } catch(e) {}
            try { await ffmpeg.deleteFile('output.ogg'); } catch(e) {}
        }

        statusText.textContent = "Analyzing Audio Frequencies (FFT)...";
        progressBar.style.width = "50%";
        // Allow UI to update before heavy synchronous task
        await new Promise(r => setTimeout(r, 50));
        
        const fftJson = await processFFT(currentFile, songId);

        statusText.textContent = "Packaging .mcdisc...";
        progressBar.style.width = "90%";
        
        const zip = new JSZip();
        zip.file(songId + ".ogg", oggData);
        zip.file(songId + ".json", JSON.stringify(fftJson));
        
        const meta = {
            id: songId,
            title: document.getElementById('titleInput').value || songId,
            artist: document.getElementById('artistInput').value || "Unknown",
            version: 1,
            totalTicks: fftJson.totalTicks
        };
        zip.file("meta.json", JSON.stringify(meta));

        const content = await zip.generateAsync({ type: "blob" });
        
        // Download
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = songId + ".mcdisc";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000); // defer to allow Safari/Firefox to save

        statusText.textContent = "Done! You can drop the .mcdisc into your game folder.";
        statusText.classList.replace('text-yellow-400', 'text-green-400');
        progressBar.style.width = "100%";
        progressBar.classList.replace('bg-blue-500', 'bg-green-500');
        
        // Wait 3 seconds then reset UI for another disc
        setTimeout(() => {
            resetUI();
        }, 3000);
        
    } catch (e) {
        console.error("Full error details:", e);
        statusText.textContent = "Error: " + (e.message || JSON.stringify(e) || String(e));
        statusText.classList.replace('text-yellow-400', 'text-red-500');
        
        // Show the "Try Again" state
        setTimeout(() => {
            resetUI();
            statusText.classList.replace('text-red-500', 'text-yellow-400');
            statusText.textContent = "Ready to generate.";
        }, 5000);
    }
});

function resetUI() {
    isProcessing = false;
    generateBtn.disabled = false;
    generateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    progressSection.classList.add('hidden');
    songInfo.classList.remove('hidden');
    dropzone.classList.remove('hidden');
    progressBar.style.width = "0%";
}

// Custom FFT implementation
class FFT {
    constructor(bufferSize, sampleRate) {
        this.bufferSize = bufferSize;
        this.sampleRate = sampleRate;
        this.spectrum = new Float32Array(bufferSize / 2);
        this.real = new Float32Array(bufferSize);
        this.imag = new Float32Array(bufferSize);
        this.reverseTable = new Uint32Array(bufferSize);
        
        let limit = 1;
        let bit = bufferSize >> 1;
        while (limit < bufferSize) {
            for (let i = 0; i < limit; i++) {
                this.reverseTable[i + limit] = this.reverseTable[i] + bit;
            }
            limit = limit << 1;
            bit = bit >> 1;
        }
    }

    forward(buffer) {
        const n = this.bufferSize;
        const real = this.real;
        const imag = this.imag;
        
        for (let i = 0; i < n; i++) {
            real[i] = buffer[this.reverseTable[i]];
            imag[i] = 0;
        }
        
        let halfSize = 1;
        while (halfSize < n) {
            const phaseShiftStepReal = Math.cos(-Math.PI / halfSize);
            const phaseShiftStepImag = Math.sin(-Math.PI / halfSize);
            
            let currentPhaseShiftReal = 1.0;
            let currentPhaseShiftImag = 0.0;
            
            for (let fftStep = 0; fftStep < halfSize; fftStep++) {
                for (let i = fftStep; i < n; i += 2 * halfSize) {
                    const off = i + halfSize;
                    const tr = (currentPhaseShiftReal * real[off]) - (currentPhaseShiftImag * imag[off]);
                    const ti = (currentPhaseShiftReal * imag[off]) + (currentPhaseShiftImag * real[off]);
                    
                    real[off] = real[i] - tr;
                    imag[off] = imag[i] - ti;
                    real[i] += tr;
                    imag[i] += ti;
                }
                const tmpReal = currentPhaseShiftReal;
                currentPhaseShiftReal = (tmpReal * phaseShiftStepReal) - (currentPhaseShiftImag * phaseShiftStepImag);
                currentPhaseShiftImag = (tmpReal * phaseShiftStepImag) + (currentPhaseShiftImag * phaseShiftStepReal);
            }
            halfSize = halfSize << 1;
        }
        
        for (let i = 0; i < n / 2; i++) {
            this.spectrum[i] = 2 * Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
        }
    }
}

async function processFFT(file, songId) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // Proper stereo/mono mixdown logic
        let channelData;
        if (audioBuffer.numberOfChannels === 1) {
            channelData = audioBuffer.getChannelData(0);
        } else {
            channelData = new Float32Array(audioBuffer.length);
            const numChannels = audioBuffer.numberOfChannels;
            for (let c = 0; c < numChannels; c++) {
                const chan = audioBuffer.getChannelData(c);
                for (let i = 0; i < audioBuffer.length; i++) {
                    channelData[i] += chan[i] / numChannels;
                }
            }
        }
        
        const sampleRate = audioBuffer.sampleRate;
        const frameSize = Math.floor(sampleRate / 20); // 20 fps
        const fftSize = 4096;
        
        const numFrames = Math.floor(channelData.length / frameSize);
        const outputFrames = [];
        const fft = new FFT(fftSize, sampleRate);
        
        const windowFunc = new Float32Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            windowFunc[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
        }
        
        let currentMax = [0, 0, 0, 0];
        let localMaxes = [];
        let rawFrames = [];
        let buffer = new Float32Array(fftSize);

        for (let i = 0; i < numFrames; i++) {
            const start = i * frameSize;
            
            for (let j = 0; j < fftSize; j++) {
                if (start + j < channelData.length) {
                    buffer[j] = channelData[start + j] * windowFunc[j];
                } else {
                    buffer[j] = 0;
                }
            }
            
            fft.forward(buffer);
            let spectrum = fft.spectrum;
            
            let bass = 0, mid = 0, treb = 0, vol = 0;
            for (let j = 0; j < spectrum.length; j++) {
                let freq = (j * sampleRate) / fftSize;
                let mag = spectrum[j];
                if (freq >= 20 && freq <= 250) bass += mag;
                else if (freq > 250 && freq <= 4000) mid += mag;
                else if (freq > 4000 && freq <= 16000) treb += mag;
            }
            
            let sumSq = 0;
            for (let j = 0; j < frameSize; j++) {
                if (start + j < channelData.length) {
                    let s = channelData[start + j];
                    sumSq += s * s;
                }
            }
            vol = Math.sqrt(sumSq / frameSize);
            
            rawFrames.push([bass, mid, treb, vol]);
            
            // Yield every 500 frames to keep UI responsive
            if (i % 500 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }
        
        let globalMax = [0,0,0,0];
        for (let f of rawFrames) {
            for(let i=0; i<4; i++) if (f[i] > globalMax[i]) globalMax[i] = f[i];
        }
        for(let i=0; i<4; i++) if (globalMax[i] === 0) globalMax[i] = 1.0;
        
        const decayRate = 0.96;
        for (let i = 0; i < numFrames; i++) {
            for(let j=0; j<4; j++) {
                currentMax[j] *= decayRate;
                if (rawFrames[i][j] > currentMax[j]) currentMax[j] = rawFrames[i][j];
            }
            localMaxes.push([...currentMax]);
        }
        
        const noiseFloor = globalMax.map(v => v * 0.15);
        for (let i = 0; i < numFrames; i++) {
            let norm = [0,0,0,0];
            for(let j=0; j<4; j++) {
                let denominator = Math.max(localMaxes[i][j], noiseFloor[j]);
                norm[j] = rawFrames[i][j] / denominator;
            }
            
            norm[0] = Math.pow(norm[0], 3.0);
            norm[1] = Math.pow(norm[1], 3.0);
            norm[2] = Math.pow(norm[2], 3.0);
            norm[3] = Math.pow(norm[3], 2.0);
            outputFrames.push(norm);
        }
        
        const alpha = 0.45;
        let smoothed = [];
        let prev = [0,0,0,0];
        for (let i = 0; i < numFrames; i++) {
            let s = [0,0,0,0];
            for(let j=0; j<4; j++) {
                s[j] = alpha * outputFrames[i][j] + (1 - alpha) * prev[j];
                s[j] = Math.round(s[j] * 1000) / 1000;
                prev[j] = s[j];
            }
            smoothed.push(s);
        }
        
        return {
            songId: songId,
            totalTicks: numFrames,
            frames: smoothed
        };
    } finally {
        await audioCtx.close();
    }
}
