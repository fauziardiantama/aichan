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
let availableModels = [];

async function loadManifests() {
  try {
    const res = await fetch('/api/modules');
    if (res.ok) {
      moduleManifests = await res.json();
      renderModuleOverview();
    }
  } catch (err) {
    console.error('Failed to load manifests:', err);
  }
}

function renderModuleOverview() {
  const list = document.getElementById('moduleList');
  const metric = document.getElementById('moduleMetric');
  if (!list) return;

  const modules = [{ name: 'admin_web', type: 'interface', status: { state: 'running' }, local: true }, ...moduleManifests];
  const runningCount = modules.filter(module => ['running', 'online'].includes(module.status?.state)).length;
  if (metric) metric.textContent = `${runningCount} / ${modules.length}`;
  list.innerHTML = modules.map(module => {
    const status = module.status?.state || 'unknown';
    const statusClass = ['running', 'online'].includes(status) ? 'tag-online' : 'tag-offline';
    const binding = module.local ? 'http://localhost:3000' : `${module.name}/`;
    const bindingMarkup = module.local
      ? `<a href="${binding}" target="_blank" class="code-link">${binding} &nearr;</a>`
      : `<code>${escapeHtml(binding)}</code>`;
    const configButton = module.fields?.length
      ? `<button class="btn" onclick="openConfigModal('${escapeHtml(module.name)}')">Config</button>`
      : '';
    return `<tr><td><strong>${escapeHtml(module.name)}</strong></td><td>${escapeHtml(module.type || 'module')}</td><td>${bindingMarkup}</td><td><span class="tag ${statusClass}">${escapeHtml(status.toUpperCase())}</span></td><td>${configButton}</td></tr>`;
  }).join('');
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

  const manifest = moduleManifests.find(m => m.name === moduleName);
  if (!manifest) {
    body.innerHTML = '<div class="modal-msg">Module configuration is unavailable.</div>';
    return;
  }

  try {
    const res = await fetch(`/api/config?module=${encodeURIComponent(moduleName)}`);
    const config = res.ok ? await res.json() : {};

    body.innerHTML = '';
    (manifest.fields || []).forEach(field => {
      const val = config[field] !== undefined ? config[field] : '';
      const group = document.createElement('div');
      group.className = 'form-group';
      const inputType = field.toLowerCase().includes('key') ? 'password' : 'text';
      group.innerHTML = `
        <label class="form-label">${escapeHtml(field)}</label>
        <input type="${inputType}" class="form-input" data-field="${escapeHtml(field)}" value="${escapeHtml(val)}" placeholder="Enter ${escapeHtml(field)}...">
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
  const providerSelect = document.getElementById('providerSelect');
  const promptSelect = document.getElementById('promptSelect');
  const btnSend = document.getElementById('btnSendChat');
  const chatStatus = document.getElementById('chatStatus');

  if (!input || !chatArea) return;
  const prompt = input.value.trim();
  if (!prompt) return;

  const provider = providerSelect?.value;
  const model = modelSelect?.value;
  if (!provider || !model) {
    if (chatStatus) chatStatus.textContent = '[Error] Select an available provider and model first.';
    return;
  }

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
    <div class="chat-author">Ai-Chan // ${escapeHtml(provider)} // ${escapeHtml(model)}</div>
    <div class="chat-bubble" style="color: #888; font-style: italic;">Generating response...</div>
  `;
  chatArea.appendChild(aiMsgDiv);
  chatArea.scrollTop = chatArea.scrollHeight;

  if (btnSend) btnSend.disabled = true;
  if (chatStatus) chatStatus.textContent = `[Processing] Calling ${provider} with model ${model}...`;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: provider,
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
      bubble.classList.add('markdown-content');
      bubble.innerHTML = DOMPurify.sanitize(marked.parse(data.text));
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

function updateProviderModels() {
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');
  if (!providerSelect || !modelSelect) return;
  const models = availableModels.filter(model => model.provider === providerSelect.value);
  modelSelect.innerHTML = models.map(model => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name)}</option>`).join('');
  renderModelDetails();
}

function renderModelDetails() {
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');
  const details = document.getElementById('modelDetails');
  if (!providerSelect || !modelSelect || !details) return;
  const model = availableModels.find(item => item.provider === providerSelect.value && item.id === modelSelect.value);
  if (!model) {
    details.textContent = 'No model metadata available.';
    return;
  }
  const metadata = model.metadata || {};
  details.innerHTML = Object.entries(metadata).map(([key, value]) => `
    <div class="model-detail-row"><span>${escapeHtml(key)}</span><code>${escapeHtml(formatModelValue(value))}</code></div>
  `).join('') || 'No metadata returned by provider.';
}

function formatModelValue(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

async function loadModels() {
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');
  if (!providerSelect || !modelSelect) return;
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    availableModels = data.models || [];
    const providers = [...new Set(availableModels.map(model => model.provider))];
    providerSelect.innerHTML = providers.map(provider => `<option value="${escapeHtml(provider)}">${escapeHtml(provider)}</option>`).join('');
    updateProviderModels();
    if (!providers.length) {
      providerSelect.innerHTML = '<option value="">No configured providers</option>';
      modelSelect.innerHTML = '<option value="">No available models</option>';
    }
  } catch (err) {
    providerSelect.innerHTML = '<option value="">Model discovery failed</option>';
    modelSelect.innerHTML = '<option value="">No available models</option>';
    console.error('Failed to load models:', err);
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
  const providerSelect = document.getElementById('providerSelect');

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
  if (providerSelect) providerSelect.addEventListener('change', updateProviderModels);
  const modelSelect = document.getElementById('modelSelect');
  if (modelSelect) modelSelect.addEventListener('change', renderModelDetails);
  updateProviderModels();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatListeners);
} else {
  initChatListeners();
}

loadManifests();
loadPrompts();
loadModels();
document.getElementById('chatSearch')?.addEventListener('input', loadChats);
