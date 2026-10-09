// 이미지 용량 줄이기: 모든 처리는 브라우저의 canvas로 합니다.

const fileInput = document.getElementById('fileInput');
const dropzone = document.querySelector('.dropzone');
const quality = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const maxWidth = document.getElementById('maxWidth');
const format = document.getElementById('format');
const resultList = document.getElementById('resultList');
const emptyText = document.getElementById('emptyText');
const downloadAll = document.getElementById('downloadAll');
const dropTitle = document.getElementById('dropTitle');
const dropHint = document.getElementById('dropHint');

// iOS Safari의 canvas 최대 픽셀 수(약 1,670만)를 넘지 않게 제한
const MAX_PIXELS = 16_000_000;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

// { file, el, blob, url, error }
let items = [];
// 설정이 바뀌면 증가시켜서 이전 압축 작업 결과를 버림
let runId = 0;

/* ---------- 압축 ---------- */

function getSettings() {
  const width = parseInt(maxWidth.value, 10);
  return {
    type: `image/${format.value}`,
    quality: Number(quality.value) / 100,
    maxWidth: width > 0 ? width : Infinity,
  };
}

async function compress(file, settings) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, settings.maxWidth / bitmap.width);
  const pixels = bitmap.width * bitmap.height * scale * scale;
  if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // JPG는 투명을 지원하지 않으므로 흰 배경을 깔아 검게 변하는 것을 막음
  if (settings.type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('변환 실패'))),
      settings.type,
      settings.quality,
    );
  });

  // 크기도 형식도 그대로인데 더 커졌다면 원본을 그대로 돌려줌
  const unchanged = scale === 1 && blob.type === file.type;
  if (unchanged && blob.size >= file.size) return file;
  return blob;
}

async function processAll() {
  const id = ++runId;
  const settings = getSettings();
  updateDownloadAll();

  // 휴대폰 메모리를 아끼려고 한 장씩 순서대로 처리
  for (const item of items) {
    if (id !== runId) return;
    if (item.blob) continue;
    try {
      const blob = await compress(item.file, settings);
      if (id !== runId || !items.includes(item)) return;
      setResult(item, blob);
    } catch {
      if (id !== runId) return;
      item.error = true;
      renderItem(item);
    }
    updateDownloadAll();
  }
}

/* ---------- 화면 ---------- */

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function outputName(file, blob) {
  const base = file.name.replace(/\.[^.]+$/, '');
  const ext = EXTENSIONS[blob.type] || 'img';
  return `${base}_압축.${ext}`;
}

function createItemElement() {
  const li = document.createElement('li');
  li.className = 'result-item';
  li.innerHTML = `
    <img class="thumb" alt="">
    <div class="result-info">
      <p class="file-name"></p>
      <p class="file-size"></p>
    </div>
    <a class="btn btn-ghost" aria-disabled="true">저장</a>
  `;
  return li;
}

function renderItem(item) {
  const { el, file, blob, url, error } = item;
  el.querySelector('.file-name').textContent = file.name;
  const sizeEl = el.querySelector('.file-size');
  const link = el.querySelector('a');
  const thumb = el.querySelector('.thumb');

  sizeEl.classList.toggle('is-error', !!error);

  if (error) {
    sizeEl.textContent = '이 파일은 변환할 수 없어요';
    link.setAttribute('aria-disabled', 'true');
    link.removeAttribute('href');
    return;
  }

  if (!blob) {
    sizeEl.textContent = `${formatSize(file.size)} · 줄이는 중…`;
    link.setAttribute('aria-disabled', 'true');
    link.removeAttribute('href');
    return;
  }

  const saved = Math.round((1 - blob.size / file.size) * 100);
  const badge = saved > 0
    ? `<span class="badge">-${saved}%</span>`
    : '<span class="badge is-neutral">원본 유지</span>';
  sizeEl.innerHTML = `
    <span class="before">${formatSize(file.size)}</span>
    <span class="arrow" aria-hidden="true">→</span>
    <span class="after">${formatSize(blob.size)}</span>
    ${badge}
  `;

  thumb.src = url;
  link.href = url;
  link.download = outputName(file, blob);
  link.removeAttribute('aria-disabled');
}

function setResult(item, blob) {
  if (item.url) URL.revokeObjectURL(item.url);
  item.blob = blob;
  item.url = URL.createObjectURL(blob);
  item.error = false;
  renderItem(item);
}

function resetResults() {
  for (const item of items) {
    if (item.url) URL.revokeObjectURL(item.url);
    item.blob = null;
    item.url = null;
    item.error = false;
    renderItem(item);
  }
}

function updateDownloadAll() {
  const ready = items.filter((i) => i.blob);
  downloadAll.disabled = ready.length === 0;
  emptyText.hidden = items.length > 0;
  updateDropzone();
}

// 업로드 영역에 현재 상태(올린 장수, 진행률, 총 절감량)를 표시
function updateDropzone() {
  const total = items.length;
  const done = items.filter((i) => i.blob || i.error);
  const working = done.length < total;

  dropzone.classList.toggle('is-working', total > 0 && working);
  dropzone.classList.toggle('is-done', total > 0 && !working);

  if (total === 0) {
    dropTitle.textContent = '이미지를 선택하세요';
    dropHint.textContent = '여기에 끌어다 놓거나 눌러서 고르세요 · JPG, PNG, WebP';
    return;
  }

  dropTitle.textContent = `사진 ${total}장을 올렸어요`;
  if (working) {
    dropHint.textContent = `줄이는 중… (${done.length}/${total})`;
    return;
  }

  const ok = items.filter((i) => i.blob);
  const before = ok.reduce((sum, i) => sum + i.file.size, 0);
  const after = ok.reduce((sum, i) => sum + i.blob.size, 0);
  const saved = before > 0 ? Math.round((1 - after / before) * 100) : 0;
  const failed = total - ok.length;
  dropHint.textContent =
    `완료! ${formatSize(before)} → ${formatSize(after)}` +
    (saved > 0 ? ` (-${saved}%)` : '') +
    (failed > 0 ? ` · ${failed}장 실패` : '');
}

// 결과 목록이 화면 아래에 가려져 있으면 보이도록 스크롤
function revealResults() {
  const rect = resultList.getBoundingClientRect();
  if (rect.top > window.innerHeight - 80) {
    resultList.closest('.results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function addFiles(fileList) {
  const images = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (images.length === 0) return;

  for (const file of images) {
    const item = { file, el: createItemElement(), blob: null, url: null, error: false };
    items.push(item);
    resultList.append(item.el);
    renderItem(item);
  }
  processAll();
  revealResults();
}

/* ---------- 이벤트 ---------- */

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = ''; // 같은 파일을 다시 골라도 change가 발생하도록
});

['dragenter', 'dragover'].forEach((type) => {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
});
['dragleave', 'drop'].forEach((type) => {
  dropzone.addEventListener(type, () => dropzone.classList.remove('is-dragover'));
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});

let settingsTimer;
function onSettingsChange() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    resetResults();
    processAll();
  }, 300);
}

quality.addEventListener('input', () => {
  qualityValue.textContent = `${quality.value}%`;
  onSettingsChange();
});
maxWidth.addEventListener('input', onSettingsChange);
format.addEventListener('change', onSettingsChange);

downloadAll.addEventListener('click', async () => {
  for (const item of items) {
    if (!item.blob) continue;
    item.el.querySelector('a').click();
    // 브라우저가 연속 다운로드를 막지 않도록 약간 간격을 둠
    await new Promise((r) => setTimeout(r, 300));
  }
});
