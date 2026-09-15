(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Selector thật của YouTube Studio (hộp thoại "Vùng quảng cáo trong video")
  const SEL = {
    openBtn: '#place-manually-button',
    navLink: 'ul#main-menu a[href]', // menu trái của trang video
    m10nStatus: 'ytcp-video-monetization .m10n-text', // ô "Bật" / "Đang tắt" ở trang Kiếm tiền
    panel: 'ytve-ad-breaks-editor-options-panel',
    insertBtn: '.options-header ytcp-button',
    autoCb: '.auto-midroll-checkbox #checkbox',
    row: '.ad-break-row',
    rowInput: 'ytve-framestamp-input input',
    deleteBtn: '.delete-button',
    playhead: 'ytve-toolbar ytcp-media-timestamp-input input',
  };
  const AUTO_ROW = /tự động|automatic/i; // "tự động"

  const visible = (el) => !!el && el.getClientRects().length > 0;
  const panel = () => [...document.querySelectorAll(SEL.panel)].find(visible) || null;
  const insertBtn = () => {
    const b = panel()?.querySelector(SEL.insertBtn);
    return b ? b.querySelector('button') || b : null;
  };

  // Ô thời gian của YT luôn có frame ở cuối: "0:08:26:19" (H:MM:SS:FF), video < 1 giờ là "03:14:00" (MM:SS:FF)
  function tsToSec(v) {
    const p = v.trim().split(':').map(Number);
    if (p.some(isNaN)) return NaN;
    p.pop(); // bỏ frame
    return p.reduce((acc, n) => acc * 60 + n, 0);
  }

  // giây -> "H:MM:SS:00" (định dạng ô thời gian của YT)
  function secToFrame(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:00`;
  }
  const secToTs = (sec) => secToFrame(sec).slice(0, -3);

  function rows() {
    const p = panel();
    if (!p) return [];
    return [...p.querySelectorAll(SEL.row)].map((row) => {
      const input = row.querySelector(SEL.rowInput);
      return { row, input, auto: AUTO_ROW.test(row.textContent.normalize('NFC')), sec: input ? tsToSec(input.value) : NaN };
    }).filter((r) => r.input);
  }

  function pressEnter(input) {
    const opt = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true, cancelable: true };
    for (const type of ['keydown', 'keypress', 'keyup']) input.dispatchEvent(new KeyboardEvent(type, opt));
  }

  // Đưa đầu phát (ô thời gian dưới timeline) tới mốc
  async function seek(sec) {
    const input = document.querySelector(SEL.playhead);
    if (!visible(input)) throw new Error('Không thấy ô thời gian của timeline.');
    const value = secToFrame(sec);
    input.focus();
    input.select();
    if (!document.execCommand('insertText', false, value) || input.value !== value) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    pressEnter(input);
    await sleep(400);
  }

  async function waitFor(fn, timeout = 5000, step = 150) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  // ---------- Trạng thái, gửi về popup ----------
  // results[i]: null | 'running' | 'ok' | 'exists' | 'fail'
  let state = null;
  function emit() {
    chrome.runtime.sendMessage({ type: 'state', state }).catch(() => {}); // popup đóng thì bỏ qua
  }
  function note(text, kind = 'info') {
    state.note = text;
    state.noteKind = kind;
    emit();
  }

  // ---------- Các bước ----------
  // Mở hộp thoại "Vùng quảng cáo trong video". Trả về null nếu mở được, ngược lại trả về lý do.
  async function ensureDialog() {
    if (visible(insertBtn())) return null;
    if (!/^\/video\//.test(location.pathname)) {
      return 'Hãy mở một video trong YouTube Studio (trang Chi tiết hoặc Kiếm tiền) rồi bấm lại.';
    }

    const openBtn = () => {
      const b = document.querySelector(SEL.openBtn);
      return visible(b) ? b : null;
    };
    const m10nReady = () =>
      location.pathname.includes('/monetization') && (openBtn() || visible(document.querySelector(SEL.m10nStatus)));

    if (!m10nReady()) {
      // Đang ở trang khác của video (vd. /edit) -> bấm mục "Kiếm tiền" ở menu trái (Studio chuyển trang không tải lại)
      const link = [...document.querySelectorAll(SEL.navLink)].find((a) => /\/video\/[^/]+\/monetization/.test(a.getAttribute('href')));
      if (!link) return 'Video này không có tab Kiếm tiền (kênh chưa bật kiếm tiền).';
      note('Đang chuyển sang tab Kiếm tiền…');
      link.click();
      if (!(await waitFor(m10nReady, 15000))) return 'Trang Kiếm tiền tải quá lâu. Hãy thử lại.';
    }

    const open = await waitFor(openBtn, 2500);
    if (!open) {
      const status = document.querySelector(SEL.m10nStatus)?.textContent.normalize('NFC') || '';
      if (/tắt|\boff\b/i.test(status)) {
        return 'Kiếm tiền của video đang tắt. Bật "Quảng cáo trên Trang xem và YouTube Premium" rồi Lưu, sau đó thử lại.';
      }
      return 'Không thấy nút "Xem lại vị trí đặt quảng cáo trong video". Hãy tick "Hiện quảng cáo trong video của tôi" (chỉ có ở video dài từ 8 phút).';
    }

    note('Đang mở hộp thoại vị trí quảng cáo…');
    (open.querySelector('button') || open).click();
    if (!(await waitFor(() => visible(insertBtn()), 10000))) {
      return 'Đã bấm mở nhưng hộp thoại vị trí quảng cáo không hiện. Hãy thử lại.';
    }
    return null;
  }

  async function disableAuto() {
    const cb = panel()?.querySelector(SEL.autoCb);
    if (!cb) return note('Không thấy ô "Vị trí quảng cáo tự động" — bỏ qua.', 'err');
    if (cb.getAttribute('aria-checked') !== 'true') return note('Vị trí quảng cáo tự động đã tắt sẵn.');
    cb.click();
    await waitFor(() => cb.getAttribute('aria-checked') === 'false' && !rows().some((r) => r.auto), 4000);
    if (cb.getAttribute('aria-checked') === 'true') return note('Không bỏ tick được "Vị trí quảng cáo tự động".', 'err');
    const left = rows().filter((r) => r.auto).length;
    if (left) note(`Đã tắt tự động nhưng vẫn còn ${left} vị trí tự động.`, 'err');
    else note('Đã tắt vị trí quảng cáo tự động.');
  }

  const near = (a, b) => Math.abs(a - b) <= 1;

  async function insertAt(sec) {
    const before = rows();
    if (before.some((r) => near(r.sec, sec))) return 'exists';

    await seek(sec);
    const btn = insertBtn();
    if (!btn) throw new Error('Mất nút "Chèn vị trí quảng cáo".');
    btn.click();
    const ok = await waitFor(() => rows().some((r) => near(r.sec, sec)), 4000);
    return ok ? 'ok' : 'fail';
  }

  let stopFlag = false;

  async function run(points) {
    stopFlag = false;
    state = { task: 'insert', running: true, finished: false, stopped: false, points, results: points.map(() => null), note: '', noteKind: 'info' };
    emit();
    try {
      const err = await ensureDialog();
      if (err) return note(err, 'err');
      await sleep(800);
      await disableAuto();

      for (let i = 0; i < points.length; i++) {
        if (stopFlag) { state.stopped = true; break; }
        state.results[i] = 'running';
        emit();
        state.results[i] = await insertAt(points[i]);
        emit();
      }

      // kiểm tra lại toàn bộ sau khi chèn xong
      const all = rows();
      state.results = state.results.map((r, i) => (r && r !== 'running' && !all.some((x) => near(x.sec, points[i])) ? 'fail' : r));
      const missing = points.filter((p, i) => state.results[i] === 'fail').map(secToTs);
      if (state.stopped) note('Đã dừng.', 'err');
      else if (missing.length) note(`Thiếu các mốc: ${missing.join(', ')}`, 'err');
      else note('Xong. Kiểm tra lại trong Studio rồi bấm "Tiếp tục" → "Lưu".', 'ok');
    } catch (e) {
      note('Lỗi: ' + e.message, 'err');
    } finally {
      state.results = state.results.map((r) => (r === 'running' ? null : r));
      state.running = false;
      state.finished = true;
      emit();
    }
  }

  // Xoá hết: tắt vị trí tự động rồi xoá từng vị trí thủ công
  async function clearAll() {
    stopFlag = false;
    state = { task: 'clear', running: true, finished: false, stopped: false, points: [], results: [], note: '', noteKind: 'info' };
    emit();
    try {
      const err = await ensureDialog();
      if (err) return note(err, 'err');
      await sleep(800);
      const total = rows().length;
      await disableAuto();
      let left = rows();
      const manual = left.length;
      let n = 0;
      while (left.length) {
        if (stopFlag) return note(`Đã dừng · đã xoá ${n}/${manual} vị trí thủ công.`, 'err');
        const del = left[0].row.querySelector(SEL.deleteBtn);
        if (!del) throw new Error('Không thấy nút xoá.');
        (del.querySelector('button') || del).click();
        if (!(await waitFor(() => rows().length < left.length, 3000))) throw new Error('Không xoá được vị trí quảng cáo.');
        n++;
        note(`Đang xoá ${n}/${manual}…`);
        left = rows();
      }
      note(total ? `Đã xoá hết ${total} vị trí quảng cáo.` : 'Video chưa có vị trí quảng cáo nào.', 'ok');
    } catch (e) {
      note('Lỗi: ' + e.message, 'err');
    } finally {
      state.running = false;
      state.finished = true;
      emit();
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'run' || msg.type === 'clear') {
      if (state?.running) return sendResponse({ ok: false, error: 'Đang chạy.' });
      msg.type === 'run' ? run(msg.points) : clearAll();
      sendResponse({ ok: true });
    } else if (msg.type === 'stop') {
      stopFlag = true;
      sendResponse({ ok: true });
    } else if (msg.type === 'getState') {
      sendResponse(state);
    }
  });
})();
