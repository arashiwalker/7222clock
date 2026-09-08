const canvas = document.getElementById('clockCanvas');
const ctx = canvas.getContext('2d');
const toggleSoundBtn = document.getElementById('toggleSound');
if (!ctx) {
    console.error('MirthaNode: Failed to get 2D context for canvas');
}

let audioCtx;
let isSoundOn = true;
let singingBowlBuffer = null;

async function loadSound(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`MirthaNode: Failed to load audio: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        return audioBuffer;
    } catch (error) {
        console.error('MirthaNode: Error loading sound:', error);
        return null;
    }
}

function initializeAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        console.log('MirthaNode: AudioContext initialized');
        loadSound('sounds/singing_bowl.wav').then(buffer => {
            singingBowlBuffer = buffer;
            console.log('MirthaNode: Singing bowl sound loaded successfully');
        }).catch(err => {
            console.error('MirthaNode: Failed to load singing_bowl.wav:', err);
        });
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            console.log('MirthaNode: AudioContext resumed');
            if (isSoundOn) {
                playMirthaSound();
            }
        }).catch(err => console.error('MirthaNode: Failed to resume AudioContext:', err));
    }
}

function setupAudioContextResume() {
    const events = ['touchstart', 'click'];
    events.forEach(event => {
        document.addEventListener(event, function handler() {
            initializeAudioContext();
            events.forEach(ev => document.removeEventListener(ev, handler));
        }, { once: true });
    });
}

initializeAudioContext();
setupAudioContextResume();

function playMirthaSound() {
    if (!isSoundOn) return;
    try {
        if (!audioCtx || audioCtx.state === 'suspended') {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (singingBowlBuffer) {
            const source = audioCtx.createBufferSource();
            source.buffer = singingBowlBuffer;
            source.connect(audioCtx.destination);
            source.start(audioCtx.currentTime);
            console.log('MirthaNode: Mirtha sound played: singing_bowl.wav');
        } else {
            console.warn('MirthaNode: Singing bowl not loaded, falling back to synthesized sound');
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(277.18, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.35);
            gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.5);
            console.log('MirthaNode: Mirtha sound played: Fallback Db note at 277.18 Hz');
        }
    } catch (error) {
        console.error('MirthaNode: Audio error in playMirthaSound:', error);
    }
}

function playChime(note, duration = 0.1, isTriad = false) {
    if (!isSoundOn) return;
    try {
        if (!audioCtx || audioCtx.state === 'suspended') {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (isTriad) {
            const notes = [277.18, 349.23, 415.30];
            notes.forEach((freq, index) => {
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + index * 0.1);
                gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime + index * 0.1);
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.start(audioCtx.currentTime + index * 0.1);
                oscillator.stop(audioCtx.currentTime + index * 0.1 + duration);
            });
            console.log('MirthaNode: Huor triad played: D-flat major (Db-F-Ab)');
        } else {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(note, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + duration);
            console.log(`MirthaNode: Minit chime played: ${note} Hz`);
        }
    } catch (error) {
        console.error('MirthaNode: Audio error in playChime:', error);
    }
}

function playHarmonySounds() {
    if (!isSoundOn) return;
    playMirthaSound();
    playChime(415.30);
    playChime(null, 0.3, true);
    console.log('MirthaNode: Harmony mode: Played all interval sounds together');
}

toggleSoundBtn.addEventListener('click', () => {
    isSoundOn = !isSoundOn;
    toggleSoundBtn.textContent = isSoundOn ? '🔊 Sound: On' : '🔇 Sound: Off';
    console.log('MirthaNode: Sound toggled:', isSoundOn);
    if (isSoundOn && audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            console.log('MirthaNode: AudioContext resumed after toggle');
        }).catch(err => console.error('MirthaNode: Failed to resume AudioContext:', err));
    }
});

let clockRadius, centerX, centerY;
function resizeCanvas() {
    canvas.width = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.9, 500);
    canvas.height = canvas.width;
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    clockRadius = canvas.width / 2.5;
    console.log('MirthaNode: Canvas resized:', canvas.width, canvas.height, 'Radius:', clockRadius);
}
resizeCanvas();
window.addEventListener('resize', () => {
    resizeCanvas();
    drawClock();
});

const totalMirthas = 22;
const totalMinits = 50;
const totalHuors = 24;

const secondsInterval = (1000 * 72) / 22;
const minutesInterval = secondsInterval * totalMirthas;
const huorsInterval = minutesInterval * totalMinits;

const startTime = new Date("2020-02-01T23:00:00").getTime();

let lastMirthaTick = -1;
let lastMinitTick = -1;
let lastHuorTick = -1;

let isHarmonyMode = false;
let harmonyMirthaCount = 0;
const mirthasPerMinit = 22;
let isFirstFrame = true;

let mirthaGlowOpacity = 0;
let minitGlowOpacity = 0;
let huorGlowOpacity = 0;

let mirthaDigitalGlowOpacity = 0;
let minitDigitalGlowOpacity = 0;
let huorDigitalGlowOpacity = 0;

function getLabel(currentTick, totalTicks) {
    return (currentTick + totalTicks - 2) % totalTicks + 1;
}

function drawClockFace() {
    console.log('MirthaNode: Drawing clock face');
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, clockRadius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.beginPath();
    ctx.arc(centerX, centerY, clockRadius, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, clockRadius + 5, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(0, 255, 0, ${mirthaGlowOpacity})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, (clockRadius * 2) / 3 + 5, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(128, 0, 128, ${minitGlowOpacity})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, clockRadius / 3 + 5, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(255, 0, 0, ${huorGlowOpacity})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, clockRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, (clockRadius * 2) / 3, 0, 2 * Math.PI);
    ctx.strokeStyle = '#800080';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, clockRadius / 3, 0, 2 * Math.PI);
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawTicks() {
    console.log('MirthaNode: Drawing ticks');
    for (let i = 0; i < totalMirthas; i++) {
        const angle = ((i + 1) * 2 * Math.PI) / totalMirthas - Math.PI / 2;
        const tickXStart = centerX + clockRadius * Math.cos(angle);
        const tickYStart = centerY + clockRadius * Math.sin(angle);
        const tickXEnd = centerX + (clockRadius - 15) * Math.cos(angle);
        const tickYEnd = centerY + (clockRadius - 15) * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(tickXStart, tickYStart);
        ctx.lineTo(tickXEnd, tickYEnd);
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    for (let i = 0; i < totalMinits; i++) {
        const angle = ((i + 1) * 2 * Math.PI) / totalMinits - Math.PI / 2;
        const tickXStart = centerX + (clockRadius * 2 / 3) * Math.cos(angle);
        const tickYStart = centerY + (clockRadius * 2 / 3) * Math.sin(angle);
        const tickXEnd = centerX + (clockRadius * 2 / 3 - 10) * Math.cos(angle);
        const tickYEnd = centerY + (clockRadius * 2 / 3 - 10) * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(tickXStart, tickYStart);
        ctx.lineTo(tickXEnd, tickYEnd);
        ctx.strokeStyle = '#800080';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    for (let i = 0; i < totalHuors; i++) {
        const angle = ((i + 1) * 2 * Math.PI) / totalHuors - Math.PI / 2;
        const tickXStart = centerX + (clockRadius / 3) * Math.cos(angle);
        const tickYStart = centerY + (clockRadius / 3) * Math.sin(angle);
        const tickXEnd = centerX + (clockRadius / 3 - 8) * Math.cos(angle);
        const tickYEnd = centerY + (clockRadius / 3 - 8) * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(tickXStart, tickYStart);
        ctx.lineTo(tickXEnd, tickYEnd);
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawHand(rotation, length, color, lineWidth) {
    const radians = (rotation - 90) * (Math.PI / 180);
    const xEnd = centerX + length * Math.cos(radians);
    const yEnd = centerY + length * Math.sin(radians);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(xEnd, yEnd);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    return { xEnd, yEnd };
}

function drawLabel(label, x, y, color) {
    const fontSize = Math.max(12, canvas.width / 25);
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
}

function updateDigitalClock(mirthaTick, minitTick, huorTick, mirthaChanged, minitChanged, huorChanged, isHarmonyMode, elapsedTime) {
    const mirthaEl = document.getElementById('mirtha');
    const minitEl = document.getElementById('minit');
    const huorEl = document.getElementById('huor');

    // Ensure elements exist to prevent null reference errors
    if (!mirthaEl || !minitEl || !huorEl) {
        console.error('MirthaNode: Digital clock elements not found');
        return;
    }

    const mirthaLabel = getLabel(mirthaTick, totalMirthas).toString().padStart(2, '0');
    const minitLabel = getLabel(minitTick, totalMinits).toString().padStart(2, '0');
    const huorLabel = getLabel(huorTick, totalHuors).toString().padStart(2, '0');

    if (mirthaEl.textContent !== mirthaLabel) {
        mirthaEl.textContent = mirthaLabel;
        mirthaEl.classList.add('flip');
        mirthaDigitalGlowOpacity = 1; // Reset glow on change
    }
    if (minitEl.textContent !== minitLabel) {
        minitEl.textContent = minitLabel;
        minitEl.classList.add('flip');
        minitDigitalGlowOpacity = 1; // Reset glow on change
    }
    if (huorEl.textContent !== huorLabel) {
        huorEl.textContent = huorLabel;
        huorEl.classList.add('flip');
        huorDigitalGlowOpacity = 1; // Reset glow on change
    }

    // Calculate glow decay similar to analog
    const glowStep = (elapsedTime % secondsInterval) / secondsInterval;
    if (mirthaChanged) {
        mirthaDigitalGlowOpacity = 1;
    } else {
        mirthaDigitalGlowOpacity = Math.max(0, mirthaDigitalGlowOpacity - glowStep);
    }
    if (minitChanged) {
        minitDigitalGlowOpacity = 1;
    } else {
        minitDigitalGlowOpacity = Math.max(0, minitDigitalGlowOpacity - (1 / (secondsInterval / 16.666)));
    }
    if (huorChanged) {
        huorDigitalGlowOpacity = 1;
    } else {
        huorDigitalGlowOpacity = Math.max(0, huorDigitalGlowOpacity - (1 / (secondsInterval / 16.666)));
    }

    // Apply glow dynamically
    mirthaEl.style.textShadow = mirthaDigitalGlowOpacity > 0 ? `0 0 10px #00FF00, 0 0 ${20 * mirthaDigitalGlowOpacity}px #00FF00` : 'none';
    minitEl.style.textShadow = minitDigitalGlowOpacity > 0 ? `0 0 10px #800080, 0 0 ${20 * minitDigitalGlowOpacity}px #800080` : 'none';
    huorEl.style.textShadow = huorDigitalGlowOpacity > 0 ? `0 0 10px #FF0000, 0 0 ${20 * huorDigitalGlowOpacity}px #FF0000` : 'none';

    if (isHarmonyMode) {
        [mirthaEl, minitEl, huorEl].forEach(el => {
            el.classList.add('glow-harmony');
        });
    }
}

