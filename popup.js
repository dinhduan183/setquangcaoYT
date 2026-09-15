const $ = (id) => document.getElementById(id);

// "1:02:03" | "02:03" -> giây
function toSec(str) {
  const p = str.split(':').map(Number);
  return p.reduce((acc, n) => acc * 60 + n, 0);
}

function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function fmtShort(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseTracklist(text) {
  const tracks = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/(\d{1,2}:)?\d{1,2}:\d{2}/);
    if (!m) continue;
    tracks.push({ sec: toSec(m[0]), title: line.replace(m[0], '').trim() });
  }
  tracks.sort((a, b) => a.sec - b.sec);
  return tracks;
}

// "7:00" -> 420, "7" -> 420 (phút)
function parseUnit(str) {
  str = str.trim();
  if (!str) return 0;
  return str.includes(':') ? toSec(str) : Math.round(parseFloat(str) * 60);
}

// Mốc chèn = thời điểm bắt đầu bài n+1 = hết bài n
function boundaries(tracks) {
  return tracks
    .map((t, i) => ({ sec: t.sec, endOf: i, title: tracks[i - 1]?.title }))
    .filter((b) => b.endOf >= 1 && b.sec > 0);
}

// Tiêu chuẩn: mốc unit/2 (~hết bài 1), rồi cứ mỗi unit: 7:00, 14:00, 21:00, 28:00...
// Mỗi mốc lấy điểm hết bài gần nhất; từ quảng cáo thứ 3 phải cách điểm trước ≥ unit/2.
function standardPoints(bounds, unit) {
  if (!bounds.length || unit <= 0) return [];
  const lastBound = bounds[bounds.length - 1].sec;
  const out = [];
  let last = 0;
  for (let k = 0; ; k++) {
    const target = k === 0 ? unit / 2 : k * unit;
    if (target > lastBound + unit / 2) break;
    if (target <= last) continue;
    const minGap = out.length >= 2 ? unit / 2 : 0;
    const cands = bounds.filter((b) => b.sec > last && b.sec - last >= minGap);
    if (!cands.length) break;
    const best = cands.reduce((a, b) => (Math.abs(b.sec - target) < Math.abs(a.sec - target) ? b : a));
    out.push(best);
    last = best.sec;
  }
  return out;
}

