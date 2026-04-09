// ===== State =====
let memos = [];
let currentMemoId = null;
let currentFilePath = null;

// ===== DOM Elements =====
const editor = document.getElementById('editor');
const titleInput = document.getElementById('memo-title');
const memoList = document.getElementById('memo-list');
const searchInput = document.getElementById('search-input');
const statusText = document.getElementById('status-text');
const charCount = document.getElementById('char-count');
const toastContainer = document.getElementById('toast-container');

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  if (memos.length === 0) {
    createNewMemo();
  } else {
    selectMemo(memos[0].id);
  }
  renderMemoList();
});

// ===== Memo CRUD =====
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function createNewMemo() {
  const memo = {
    id: generateId(),
    title: '',
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: []
  };
  memos.unshift(memo);
  selectMemo(memo.id);
  renderMemoList();
  titleInput.focus();
  saveToLocalStorage();
  showToast('새 메모가 생성되었습니다', 'success');
}

function selectMemo(id) {
  saveCurrentMemo();
  currentMemoId = id;
  const memo = memos.find(m => m.id === id);
  if (memo) {
    titleInput.value = memo.title;
    editor.innerHTML = memo.content;
    wrapExistingImages();
    updateStatus();
    updateCharCount();
  }
  renderMemoList();
}

function saveCurrentMemo() {
  if (!currentMemoId) return;
  const memo = memos.find(m => m.id === currentMemoId);
  if (memo) {
    memo.title = titleInput.value;
    memo.content = editor.innerHTML;
    memo.updatedAt = new Date().toISOString();
    // Extract image data
    const imgs = editor.querySelectorAll('img');
    memo.images = Array.from(imgs).map(img => img.src);
  }
  saveToLocalStorage();
}

function deleteMemo(id) {
  const index = memos.findIndex(m => m.id === id);
  if (index === -1) return;

  memos.splice(index, 1);

  if (currentMemoId === id) {
    if (memos.length > 0) {
      selectMemo(memos[0].id);
    } else {
      createNewMemo();
    }
  }
  renderMemoList();
  saveToLocalStorage();
  showToast('메모가 삭제되었습니다', 'warning');
}

