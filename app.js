const { FFmpeg } = FFmpegWASM;
const { fetchFile, toBlobURL } = FFmpegUtil;
const ffmpeg = new FFmpeg();
ffmpeg.on('log', ({ message }) => { console.log(message); });

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const songInfo = document.getElementById('songInfo');
const generateBtn = document.getElementById('generateBtn');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const logText = document.getElementById('logText');

let currentFile = null;

// UI Interactions
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-blue-500', 'bg-gray-700');
});
dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-blue-500', 'bg-gray-700');
});
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-500', 'bg-gray-700');
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (!file.name.endsWith('.mp3')) {
        alert("Please select an MP3 file.");
        return;
    }
    currentFile = file;
    document.getElementById('dropzoneText').textContent = file.name;
    songInfo.classList.remove('hidden');

    // Default ID
    let baseName = file.name.replace('.mp3', '').toLowerCase().replace(/[^a-z0-9]/g, '_');
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
    const songId = document.getElementById('idInput').value.trim();
    if (!songId) return alert("Song ID is required");

    songInfo.classList.add('hidden');
    dropzone.classList.add('hidden');
    progressSection.classList.remove('hidden');

    try {
        statusText.textContent = "Loading FFmpeg...";
        if (!ffmpeg.loaded) {
            const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
            const ffmpegURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd';
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                workerURL: await toBlobURL(`${ffmpegURL}/814.ffmpeg.js`, 'text/javascript')
            });
        }

        statusText.textContent = "Converting to OGG (This might take a minute)...";
        progressBar.style.width = "20%";
        await ffmpeg.writeFile('input.mp3', await fetchFile(currentFile));
        await ffmpeg.exec(['-i', 'input.mp3', '-c:a', 'libvorbis', '-q:a', '4', 'output.ogg']);
        const oggData = await ffmpeg.readFile('output.ogg');

        statusText.textContent = "Analyzing Audio Frequencies (FFT)...";
        progressBar.style.width = "50%";
        const fftJson = await processFFT(currentFile, songId);

        statusText.textContent = "Packaging .mcdisc...";
        progressBar.style.width = "90%";
        
        const zip = new JSZip();
        zip.file(songId + ".ogg", oggData.buffer);
        zip.file(songId + ".json", JSON.stringify(fftJson));
        
        const meta = {
            id: songId,
            title: document.getElementById('titleInput').value || songId,
            artist: document.getElementById('artistInput').value || "Unknown",
            version: 1
        };
        zip.file("meta.json", JSON.stringify(meta));

        const content = await zip.generateAsync({ type: "blob" });
        
        // Download
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = songId + ".mcdisc";
        a.click();
        URL.revokeObjectURL(url);

        statusText.textContent = "Done! You can drop the .mcdisc into your game folder.";
        statusText.classList.replace('text-yellow-400', 'text-green-400');
        progressBar.style.width = "100%";
        progressBar.classList.replace('bg-blue-500', 'bg-green-500');
        
    } catch (e) {
        console.error(e);
        statusText.textContent = "Error: " + e.message;
        statusText.classList.replace('text-yellow-400', 'text-red-500');
    }
});

async function processFFT(file, songId) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Convert to Mono
    const channelData = audioBuffer.getChannelData(0); 
    const sampleRate = audioBuffer.sampleRate; // usually 44100
    
    // Target 20 frames per second (50ms per frame)
    const frameSize = Math.floor(sampleRate / 20); // 2205
    const fftSize = 4096; // next power of 2 for dsp.js
    
    const numFrames = Math.floor(channelData.length / frameSize);
    const outputFrames = [];
    
    const fft = new FFT(fftSize, sampleRate);
    
    // Hanning window function
    const windowFunc = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
        windowFunc[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }
    
    // AGC variables
    let currentMax = [0, 0, 0, 0];
    let localMaxes = [];
    let rawFrames = [];

    for (let i = 0; i < numFrames; i++) {
        const start = i * frameSize;
        let buffer = new Float32Array(fftSize);
        
        // Copy data and apply window
        for (let j = 0; j < fftSize; j++) {
            if (start + j < channelData.length) {
                buffer[j] = channelData[start + j] * windowFunc[j];
            }
        }
        
        fft.forward(buffer);
        let spectrum = fft.spectrum;
        
        // Sum frequency bands
        let bass = 0, mid = 0, treb = 0, vol = 0;
        
        for (let j = 0; j < spectrum.length; j++) {
            let freq = (j * sampleRate) / fftSize;
            let mag = spectrum[j];
            
            if (freq >= 20 && freq <= 250) bass += mag;
            else if (freq > 250 && freq <= 4000) mid += mag;
            else if (freq > 4000 && freq <= 16000) treb += mag;
        }
        
        // Vol is RMS of the time-domain frame
        let sumSq = 0;
        for (let j = 0; j < frameSize; j++) {
            if (start + j < channelData.length) {
                sumSq += channelData[start + j] * channelData[start + j];
            }
        }
        vol = Math.sqrt(sumSq / frameSize);
        
        let frame = [bass, mid, treb, vol];
        rawFrames.push(frame);
    }
    
    // AGC & Dynamic Shaping (Ported from Python)
    let globalMax = [0,0,0,0];
    for (let f of rawFrames) {
        for(let i=0; i<4; i++) if (f[i] > globalMax[i]) globalMax[i] = f[i];
    }
    for(let i=0; i<4; i++) if (globalMax[i] === 0) globalMax[i] = 1.0;
    
    // Envelope follower
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
        
        // Exponential shaping
        norm[0] = Math.pow(norm[0], 3.0);
        norm[1] = Math.pow(norm[1], 3.0);
        norm[2] = Math.pow(norm[2], 3.0);
        norm[3] = Math.pow(norm[3], 2.0);
        
        outputFrames.push(norm);
    }
    
    // EMA smoothing
    const alpha = 0.45;
    let smoothed = [];
    let prev = [0,0,0,0];
    
    for (let i = 0; i < numFrames; i++) {
        let s = [0,0,0,0];
        for(let j=0; j<4; j++) {
            s[j] = alpha * outputFrames[i][j] + (1 - alpha) * prev[j];
            s[j] = Math.round(s[j] * 1000) / 1000; // 3 decimal places
            prev[j] = s[j];
        }
        smoothed.push(s);
    }
    
    return {
        songId: songId,
        totalTicks: numFrames,
        frames: smoothed
    };
}
