const env = import.meta.env || {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

async function fetchSectors() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/guesstimate?select=questions`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase request failed with status ${response.status}: ${errorBody}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      'Supabase returned no rows. Check that the guesstimate table has data and that its SELECT policy allows the anon key.'
    );
  }

  const sectors = rows
    .map((row, index) => ({
      number: index + 1,
      code: String(index + 1).padStart(2, '0'),
      label: String(index + 1),
      title: typeof row.questions === 'string' ? row.questions.trim() : '',
      category: 'Guesstimate',
      difficulty: 'Medium'
    }))
    .filter((sector) => sector.title);

  if (sectors.length === 0) {
    throw new Error(
      'Supabase returned rows, but their questions values are empty or not strings. Check the questions column name and values.'
    );
  }

  return sectors;
}

const SECTORS = await fetchSectors();

// --- Anti-Repeat Shuffle Bag Pool Algorithm ---
let poolIndices = [];
function refillAndShufflePool() {
  poolIndices = Array.from({ length: SECTORS.length }, (_, i) => i);
  for (let i = poolIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [poolIndices[i], poolIndices[j]] = [poolIndices[j], poolIndices[i]];
  }
}

function getNextQuestionIndex() {
  if (poolIndices.length === 0) {
    refillAndShufflePool();
    if (poolIndices[0] === selectedSectorIndex && poolIndices.length > 1) {
      const swapIdx = Math.floor(Math.random() * (poolIndices.length - 1)) + 1;
      [poolIndices[0], poolIndices[swapIdx]] = [poolIndices[swapIdx], poolIndices[0]];
    }
  }
  return poolIndices.shift();
}
refillAndShufflePool();

// --- Audio Synthesis for mechanical clicks ---
let audioCtx = null;
let soundEnabled = true;

function playTickSound() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.035);
    gain.gain.setValueAtTime(0.09, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.035);
  } catch (e) {}
}

function playWinSound() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.09);
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.14, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}

const soundToggleBtn = document.getElementById('sound-toggle-btn');
const soundIcon = document.getElementById('sound-icon');
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundIcon.textContent = soundEnabled ? 'volume_up' : 'volume_off';
  soundToggleBtn.classList.toggle('text-[#fce5b8]', soundEnabled);
  soundToggleBtn.classList.toggle('text-[#ffb4ab]', !soundEnabled);
});

// --- Canvas Wheel Setup (High Resolution 720x720 Canvas) ---
const canvas = document.getElementById('wheel-canvas');
const ctx = canvas.getContext('2d');
const size = canvas.width;
const center = size / 2;
const radius = center - 14;
const numSectors = SECTORS.length;
const arc = (2 * Math.PI) / numSectors;

const pointerAngle = 0;
let currentAngle = 0;
let isSpinning = false;
let selectedSectorIndex = 0;
let lastTickSector = -1;
const sessionHistory = [];

const sectorColors = [
  { bg: '#211918', text: '#fcf5e8', border: '#b89347', tag: '#e02424' },
  { bg: '#2d2220', text: '#ffd659', border: '#b89347', tag: '#ffd659' },
  { bg: '#1c1514', text: '#fcf5e8', border: '#b89347', tag: '#e02424' },
  { bg: '#332724', text: '#ffd659', border: '#b89347', tag: '#ffd659' },
  { bg: '#211918', text: '#fcf5e8', border: '#b89347', tag: '#e02424' },
  { bg: '#2d2220', text: '#ffd659', border: '#b89347', tag: '#ffd659' },
  { bg: '#1c1514', text: '#fcf5e8', border: '#b89347', tag: '#e02424' },
  { bg: '#332724', text: '#ffd659', border: '#b89347', tag: '#ffd659' }
];

function drawWheel(angle) {
  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < numSectors; i++) {
    const sectorAngle = angle + (i * arc);
    const palette = sectorColors[i % sectorColors.length];
    const isHighlighted = (i === selectedSectorIndex && !isSpinning);

    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, sectorAngle, sectorAngle + arc);
    ctx.closePath();
    ctx.fillStyle = isHighlighted ? '#422f2b' : palette.bg;
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(sectorAngle + (arc / 2));
    ctx.beginPath();
    ctx.arc(radius - 22, 0, 5, 0, 2 * Math.PI);
    ctx.fillStyle = isHighlighted ? '#ffb4aa' : palette.tag;
    ctx.fill();
    ctx.strokeStyle = '#ffd659';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 38px "Newsreader", serif';
    ctx.fillStyle = isHighlighted ? '#ffe088' : palette.text;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(String(SECTORS[i].number), radius - 95, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = '#ffd659';
  ctx.lineWidth = 3.5;
  ctx.stroke();
}

drawWheel(currentAngle);

// --- Modal Elements ---
const resultModal = document.getElementById('result-modal');
const resultCard = document.getElementById('result-card');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalDismissBtn = document.getElementById('modal-dismiss-btn');
const modalCaseBadge = document.getElementById('modal-case-badge');
const modalCategory = document.getElementById('modal-category');
const modalDifficulty = document.getElementById('modal-difficulty');
const modalCode = document.getElementById('modal-code');
const modalSubtitle = document.getElementById('modal-subtitle');
const modalTitle = document.getElementById('modal-title');
const historyTrail = document.getElementById('history-trail');

function updateHistoryHUD(caseCode) {
  if (sessionHistory.length === 0) {
    historyTrail.innerHTML = '';
  }
  sessionHistory.unshift(caseCode);
  if (sessionHistory.length > 4) sessionHistory.pop();

  historyTrail.innerHTML = sessionHistory.map((code, index) => {
    const isLatest = index === 0;
    return `<span class="px-2 py-0.5 rounded-xs font-label-sm text-[11px] font-bold transition-all ${
      isLatest ? 'bg-[#c51616] text-[#ffd7d2]' : 'bg-[#3a3332] text-[#d7c4a7]'
    }">${code}</span>`;
  }).join('');
}

