// ===== State =====
let memos = [];
let currentMemoId = null;
let autoSaveTimer = null;

// ===== DOM Elements =====
const editor = document.getElementById('editor');
const titleInput = document.getElementById('memo-title');
const memoList = document.getElementById('memo-list');
const searchInput = document.getElementById('search-input');
const statusText = document.getElementById('status-text');
const charCount = document.getElementById('char-count');
const toastContainer = document.getElementById('toast-container');

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadFromDisk();
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
  saveToDisk();
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
    reattachCodeBlocks();
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
    // Sync code block textarea values into data-code attributes before saving
    editor.querySelectorAll('.code-block').forEach(block => {
      const ta = block.querySelector('.code-block-editor');
      if (ta) block.setAttribute('data-code', ta.value);
    });
    memo.content = editor.innerHTML;
    memo.updatedAt = new Date().toISOString();
    // Extract image data
    const imgs = editor.querySelectorAll('img');
    memo.images = Array.from(imgs).map(img => img.src);
  }
  saveToDisk();
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
  saveToDisk();
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
  const size = e.target.value + 'px';
  const selection = window.getSelection();
  if (selection.rangeCount > 0 && !selection.isCollapsed) {
    // Wrap selected text with a span
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = size;
    range.surroundContents(span);
  }
  editor.focus();
});

document.getElementById('font-family-select').addEventListener('change', (e) => {
  const font = e.target.value;
  const selection = window.getSelection();
  if (selection.rangeCount > 0 && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontFamily = font;
    range.surroundContents(span);
  }
  editor.focus();
});

document.getElementById('btn-add-codeblock').addEventListener('click', () => {
  insertCodeBlock();
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
  if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    document.execCommand('redo');
    return;
  }
  if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    document.execCommand('undo');
    return;
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'K') {
    e.preventDefault();
    insertCodeBlock();
  }
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    openFindBar();
  }
  if (e.ctrlKey && e.key === 'h') {
    e.preventDefault();
    openFindBar(true);
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

// Reload when data.json is changed externally (e.g. by Python SDK)
let isSyncing = false;

window.api.onDataFileChanged(async () => {
  if (isSyncing) return;
  isSyncing = true;

  // Cancel any pending auto-save to avoid overwriting external changes
  clearTimeout(autoSaveTimer);

  const result = await window.api.loadMemos();
  if (!result.success) { isSyncing = false; return; }
  const newMemos = result.memos || [];

  // Check if current memo was modified
  const oldCurrent = memos.find(m => m.id === currentMemoId);
  const newCurrent = newMemos.find(m => m.id === currentMemoId);

  // Update in-memory data
  memos = newMemos;

  // Only re-render sidebar
  renderMemoList();

  // Only touch the editor if the current memo actually changed
  if (oldCurrent && newCurrent) {
    if (oldCurrent.title !== newCurrent.title) {
      titleInput.value = newCurrent.title;
    }
    if (oldCurrent.content !== newCurrent.content) {
      const hadFocus = document.activeElement === editor;
      editor.innerHTML = newCurrent.content;
      wrapExistingImages();
      reattachCodeBlocks();
      updateCharCount();
      if (hadFocus) editor.focus();
    }
  } else if (!newCurrent && memos.length > 0) {
    selectMemo(memos[0].id);
  }

  isSyncing = false;
});

// ===== Disk Storage (~/.flake/data.json) =====
function saveToDisk() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const result = await window.api.saveMemos(memos);
    if (!result.success) {
      console.warn('Save failed:', result.error);
    }
  }, 300);
}

