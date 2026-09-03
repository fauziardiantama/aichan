document.querySelectorAll('nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const tabName = link.getAttribute('data-tab');

    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    link.classList.add('active');

    if (['overview', 'testing', 'chats', 'prompts'].includes(tabName)) {
      document.querySelectorAll('.view-tab').forEach(view => {
        view.style.display = 'none';
      });

      const target = document.getElementById(`view-${tabName}`);
      if (target) {
        target.style.display = 'flex';
      }

      const pageTitle = document.getElementById('pageTitle');
      if (pageTitle) {
        pageTitle.textContent = tabName === 'testing' ? 'AI Chat Playground // Testing' : tabName === 'chats' ? 'Chat Logs' : tabName === 'prompts' ? 'System Prompts' : 'System Dashboard';
      }
      if (tabName === 'chats') loadChats();
      if (tabName === 'prompts') loadPrompts();
    }
  });
});

let currentConfigModule = null;
let moduleManifests = [];
let activePromptId = null;

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
  const promptSelect = document.getElementById('promptSelect');
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
        model,
        promptCodename: promptSelect ? promptSelect.value : undefined
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

async function loadChats() {
  const list = document.getElementById('chatList');
  if (!list) return;
  const search = document.getElementById('chatSearch')?.value || '';
  const res = await fetch(`/api/chats?search=${encodeURIComponent(search)}`);
  const data = await res.json();
  list.innerHTML = (data.chats || []).map(chat => `
    <tr><td><code>${escapeHtml(chat.chat_id)}</code></td><td>${escapeHtml(chat.platform)}</td>
    <td>${chat.message_count}</td><td>${escapeHtml(chat.prompt_codename || '-')}</td>
    <td>${escapeHtml(chat.updated_at)}</td><td><button class="btn" onclick="viewChat(${chat.id})">View</button>
    <button class="btn" onclick="removeChat(${chat.id})">Delete</button></td></tr>
  `).join('') || '<tr><td colspan="6">No chats found.</td></tr>';
}

async function viewChat(id) {
  const res = await fetch(`/api/chats/${id}/messages`);
  const data = await res.json();
  document.getElementById('chatLogTitle').textContent = `${data.chat.platform} // ${data.chat.chat_id}`;
  document.getElementById('chatLog').innerHTML = (data.messages || []).map(message =>
    `<div class="terminal-line"><span class="terminal-time">[${escapeHtml(message.created_at)}]</span><strong>${escapeHtml(message.role)}</strong>: ${escapeHtml(message.content)}</div>`
  ).join('') || '<div class="terminal-line">No messages.</div>';
}

async function removeChat(id) {
  if (!confirm('Delete this chat and its message log?')) return;
  await fetch(`/api/chats/${id}`, { method: 'DELETE' });
  loadChats();
}

async function loadPrompts() {
  const list = document.getElementById('promptList');
  if (!list) return;
  const res = await fetch('/api/prompts');
  const data = await res.json();
  list.innerHTML = (data.prompts || []).map(prompt => `
    <div class="terminal-line"><strong>${escapeHtml(prompt.codename)}</strong> ${prompt.is_active ? 'ACTIVE' : 'INACTIVE'}
      <button class="btn" onclick="editPrompt(${prompt.id})">Edit</button></div>
  `).join('');
  window.promptRecords = data.prompts || [];
  const promptSelect = document.getElementById('promptSelect');
  if (promptSelect) {
    promptSelect.innerHTML = (data.prompts || []).filter(prompt => prompt.is_active).map(prompt =>
      `<option value="${escapeHtml(prompt.codename)}">${escapeHtml(prompt.codename)}</option>`
    ).join('');
  }
}

function editPrompt(id) {
  const prompt = (window.promptRecords || []).find(item => item.id === id);
  if (!prompt) return;
  activePromptId = prompt.id;
  document.getElementById('promptCodename').value = prompt.codename;
  document.getElementById('promptDescription').value = prompt.description || '';
  document.getElementById('promptContent').value = prompt.content;
  document.getElementById('promptActive').checked = Boolean(prompt.is_active);
}

async function savePrompt() {
  const status = document.getElementById('promptStatus');
  try {
    const res = await fetch('/api/prompts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      id: activePromptId,
      codename: document.getElementById('promptCodename').value.trim(),
      description: document.getElementById('promptDescription').value.trim(),
      content: document.getElementById('promptContent').value,
      isActive: document.getElementById('promptActive').checked
    }) });
    const data = await res.json();
    status.textContent = res.ok ? 'Saved.' : data.error;
    if (res.ok) loadPrompts();
  } catch (err) {
    status.textContent = err.message;
  }
}

window.viewChat = viewChat;
window.removeChat = removeChat;
window.editPrompt = editPrompt;

function initChatListeners() {
  const btnSend = document.getElementById('btnSendChat');
  const chatInput = document.getElementById('chatInput');
  const btnClear = document.getElementById('btnClearChat');
  const savePromptButton = document.getElementById('savePrompt');

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
  if (savePromptButton) savePromptButton.addEventListener('click', savePrompt);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatListeners);
} else {
  initChatListeners();
}

loadManifests();
loadPrompts();
document.getElementById('chatSearch')?.addEventListener('input', loadChats);