// ===== Rendering =====
function renderMemoList(filter = '') {
  const filtered = filter
    ? memos.filter(m =>
        m.title.toLowerCase().includes(filter.toLowerCase()) ||
        stripHtml(m.content).toLowerCase().includes(filter.toLowerCase())
      )
    : memos;

  memoList.innerHTML = '';

  if (filtered.length === 0) {
    memoList.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p>메모가 없습니다</p>
      </div>
    `;
    return;
  }

  filtered.forEach((memo, i) => {
    const item = document.createElement('div');
    item.className = `memo-item${memo.id === currentMemoId ? ' active' : ''}`;
    item.style.animationDelay = `${i * 0.05}s`;

    const preview = stripHtml(memo.content).substring(0, 60) || '내용 없음';
    const date = formatDate(memo.updatedAt);
    const title = memo.title || '제목 없음';

    item.innerHTML = `
      <div class="memo-item-title">${escapeHtml(title)}</div>
      <div class="memo-item-preview">${escapeHtml(preview)}</div>
      <div class="memo-item-date">${date}</div>
      <button class="memo-item-delete" title="삭제">✕</button>
    `;

    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('memo-item-delete')) {
        selectMemo(memo.id);
      }
    });

    item.querySelector('.memo-item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMemo(memo.id);
    });

    memoList.appendChild(item);
  });
}

// ===== Image Handling =====
function handleImagePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => {
        insertImage(event.target.result);
      };
      reader.readAsDataURL(file);
      return;
    }
  }
}

function insertImage(src) {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-wrapper';
  wrapper.contentEditable = 'false';

  const img = document.createElement('img');
  img.src = src;
  img.alt = '붙여넣은 이미지';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'image-delete-btn';
  deleteBtn.innerHTML = '✕';
  deleteBtn.title = '이미지 삭제';
  deleteBtn.addEventListener('click', () => {
    wrapper.remove();
    saveCurrentMemo();
    showToast('이미지가 삭제되었습니다', 'warning');
  });

  wrapper.appendChild(img);
  wrapper.appendChild(deleteBtn);

  // Insert at cursor position
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(wrapper);
    // Move cursor after image
    range.setStartAfter(wrapper);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.appendChild(wrapper);
  }

  // Add line break after image for easier editing
  const br = document.createElement('br');
  wrapper.after(br);

  saveCurrentMemo();
  showToast('이미지가 추가되었습니다', 'success');
}

function wrapExistingImages() {
  const images = editor.querySelectorAll('img:not(.image-wrapper img)');
  images.forEach(img => {
    if (img.parentElement.classList.contains('image-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    wrapper.contentEditable = 'false';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'image-delete-btn';
    deleteBtn.innerHTML = '✕';
    deleteBtn.title = '이미지 삭제';
    deleteBtn.addEventListener('click', () => {
      wrapper.remove();
      saveCurrentMemo();
      showToast('이미지가 삭제되었습니다', 'warning');
    });

    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);
    wrapper.appendChild(deleteBtn);
  });
}

// ===== Toolbar =====
document.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
  btn.addEventListener('click', () => {
    const command = btn.dataset.command;
    document.execCommand(command, false, null);
    editor.focus();
  });
});

document.getElementById('font-size-select').addEventListener('change', (e) => {
  document.execCommand('fontSize', false, e.target.value);
  editor.focus();
});

document.getElementById('btn-add-image').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        insertImage(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };
  input.click();
});

// ===== Event Listeners =====
editor.addEventListener('paste', handleImagePaste);

editor.addEventListener('input', () => {
  saveCurrentMemo();
  updateCharCount();
  updateStatus('편집 중...');
});

titleInput.addEventListener('input', () => {
  saveCurrentMemo();
  renderMemoList(searchInput.value);
  updateStatus('편집 중...');
});

searchInput.addEventListener('input', (e) => {
  renderMemoList(e.target.value);
});

document.getElementById('btn-new-memo').addEventListener('click', createNewMemo);

// File operations
document.getElementById('btn-save-file').addEventListener('click', async () => {
  saveCurrentMemo();
  const memo = memos.find(m => m.id === currentMemoId);
  if (!memo) return;

  const result = await window.api.saveMemo(memo, currentFilePath);
  if (result.success) {
    currentFilePath = result.filePath;
    showToast('메모가 저장되었습니다', 'success');
    updateStatus('저장됨');
  } else if (!result.canceled) {
    showToast('저장 실패: ' + result.error, 'error');
  }
});

document.getElementById('btn-load').addEventListener('click', async () => {
  const result = await window.api.loadMemo();
  if (result.success) {
    const loaded = result.memo;
    // If loading a single memo object
    if (loaded.id) {
      const existing = memos.find(m => m.id === loaded.id);
      if (existing) {
        Object.assign(existing, loaded);
      } else {
        memos.unshift(loaded);
      }
      selectMemo(loaded.id);
    }
    // If loading an array of memos
    else if (Array.isArray(loaded)) {
      loaded.forEach(m => {
        if (!memos.find(e => e.id === m.id)) {
          memos.push(m);
        }
      });
      if (loaded.length > 0) selectMemo(loaded[0].id);
    }
    currentFilePath = result.filePath;
    renderMemoList();
    saveToLocalStorage();
    showToast('메모를 불러왔습니다', 'success');
  } else if (!result.canceled) {
    showToast('불러오기 실패: ' + result.error, 'error');
  }
});

// Window controls
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.api.close());

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    createNewMemo();
  }
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    document.getElementById('btn-save-file').click();
  }
  if (e.ctrlKey && e.key === 'o') {
    e.preventDefault();
    document.getElementById('btn-load').click();
  }
  // Delete image with Delete/Backspace when selected
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const node = selection.anchorNode;
      if (node && node.parentElement && node.parentElement.classList.contains('image-wrapper')) {
        e.preventDefault();
        node.parentElement.remove();
        saveCurrentMemo();
      }
    }
  }
});

// IPC from main process
window.api.onNewMemo(() => {
  createNewMemo();
});

// ===== Local Storage =====
function saveToLocalStorage() {
  try {
    localStorage.setItem('memos', JSON.stringify(memos));
  } catch (e) {
    // Storage full - trim old data
    console.warn('LocalStorage save failed:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const data = localStorage.getItem('memos');
    if (data) {
      memos = JSON.parse(data);
    }
  } catch (e) {
    console.warn('LocalStorage load failed:', e);
    memos = [];
  }
}

// ===== Utility =====
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return '방금 전';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;

  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function updateCharCount() {
  const text = stripHtml(editor.innerHTML);
  charCount.textContent = `${text.length}자`;
}

function updateStatus(text = '준비') {
  statusText.textContent = text;
  if (text !== '준비') {
    setTimeout(() => {
      statusText.textContent = '준비';
    }, 2000);
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