async function loadFromDisk() {
  const result = await window.api.loadMemos();
  if (result.success) {
    memos = result.memos || [];
  } else {
    console.warn('Load failed:', result.error);
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

// ===== Claude AI Integration =====
const aiPanel = document.getElementById('ai-panel');
const aiMessages = document.getElementById('ai-messages');
const aiInput = document.getElementById('ai-input');
const aiSendBtn = document.getElementById('btn-ai-send');
const aiApplyBtn = document.getElementById('btn-ai-apply');
const aiReplaceBtn = document.getElementById('btn-ai-replace');
const aiStopBtn = document.getElementById('btn-ai-stop');
const aiStatusBadge = document.getElementById('ai-status-badge');
const aiToggleBtn = document.getElementById('btn-toggle-ai');

let aiIsGenerating = false;
let lastAiResponse = '';
let chatHistory = [];

// Toggle AI panel
aiToggleBtn.addEventListener('click', () => toggleAiPanel());
document.getElementById('btn-close-ai').addEventListener('click', () => toggleAiPanel(false));

function toggleAiPanel(forceState) {
  const isOpen = forceState !== undefined ? forceState : !aiPanel.classList.contains('open');
  aiPanel.classList.toggle('open', isOpen);
  aiToggleBtn.classList.toggle('active', isOpen);
  if (isOpen) {
    checkClaudeStatus();
    aiInput.focus();
  }
}

// Check if Claude CLI is available
async function checkClaudeStatus() {
  const result = await window.api.claudeCheck();
  if (result.available) {
    aiStatusBadge.textContent = 'Online';
    aiStatusBadge.className = 'ai-status-badge online';
  } else {
    aiStatusBadge.textContent = 'Offline';
    aiStatusBadge.className = 'ai-status-badge offline';
  }
}

// Get current memo context (title + plain text content)
function getMemoContext() {
  const memo = memos.find(m => m.id === currentMemoId);
  return {
    title: memo ? memo.title : '',
    content: memo ? stripHtml(memo.content) : ''
  };
}

// Build prompt with chat history + current memo
function buildPrompt(userMessage) {
  let historyText = '';
  // Include last few exchanges for context
  const recent = chatHistory.slice(-6);
  if (recent.length > 0) {
    historyText = '\n\nPrevious conversation:\n' + recent.map(m =>
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n');
  }
  return userMessage + historyText;
}

// Send message to Claude
async function sendToAi() {
  const message = aiInput.value.trim();
  if (!message || aiIsGenerating) return;

  // Add user message to UI
  addAiMessage(message, 'user');
  chatHistory.push({ role: 'user', content: message });
  aiInput.value = '';
  aiInput.style.height = 'auto';

  // Show typing indicator
  aiIsGenerating = true;
  aiSendBtn.disabled = true;
  aiStopBtn.style.display = 'block';
  aiApplyBtn.disabled = true;
  aiReplaceBtn.disabled = true;

  // Create streaming message bubble
  const msgEl = addAiMessage('', 'assistant');
  msgEl.classList.add('streaming');

  // Add typing dots
  const typingEl = document.createElement('div');
  typingEl.className = 'ai-typing';
  typingEl.innerHTML = '<span></span><span></span><span></span>';
  msgEl.appendChild(typingEl);
  scrollAiToBottom();

  lastAiResponse = '';

  // Listen for streaming chunks
  const streamHandler = (chunk) => {
    if (typingEl.parentNode) typingEl.remove();
    lastAiResponse += chunk;
    msgEl.textContent = lastAiResponse;
    scrollAiToBottom();
  };
  window.api.onClaudeStream(streamHandler);

  // Get current memo content and send with message
  const memoContext = getMemoContext();
  const fullMessage = buildPrompt(message);
  const result = await window.api.claudeSend(fullMessage, memoContext);

  // Clean up
  msgEl.classList.remove('streaming');
  if (typingEl.parentNode) typingEl.remove();
  aiIsGenerating = false;
  aiSendBtn.disabled = false;
  aiStopBtn.style.display = 'none';

  if (result.success) {
    lastAiResponse = result.response;
    msgEl.textContent = lastAiResponse;
    chatHistory.push({ role: 'assistant', content: lastAiResponse });
    aiApplyBtn.disabled = false;
    aiReplaceBtn.disabled = false;
  } else {
    msgEl.className = 'ai-message error';
    msgEl.textContent = 'Error: ' + (result.error || 'Unknown error');
  }

  scrollAiToBottom();
}

function addAiMessage(text, role) {
  const el = document.createElement('div');
  el.className = `ai-message ${role}`;
  if (text) el.textContent = text;
  aiMessages.appendChild(el);
  scrollAiToBottom();
  return el;
}

function scrollAiToBottom() {
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

// Append AI response to memo
aiApplyBtn.addEventListener('click', () => {
  if (!lastAiResponse) return;
  editor.innerHTML += '<br>' + lastAiResponse.replace(/\n/g, '<br>');
  saveCurrentMemo();
  showToast('AI 응답이 메모에 추가되었습니다', 'success');
});

// Replace memo content with AI response
aiReplaceBtn.addEventListener('click', () => {
  if (!lastAiResponse) return;
  editor.innerHTML = lastAiResponse.replace(/\n/g, '<br>');
  saveCurrentMemo();
  showToast('메모 내용이 AI 응답으로 교체되었습니다', 'success');
});

// Stop generation
aiStopBtn.addEventListener('click', async () => {
  await window.api.claudeStop();
  aiIsGenerating = false;
  aiSendBtn.disabled = false;
  aiStopBtn.style.display = 'none';
  showToast('AI 생성이 중단되었습니다', 'warning');
});

// Send on Enter (Shift+Enter for newline)
aiInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendToAi();
  }
});

// Auto-resize textarea
aiInput.addEventListener('input', () => {
  aiInput.style.height = 'auto';
  aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px';
});

// Send button click
aiSendBtn.addEventListener('click', sendToAi);

// Keyboard shortcut to toggle AI panel
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    toggleAiPanel();
  }
});