function openModal(sector, index) {
  const caseLabel = `CASE ${sector.code}`;
  modalCaseBadge.textContent = caseLabel;
  modalCategory.textContent = sector.category;
  modalDifficulty.textContent = sector.difficulty;
  modalCode.textContent = `SEC-${sector.code}`;
  modalSubtitle.textContent = `Investigative Hypothesis // ${caseLabel}`;
  modalTitle.textContent = sector.title;

  resultModal.classList.remove('opacity-0', 'pointer-events-none');
  resultModal.classList.add('opacity-100', 'pointer-events-auto');
  resultCard.classList.remove('scale-95');
  resultCard.classList.add('scale-100');
  updateHistoryHUD(sector.code);
}

function closeModal() {
  resultModal.classList.add('opacity-0', 'pointer-events-none');
  resultModal.classList.remove('opacity-100', 'pointer-events-auto');
  resultCard.classList.add('scale-95');
  resultCard.classList.remove('scale-100');
}

modalCloseBtn.addEventListener('click', closeModal);
modalDismissBtn.addEventListener('click', closeModal);
resultModal.addEventListener('click', (e) => {
  if (e.target === resultModal) closeModal();
});

function getIndexAtPointer(angle) {
  let rel = (pointerAngle - angle) % (2 * Math.PI);
  if (rel < 0) rel += 2 * Math.PI;
  return Math.floor(rel / arc) % numSectors;
}

// --- Spinning Execution with Dynamic Varied Spin Time & Shuffle Bag Selection ---
function spinWheel() {
  if (isSpinning) return;
  closeModal();
  isSpinning = true;

  const fabBtn = document.getElementById('fab-spin-trigger');
  const fabLabel = document.getElementById('fab-label');
  const fabIcon = document.getElementById('fab-icon');

  fabBtn.disabled = true;
  fabBtn.classList.add('opacity-75', 'cursor-not-allowed');
  fabIcon.classList.add('animate-spin');
  fabLabel.textContent = 'DEDUCING...';

  const targetIndex = getNextQuestionIndex();
  const duration = 3800 + Math.random() * 2400;
  const fullRotations = Math.floor(6 + Math.random() * 7);
  const easePower = 3.6 + Math.random() * 1.6;
  const jitter = (Math.random() - 0.5) * (arc * 0.3);
  const targetOffsetWithinSector = (arc / 2) + jitter;
  const targetSectorMidAngle = (targetIndex * arc) + targetOffsetWithinSector;
  const currentNormalized = ((currentAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const targetRemainder = ((pointerAngle - targetSectorMidAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

  let deltaAngle = targetRemainder - currentNormalized;
  while (deltaAngle < 0) deltaAngle += 2 * Math.PI;
  deltaAngle += fullRotations * 2 * Math.PI;

  const startAngle = currentAngle;
  const startTime = performance.now();

  function animateSpin(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, easePower);
    currentAngle = startAngle + (deltaAngle * easeOut);
    const activeIndex = getIndexAtPointer(currentAngle);

    if (activeIndex !== lastTickSector) {
      playTickSound();
      lastTickSector = activeIndex;
    }

    drawWheel(currentAngle);

    if (progress < 1) {
      requestAnimationFrame(animateSpin);
    } else {
      isSpinning = false;
      selectedSectorIndex = targetIndex;
      drawWheel(currentAngle);
      playWinSound();
      fabBtn.disabled = false;
      fabBtn.classList.remove('opacity-75', 'cursor-not-allowed');
      fabIcon.classList.remove('animate-spin');
      fabLabel.textContent = 'SPIN WHEEL';

      setTimeout(() => {
        openModal(SECTORS[targetIndex], targetIndex);
      }, 350);
    }
  }

  requestAnimationFrame(animateSpin);
}

// --- Event Listeners ---
document.getElementById('fab-spin-trigger').addEventListener('click', spinWheel);
document.getElementById('center-hub').addEventListener('click', spinWheel);
canvas.addEventListener('click', spinWheel);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    spinWheel();
  } else if (e.code === 'Escape') {
    closeModal();
  }
});
