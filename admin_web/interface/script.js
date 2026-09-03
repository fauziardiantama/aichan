document.querySelectorAll('nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const tabName = link.getAttribute('data-tab');

    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    link.classList.add('active');

    if (tabName === 'overview' || tabName === 'testing') {
      document.querySelectorAll('.view-tab').forEach(view => {
        view.style.display = 'none';
      });

      const target = document.getElementById(`view-${tabName}`);
      if (target) {
        target.style.display = 'flex';
      }

      const pageTitle = document.getElementById('pageTitle');
      if (pageTitle) {
        pageTitle.textContent = tabName === 'testing' ? 'AI Chat Playground // Testing' : 'System Dashboard';
      }
    }
  });
});

let currentConfigModule = null;
let moduleManifests = [];

async function loadManifests() {
  try {
    const res = await fetch('/api/modules');
    if (res.ok) {
      moduleManifests = await res.json();
    }
  } catch (err) {
    console.error('Failed to load manifests:', err);
  }
}

async function openConfigModal(moduleName) {
  currentConfigModule = moduleName;
  const modal = document.getElementById('configModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const msg = document.getElementById('modalMsg');

  msg.textContent = '';
  title.textContent = `Configure // ${moduleName.toUpperCase()}`;
  body.innerHTML = '<div style="font-family: monospace; color: #666; font-size: 0.8rem;">Loading...</div>';
  modal.style.display = 'flex';

  if (moduleManifests.length === 0) {
    await loadManifests();
  }

  const manifest = moduleManifests.find(m => m.name === moduleName) || { fields: ['apiKey', 'ownerId'] };

  try {
    const res = await fetch(`/api/config?module=${encodeURIComponent(moduleName)}`);
    const config = res.ok ? await res.json() : {};

    body.innerHTML = '';
    (manifest.fields || []).forEach(field => {
      const val = config[field] !== undefined ? config[field] : '';
      const group = document.createElement('div');
      group.className = 'form-group';
      group.innerHTML = `
        <label class="form-label">${escapeHtml(field)}</label>
        <input type="text" class="form-input" data-field="${escapeHtml(field)}" value="${escapeHtml(val)}" placeholder="Enter ${escapeHtml(field)}...">
      `;
      body.appendChild(group);
    });
  } catch (err) {
    body.innerHTML = `<div style="color: #f87171; font-family: monospace; font-size: 0.8rem;">Error loading config: ${escapeHtml(err.message)}</div>`;
  }
}

function closeConfigModal() {
  const modal = document.getElementById('configModal');
  modal.style.display = 'none';
  currentConfigModule = null;
}

async function saveActiveConfig() {
  if (!currentConfigModule) return;
  const modal = document.getElementById('configModal');
  const inputs = modal.querySelectorAll('.form-input');
  const config = {};
  inputs.forEach(inp => {
    config[inp.getAttribute('data-field')] = inp.value;
  });

  const msg = document.getElementById('modalMsg');
  msg.style.color = '#a3a3a3';
  msg.textContent = 'Saving...';

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: currentConfigModule,
        config: config
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      msg.style.color = '#86efac';
      msg.textContent = 'Saved successfully.';
      setTimeout(() => {
        closeConfigModal();
      }, 700);
    } else {
      msg.style.color = '#f87171';
      msg.textContent = data.error || 'Failed to save.';
    }
  } catch (err) {
    msg.style.color = '#f87171';
    msg.textContent = err.message;
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

window.openConfigModal = openConfigModal;
window.closeConfigModal = closeConfigModal;
window.saveActiveConfig = saveActiveConfig;

// Chat Functionality for Testing Tab
async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const chatArea = document.getElementById('chatMessagesArea');
  const modelSelect = document.getElementById('modelSelect');
  const btnSend = document.getElementById('btnSendChat');
  const chatStatus = document.getElementById('chatStatus');

  if (!input || !chatArea) return;
  const prompt = input.value.trim();
  if (!prompt) return;

  const model = modelSelect ? modelSelect.value : 'gemini-3.5-flash';

  // Append user message bubble
  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'chat-message user';
  userMsgDiv.innerHTML = `
    <div class="chat-author">Operator</div>
    <div class="chat-bubble">${escapeHtml(prompt)}</div>
  `;
  chatArea.appendChild(userMsgDiv);
  input.value = '';
  chatArea.scrollTop = chatArea.scrollHeight;

  // Append loading AI bubble
  const aiMsgDiv = document.createElement('div');
  aiMsgDiv.className = 'chat-message ai';
  aiMsgDiv.innerHTML = `
    <div class="chat-author">Ai-Chan // ${escapeHtml(model)}</div>
    <div class="chat-bubble" style="color: #888; font-style: italic;">Generating response...</div>
  `;
  chatArea.appendChild(aiMsgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;

  if (btnSend) btnSend.disabled = true;
  if (chatStatus) chatStatus.textContent = `[Processing] Calling aistudio with model ${model}...`;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: 'aistudio',
        prompt,
        model
      })
    });

    const data = await res.json();
    const bubble = aiMsgDiv.querySelector('.chat-bubble');

    if (res.ok && data.text) {
      bubble.style.color = '';
      bubble.style.fontStyle = '';
      bubble.textContent = data.text;
      if (chatStatus) chatStatus.textContent = '[Ready] Response received successfully.';
    } else {
      bubble.style.color = '#f87171';
      bubble.style.fontStyle = '';
      bubble.textContent = `Error: ${data.error || 'Failed to generate response'}`;
      if (chatStatus) chatStatus.textContent = '[Error] Generation failed. Check API key in aistudio config.';
    }
  } catch (err) {
    const bubble = aiMsgDiv.querySelector('.chat-bubble');
    bubble.style.color = '#f87171';
    bubble.style.fontStyle = '';
    bubble.textContent = `Network Error: ${err.message}`;
    if (chatStatus) chatStatus.textContent = '[Error] Network failure communicating with server.';
  } finally {
    if (btnSend) btnSend.disabled = false;
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

function initChatListeners() {
  const btnSend = document.getElementById('btnSendChat');
  const chatInput = document.getElementById('chatInput');
  const btnClear = document.getElementById('btnClearChat');

  if (btnSend) {
    btnSend.addEventListener('click', sendChatMessage);
  }

  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendChatMessage();
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      const chatArea = document.getElementById('chatMessagesArea');
      if (chatArea) {
        chatArea.innerHTML = `
          <div class="chat-sys-notice">
            <span>// Chat history cleared //</span>
          </div>
        `;
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatListeners);
} else {
  initChatListeners();
}

loadManifests();