// ===== Find & Replace =====
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCountEl = document.getElementById('find-count');
const replaceRow = document.getElementById('replace-row');
const replaceInput = document.getElementById('replace-input');

let findMatches = [];
let findCurrentIdx = -1;
let originalEditorContent = '';

function openFindBar(withReplace = false) {
  findBar.style.display = 'block';
  replaceRow.style.display = withReplace ? 'flex' : 'none';
  findInput.focus();
  findInput.select();
}

function closeFindBar() {
  findBar.style.display = 'none';
  clearHighlights();
  findMatches = [];
  findCurrentIdx = -1;
  findCountEl.textContent = '0/0';
}

function clearHighlights() {
  const marks = editor.querySelectorAll('mark.find-highlight, mark.find-highlight-active');
  marks.forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

function performFind() {
  clearHighlights();
  findMatches = [];
  findCurrentIdx = -1;

  const query = findInput.value;
  if (!query) {
    findCountEl.textContent = '0/0';
    return;
  }

  // Walk text nodes and highlight matches
  const treeWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (treeWalker.nextNode()) {
    textNodes.push(treeWalker.currentNode);
  }

  const queryLower = query.toLowerCase();

  textNodes.forEach(node => {
    const text = node.textContent;
    const textLower = text.toLowerCase();
    let idx = 0;
    const fragments = [];
    let lastEnd = 0;

    while ((idx = textLower.indexOf(queryLower, idx)) !== -1) {
      if (idx > lastEnd) {
        fragments.push({ type: 'text', content: text.substring(lastEnd, idx) });
      }
      fragments.push({ type: 'match', content: text.substring(idx, idx + query.length) });
      lastEnd = idx + query.length;
      idx = lastEnd;
    }

    if (fragments.length > 0) {
      if (lastEnd < text.length) {
        fragments.push({ type: 'text', content: text.substring(lastEnd) });
      }
      const span = document.createDocumentFragment();
      fragments.forEach(f => {
        if (f.type === 'match') {
          const mark = document.createElement('mark');
          mark.className = 'find-highlight';
          mark.textContent = f.content;
          span.appendChild(mark);
          findMatches.push(mark);
        } else {
          span.appendChild(document.createTextNode(f.content));
        }
      });
      node.parentNode.replaceChild(span, node);
    }
  });

  if (findMatches.length > 0) {
    findCurrentIdx = 0;
    setActiveMatch(0);
  }
  updateFindCount();
}

function setActiveMatch(idx) {
  findMatches.forEach(m => m.className = 'find-highlight');
  if (findMatches[idx]) {
    findMatches[idx].className = 'find-highlight-active';
    findMatches[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function findNext() {
  if (findMatches.length === 0) return;
  findCurrentIdx = (findCurrentIdx + 1) % findMatches.length;
  setActiveMatch(findCurrentIdx);
  updateFindCount();
}

function findPrev() {
  if (findMatches.length === 0) return;
  findCurrentIdx = (findCurrentIdx - 1 + findMatches.length) % findMatches.length;
  setActiveMatch(findCurrentIdx);
  updateFindCount();
}

function updateFindCount() {
  findCountEl.textContent = findMatches.length > 0
    ? `${findCurrentIdx + 1}/${findMatches.length}`
    : '0/0';
}

function replaceOne() {
  if (findCurrentIdx < 0 || !findMatches[findCurrentIdx]) return;
  const mark = findMatches[findCurrentIdx];
  const text = document.createTextNode(replaceInput.value);
  mark.parentNode.replaceChild(text, mark);
  findMatches.splice(findCurrentIdx, 1);
  if (findCurrentIdx >= findMatches.length) findCurrentIdx = 0;
  if (findMatches.length > 0) {
    setActiveMatch(findCurrentIdx);
  }
  updateFindCount();
  saveCurrentMemo();
}

function replaceAll() {
  if (findMatches.length === 0) return;
  const replacement = replaceInput.value;
  findMatches.forEach(mark => {
    mark.parentNode.replaceChild(document.createTextNode(replacement), mark);
  });
  findMatches = [];
  findCurrentIdx = -1;
  updateFindCount();
  saveCurrentMemo();
  showToast('모두 바꾸기 완료', 'success');
}

findInput.addEventListener('input', performFind);

findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.shiftKey ? findPrev() : findNext();
  }
  if (e.key === 'Escape') closeFindBar();
});

replaceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFindBar();
});