function drawClockHands() {
    console.log('MirthaNode: Drawing clock hands');
    const now = Date.now();
    const elapsedTime = now - startTime;

    const mirthaTick = Math.floor(elapsedTime / secondsInterval) % totalMirthas + 1;
    const minitTick = Math.floor(elapsedTime / minutesInterval) % totalMinits + 1;
    const huorTick = Math.floor(elapsedTime / huorsInterval) % totalHuors + 1;

    const mirthaChanged = mirthaTick !== lastMirthaTick;
    const minitChanged = minitTick !== lastMinitTick;
    const huorChanged = huorTick !== lastHuorTick;

    if (mirthaChanged) {
        if (!isFirstFrame && mirthaChanged && minitChanged && huorChanged && !isHarmonyMode) {
            isHarmonyMode = true;
            harmonyMirthaCount = 0;
            console.log('MirthaNode: Harmony mode started: All ticks changed simultaneously (Mirtha:', mirthaTick, 'Minit:', minitTick, 'Huor:', huorTick, ')');
        }
        if (isHarmonyMode) {
            playHarmonySounds();
            harmonyMirthaCount++;
            console.log(`MirthaNode: Harmony mode: Played sounds on Mirtha tick ${mirthaTick}, count: ${harmonyMirthaCount}`);
            if (harmonyMirthaCount >= mirthasPerMinit) {
                isHarmonyMode = false;
                harmonyMirthaCount = 0;
                console.log('MirthaNode: Harmony mode ended after 1 Minit (22 Mirthas)');
            }
        } else {
            playMirthaSound();
            console.log(`MirthaNode: Regular mode: Played Mirtha sound on tick ${mirthaTick}`);
        }
        lastMirthaTick = mirthaTick;
        mirthaGlowOpacity = 1;
        console.log('MirthaNode: Mirtha tick:', mirthaTick);
    } else {
        const glowStep = (elapsedTime % secondsInterval) / secondsInterval;
        mirthaGlowOpacity = 1 - glowStep;
        if (isHarmonyMode) {
            minitGlowOpacity = 1 - glowStep;
            huorGlowOpacity = 1 - glowStep;
        }
    }

    if (minitChanged && !isHarmonyMode) {
        playChime(415.30);
        console.log('MirthaNode: Minit sound triggered outside harmony mode');
        lastMinitTick = minitTick;
        minitGlowOpacity = 1;
        console.log('MirthaNode: Minit tick:', minitTick);
    } else if (!isHarmonyMode) {
        minitGlowOpacity = Math.max(0, minitGlowOpacity - (1 / (secondsInterval / 16.666)));
    }

    if (huorChanged && !isHarmonyMode) {
        playChime(null, 0.3, true);
        console.log('MirthaNode: Huor sound triggered outside harmony mode');
        lastHuorTick = huorTick;
        huorGlowOpacity = 1;
        console.log('MirthaNode: Huor tick:', huorTick);
    } else if (!isHarmonyMode) {
        huorGlowOpacity = Math.max(0, huorGlowOpacity - (1 / (secondsInterval / 16.666)));
    }

    if (isFirstFrame) {
        isFirstFrame = false;
        console.log('MirthaNode: First frame processed, skipping harmony mode check');
    }

    const mirthaFraction = (elapsedTime % secondsInterval) / secondsInterval;
    const minitFraction = (elapsedTime % minutesInterval) / minutesInterval;
    const huorFraction = (elapsedTime % huorsInterval) / huorsInterval;

    const mirthaRotation = ((mirthaTick - 1 + mirthaFraction) / totalMirthas) * 360;
    const minitRotation = ((minitTick - 1 + minitFraction) / totalMinits) * 360;
    const huorRotation = ((huorTick - 1 + huorFraction) / totalHuors) * 360;

    const huor = drawHand(huorRotation, clockRadius / 3, '#FF0000', 3);
    const minit = drawHand(minitRotation, (clockRadius * 2) / 3, '#800080', 3);
    const mirtha = drawHand(mirthaRotation, clockRadius, '#00FF00', 3);

    const huorLabel = getLabel(huorTick, totalHuors);
    const huorTextX = huor.xEnd + 15 * Math.cos((huorRotation - 90) * (Math.PI / 180));
    const huorTextY = huor.yEnd + 15 * Math.sin((huorRotation - 90) * (Math.PI / 180));
    drawLabel(huorLabel, huorTextX, huorTextY, '#FF0000');

    const minitLabel = getLabel(minitTick, totalMinits);
    const minitTextX = minit.xEnd + 15 * Math.cos((minitRotation - 90) * (Math.PI / 180));
    const minitTextY = minit.yEnd + 15 * Math.sin((minitRotation - 90) * (Math.PI / 180));
    drawLabel(minitLabel, minitTextX, minitTextY, '#800080');

    const mirthaLabel = getLabel(mirthaTick, totalMirthas);
    const mirthaTextX = mirtha.xEnd + 15 * Math.cos((mirthaRotation - 90) * (Math.PI / 180));
    const mirthaTextY = mirtha.yEnd + 15 * Math.sin((mirthaRotation - 90) * (Math.PI / 180));
    drawLabel(mirthaLabel, mirthaTextX, mirthaTextY, '#00FF00');

    updateDigitalClock(mirthaTick, minitTick, huorTick, mirthaChanged, minitChanged, huorChanged, isHarmonyMode, elapsedTime);
}

function drawClock() {
    if (!ctx) {
        console.error('MirthaNode: No context available');
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawClockFace();
    drawTicks();
    drawClockHands();
}

let isRunning = true;
canvas.addEventListener('click', () => {
    isRunning = !isRunning;
    console.log('MirthaNode:', isRunning ? 'Resuming animation' : 'Pausing animation');
    if (isRunning) animateClock();
});

function animateClock() {
    if (!isRunning) return;
    drawClock();
    requestAnimationFrame(animateClock);
}

try {
    console.log('MirthaNode: Initializing clock');
    drawClock();
    animateClock();
} catch (error) {
    console.error('MirthaNode: Error initializing clock:', error);
}