function computePoints() {
  const tracks = parseTracklist($('tracklist').value);
  const bounds = boundaries(tracks);
  const mode = document.querySelector('input[name=mode]:checked').value;
  const points =
    mode === 'all' ? bounds
    : mode === 'every2' ? bounds.filter((b) => b.endOf === 1 || b.endOf % 2 === 0) // hết bài 1, 2, 4, 6, 8...
    : standardPoints(bounds, parseUnit($('unit').value));
  return { tracks, points, mode };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Trạng thái chạy nhận từ content script: { running, finished, points, results[], note, noteKind }
let runState = null;
let tabId = null;
let rowEls = [];

function render() {
  const { tracks, points, mode } = computePoints();
  const unit = parseUnit($('unit').value);

  $('trackCount').textContent = tracks.length ? `${tracks.length} bài` : '';
  $('stdLabel').textContent = `Bội số ${unit > 0 ? fmtShort(unit) : '…'}`;
  $('halfUnit').textContent = unit > 0 ? fmtShort(unit / 2) : '…';
  document.querySelectorAll('.hint').forEach((h) => (h.hidden = h.dataset.mode !== mode));

  const list = $('preview');
  list.replaceChildren();
  if (!points.length) {
    list.append(el('div', 'empty', tracks.length ? 'Không có mốc nào phù hợp.' : 'Dán tracklist để xem trước các mốc.'));
  }
  let prev = 0;
  rowEls = points.map((p, i) => {
    const song = el('span', 'song');
    song.append(el('b', null, `Hết bài ${p.endOf}`), (p.title || '').replace(/^\d+\.\s*/, ''));
    const row = el('div', 'row');
    row.append(el('span', 'i', i + 1), el('span', 't', fmt(p.sec)), song, el('span', 'gap', `+${fmtShort(p.sec - prev)}`));
    list.append(row);
    prev = p.sec;
    return row;
  });

  applyState();
  chrome.storage.local.set({ tracklist: $('tracklist').value, mode, unit: $('unit').value });
}

const ICON = { ok: '✓', exists: '–', fail: '✕', running: '' };
const TITLE = { ok: 'Đã chèn', exists: 'Đã có sẵn', fail: 'Không chèn được', running: 'Đang chèn…' };

// Tô trạng thái chạy lên danh sách xem trước (chỉ khi đúng là danh sách đang chạy)
function applyState() {
  const { points } = computePoints();
  const s = runState;
  const clearing = s?.task === 'clear';
  const match = !!s && !clearing && s.points.length === points.length && s.points.every((sec, i) => sec === points[i].sec);
  const running = !!s?.running;

  rowEls.forEach((row, i) => {
    const r = match ? s.results[i] : null;
    row.className = 'row' + (r ? ' ' + r : '');
    row.title = r ? TITLE[r] : '';
    row.firstChild.textContent = r ? ICON[r] : i + 1;
    if (r === 'running') row.scrollIntoView({ block: 'nearest' });
  });

  const bar = $('bar');
  bar.hidden = !match;
  if (match) {
    const n = points.length;
    const count = (k) => s.results.filter((r) => r === k).length;
    const done = count('ok') + count('exists') + count('fail');
    bar.firstChild.style.width = `${(done / n) * 100}%`;
    bar.className = 'bar' + (running ? '' : count('fail') || s.noteKind === 'err' ? ' fail' : ' done');
    $('summary').innerHTML = running
      ? `Đang chèn <b>${Math.min(done + 1, n)}/${n}</b>`
      : `<b>${count('ok')}</b> đã chèn · ${count('exists')} có sẵn · ${count('fail')} lỗi`;
    setStatus(s.note, s.noteKind);
  } else {
    $('summary').innerHTML = points.length ? `<b>${points.length}</b> vị trí quảng cáo` : '';
    if (clearing) setStatus(s.note, s.noteKind);
  }

  // Khoá ô nhập khi đang chạy
  document.querySelectorAll('textarea, input').forEach((e) => (e.disabled = running));
  $('run').disabled = running || !points.length;
  $('run').textContent = running && !clearing ? 'Đang chèn…' : 'Chèn vào YouTube Studio';
  $('clear').disabled = running;
  $('clear').textContent = running && clearing ? 'Đang xoá…' : 'Xoá hết';
  $('clear').classList.remove('confirm');
  $('stop').disabled = !running;
}

function setStatus(msg, kind) {
  $('status').textContent = msg || '';
  $('status').className = kind === 'err' || kind === 'ok' ? kind : '';
}

async function send(msg) {
  if (!tabId) throw new Error('Tab hiện tại không phải YouTube Studio.');
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    throw new Error('Chưa kết nối được với trang. Hãy tải lại (F5) trang YouTube Studio rồi thử lại.');
  }
}

$('run').addEventListener('click', async () => {
  const { points } = computePoints();
  if (!points.length) return setStatus('Không có mốc nào để chèn.', 'err');
  try {
    const res = await send({ type: 'run', points: points.map((p) => p.sec) });
    if (res && res.ok === false) setStatus(res.error, 'err');
  } catch (e) {
    setStatus(e.message, 'err');
  }
});

// Bấm 2 lần để xác nhận xoá
let clearTimer;
$('clear').addEventListener('click', async () => {
  const btn = $('clear');
  if (!btn.classList.contains('confirm')) {
    btn.classList.add('confirm');
    btn.textContent = 'Bấm lần nữa';
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = 'Xoá hết'; }, 3000);
    return;
  }
  clearTimeout(clearTimer);
  btn.classList.remove('confirm');
  btn.textContent = 'Xoá hết';
  try {
    const res = await send({ type: 'clear' });
    if (res && res.ok === false) setStatus(res.error, 'err');
  } catch (e) {
    setStatus(e.message, 'err');
  }
});

$('stop').addEventListener('click', async () => {
  try {
    await send({ type: 'stop' });
  } catch (e) {
    setStatus(e.message, 'err');
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'state' && sender.tab?.id === tabId) {
    runState = msg.state;
    applyState();
  }
});

$('tracklist').addEventListener('input', render);
$('unit').addEventListener('input', render);
document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', render));

chrome.storage.local.get(['tracklist', 'mode', 'unit'], async (s) => {
  if (s.tracklist) $('tracklist').value = s.tracklist;
  if (s.unit) $('unit').value = s.unit;
  if (s.mode) document.querySelector(`input[name=mode][value=${s.mode}]`).checked = true;
  render();

  // Lấy lại trạng thái đang chạy / lần chạy trước (khi mở lại popup)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://studio.youtube.com/')) return;
  tabId = tab.id;
  try {
    runState = await chrome.tabs.sendMessage(tabId, { type: 'getState' });
    applyState();
  } catch {}
});