document.getElementById('btn-find-next').addEventListener('click', findNext);
document.getElementById('btn-find-prev').addEventListener('click', findPrev);
document.getElementById('btn-find-close').addEventListener('click', closeFindBar);
document.getElementById('btn-find-toggle-replace').addEventListener('click', () => {
  replaceRow.style.display = replaceRow.style.display === 'none' ? 'flex' : 'none';
});
document.getElementById('btn-replace-one').addEventListener('click', replaceOne);
document.getElementById('btn-replace-all').addEventListener('click', replaceAll);

// ===== Code Blocks (inline in editor) =====
let codeBlockCounter = 0;
let insertDebounce = false;

function insertCodeBlock(initialCode = '') {
  if (insertDebounce) return;
  insertDebounce = true;
  setTimeout(() => insertDebounce = false, 200);

  codeBlockCounter++;
  const blockId = 'cb-' + Date.now() + '-' + codeBlockCounter;

  const block = buildCodeBlockDOM(blockId, initialCode, codeBlockCounter);

  // Insert at cursor or at end of editor
  const selection = window.getSelection();
  if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0);
    range.collapse(false);
    // Ensure a line break before and after
    const brBefore = document.createElement('br');
    const brAfter = document.createElement('br');
    range.insertNode(brAfter);
    range.insertNode(block);
    range.insertNode(brBefore);
    // Move cursor after the block
    range.setStartAfter(brAfter);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.appendChild(document.createElement('br'));
    editor.appendChild(block);
    editor.appendChild(document.createElement('br'));
  }

  const textarea = block.querySelector('.code-block-editor');
  setTimeout(() => {
    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.focus();
    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);

  saveCurrentMemo();
}

function buildCodeBlockDOM(blockId, code, cellNum) {
  const block = document.createElement('div');
  block.className = 'code-block';
  block.contentEditable = 'false';
  block.setAttribute('data-block-id', blockId);
  block.setAttribute('data-code', code);

  block.innerHTML = `
    <div class="code-block-header">
      <span class="code-block-label">
        <span class="cell-number">[${cellNum}]</span> Python
      </span>
      <div class="code-block-actions">
        <button class="code-block-btn play" title="실행 (Ctrl+Enter)">▶</button>
        <button class="code-block-btn stop" title="중단" style="display:none">■</button>
        <button class="code-block-btn delete" title="삭제">✕</button>
      </div>
    </div>
    <div class="code-block-body">
      <div class="code-block-highlight"></div>
      <textarea class="code-block-editor" spellcheck="false" placeholder="# Python 코드를 입력하세요...">${escapeHtml(code)}</textarea>
    </div>
    <div class="code-block-output"></div>
  `;

  attachCodeBlockEvents(block);
  return block;
}

function attachCodeBlockEvents(block) {
  const blockId = block.getAttribute('data-block-id');
  const textarea = block.querySelector('.code-block-editor');
  const highlightEl = block.querySelector('.code-block-highlight');
  const playBtn = block.querySelector('.play');
  const stopBtn = block.querySelector('.stop');
  const deleteBtn = block.querySelector('.delete');
  const output = block.querySelector('.code-block-output');

  if (!textarea || !playBtn) return;

  function syncHighlight() {
    highlightEl.innerHTML = highlightPython(textarea.value) + '\n';
  }

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    syncHighlight();
    saveCurrentMemo();
  });

  textarea.addEventListener('scroll', () => {
    highlightEl.scrollTop = textarea.scrollTop;
  });

  textarea.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Don't let editor handle these
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 4;
      syncHighlight();
    }
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      runCodeBlock(blockId, textarea.value, output, playBtn, stopBtn);
    }
  });

  playBtn.addEventListener('click', () => {
    runCodeBlock(blockId, textarea.value, output, playBtn, stopBtn);
  });

  stopBtn.addEventListener('click', async () => {
    await window.api.stopScript(blockId);
    playBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    playBtn.classList.remove('running');
  });

  deleteBtn.addEventListener('click', () => {
    block.remove();
    saveCurrentMemo();
    showToast('코드 블록이 삭제되었습니다', 'warning');
  });

  // Restore code from data-code attribute (after innerHTML load)
  const savedCode = block.getAttribute('data-code');
  if (savedCode && !textarea.value) {
    textarea.value = savedCode;
  }

  setTimeout(() => {
    syncHighlight();
    textarea.style.height = textarea.scrollHeight + 'px';
  }, 10);
}

// Re-attach events on all code blocks after loading memo content
function reattachCodeBlocks() {
  codeBlockCounter = 0;
  editor.querySelectorAll('.code-block').forEach(block => {
    codeBlockCounter++;
    block.contentEditable = 'false';
    // Rebuild inner HTML from saved data-code
    const savedCode = block.getAttribute('data-code') || '';
    const blockId = block.getAttribute('data-block-id') || 'cb-' + Date.now() + '-' + codeBlockCounter;
    block.setAttribute('data-block-id', blockId);

    block.innerHTML = `
      <div class="code-block-header">
        <span class="code-block-label">
          <span class="cell-number">[${codeBlockCounter}]</span> Python
        </span>
        <div class="code-block-actions">
          <button class="code-block-btn play" title="실행 (Ctrl+Enter)">▶</button>
          <button class="code-block-btn stop" title="중단" style="display:none">■</button>
          <button class="code-block-btn delete" title="삭제">✕</button>
        </div>
      </div>
      <div class="code-block-body">
        <div class="code-block-highlight"></div>
        <textarea class="code-block-editor" spellcheck="false" placeholder="# Python 코드를 입력하세요...">${escapeHtml(savedCode)}</textarea>
      </div>
      <div class="code-block-output"></div>
    `;

    attachCodeBlockEvents(block);
  });
}

async function runCodeBlock(blockId, code, outputEl, playBtn, stopBtn) {
  if (!code.trim()) return;

  outputEl.innerHTML = '';
  outputEl.style.display = 'block';
  playBtn.style.display = 'none';
  stopBtn.style.display = 'flex';
  playBtn.classList.add('running');

  const result = await window.api.runScript(code, blockId);

  playBtn.style.display = 'flex';
  stopBtn.style.display = 'none';
  playBtn.classList.remove('running');

  const exitEl = document.createElement('div');
  if (result.exitCode === 0) {
    exitEl.className = 'exit-info success';
    exitEl.textContent = '✓ 실행 완료';
  } else if (result.exitCode === null) {
    exitEl.className = 'exit-info';
    exitEl.textContent = '■ 중단됨';
  } else {
    exitEl.className = 'exit-info error';
    exitEl.textContent = `✗ 종료 코드: ${result.exitCode}`;
  }
  outputEl.appendChild(exitEl);
}

// Listen for script output streaming
window.api.onScriptOutput(({ blockId, chunk, stream }) => {
  const block = editor.querySelector(`.code-block[data-block-id="${blockId}"]`);
  if (!block) return;
  const output = block.querySelector('.code-block-output');
  output.style.display = 'block';
  const span = document.createElement('span');
  span.className = stream;
  span.textContent = chunk;
  output.appendChild(span);
  output.scrollTop = output.scrollHeight;
});

// ===== Python Syntax Highlighting =====
function highlightPython(code) {
  // Escape HTML first
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Order matters: strings/comments first (greedy), then keywords etc.
  const rules = [
    // Triple-quoted strings
    [/("""[\s\S]*?"""|'''[\s\S]*?''')/g, '<span class="hl-string">$1</span>'],
    // Single/double quoted strings
    [/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="hl-string">$1</span>'],
    // Comments
    [/(#.*)/gm, '<span class="hl-comment">$1</span>'],
    // Decorators
    [/(@\w+)/g, '<span class="hl-decorator">$1</span>'],
    // Keywords
    [/\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/g,
      '<span class="hl-keyword">$1</span>'],
    // Booleans & None
    [/\b(True|False)\b/g, '<span class="hl-bool">$1</span>'],
    [/\b(None)\b/g, '<span class="hl-none">$1</span>'],
    // self
    [/\b(self|cls)\b/g, '<span class="hl-self">$1</span>'],
    // Builtins
    [/\b(print|len|range|int|str|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|open|input|map|filter|zip|enumerate|sorted|reversed|sum|min|max|abs|round|any|all|super|property|staticmethod|classmethod|Exception|ValueError|TypeError|KeyError|IndexError|FileNotFoundError|RuntimeError)\b/g,
      '<span class="hl-builtin">$1</span>'],
    // Function calls (word followed by parenthesis)
    [/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="hl-function">$1</span>'],
    // Numbers
    [/\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[\da-fA-F]+|0b[01]+|0o[0-7]+)\b/g, '<span class="hl-number">$1</span>'],
  ];

  // Apply rules sequentially, but protect already-highlighted spans
  // Simple approach: apply regex with a placeholder system
  const placeholders = [];

  function protect(match) {
    const idx = placeholders.length;
    placeholders.push(match);
    return `\x00PH${idx}\x00`;
  }

  // First pass: strings and comments (protect them)
  html = html.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, (m) => protect(`<span class="hl-string">${m}</span>`));
  html = html.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, (m) => protect(`<span class="hl-string">${m}</span>`));
  html = html.replace(/(#.*)/gm, (m) => protect(`<span class="hl-comment">${m}</span>`));

  // Second pass: everything else
  html = html.replace(/(@\w+)/g, '<span class="hl-decorator">$1</span>');
  html = html.replace(/\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/g,
    '<span class="hl-keyword">$1</span>');
  html = html.replace(/\b(True|False)\b/g, '<span class="hl-bool">$1</span>');
  html = html.replace(/\b(None)\b/g, '<span class="hl-none">$1</span>');
  html = html.replace(/\b(self|cls)\b/g, '<span class="hl-self">$1</span>');
  html = html.replace(/\b(print|len|range|int|str|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|open|input|map|filter|zip|enumerate|sorted|reversed|sum|min|max|abs|round|any|all|super|property|staticmethod|classmethod|Exception|ValueError|TypeError|KeyError|IndexError|FileNotFoundError|RuntimeError)\b/g,
    '<span class="hl-builtin">$1</span>');
  html = html.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[\da-fA-F]+|0b[01]+|0o[0-7]+)\b/g, '<span class="hl-number">$1</span>');

  // Restore placeholders
  html = html.replace(/\x00PH(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);

  return html;
}
