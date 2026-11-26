/* Portal del estudiante: HTML/CSS/JS vanilla, sin CDN ni dependencias.
 * El access token y el token CSRF viven SOLO en memoria (state). */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    token: null,
    csrf: null,
    user: null,
    expiresAt: 0,
    refreshTimer: null,
    refreshing: null,
    manifest: null,
    spaces: [],
    activeSpace: null,
    sandbox: null,
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function showError(err) {
    const banner = $('errorBanner');
    const code = err?.code || 'ERROR_INESPERADO';
    const message = err?.message || 'No se pudo completar la acción.';
    const requestId = err?.requestId ? ` · requestId: ${escapeHtml(err.requestId)}` : '';
    banner.innerHTML = `<strong>${escapeHtml(code)}</strong> — ${escapeHtml(message)}${requestId}`;
    banner.hidden = false;
  }

  function clearError() {
    $('errorBanner').hidden = true;
    $('errorBanner').textContent = '';
  }

  function note(id, text, kind = '') {
    const node = $(id);
    if (!node) return;
    node.textContent = text;
    if (kind) node.dataset.kind = kind;
  }

  /** Cliente mínimo de la API con renovación automática y errores uniformes. */
  async function request(path, options = {}) {
    const { method = 'GET', body, auth = true, csrf = false, retry = true } = options;
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;
    if (csrf) {
      await ensureCsrf();
      headers['X-CSRF-Token'] = state.csrf;
    }

    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (networkError) {
      const err = new Error('No se pudo conectar con la API. Comprueba que el backend esté arrancado.');
      err.code = 'NETWORK_ERROR';
      err.requestId = null;
      throw err;
    }

    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch { /* cuerpo no JSON */ }
      const err = new Error(payload?.error?.message || `HTTP ${res.status}`);
      err.code = payload?.error?.code || `HTTP_${res.status}`;
      err.requestId = payload?.requestId || res.headers.get('x-request-id') || null;
      err.status = res.status;
      if (res.status === 401 && auth && retry && state.token) {
        const refreshed = await refreshSession({ silent: true });
        if (refreshed) return request(path, { ...options, retry: false });
      }
      throw err;
    }
    if (res.status === 204) return null;
    const contentType = res.headers.get('content-type') || '';
    return contentType.includes('json') ? res.json() : res.text();
  }

  async function ensureCsrf() {
    if (state.csrf) return;
    const payload = await request('/api/v1/auth/csrf', { auth: false });
    state.csrf = payload?.data?.csrfToken || null;
  }

  function applySession(session) {
    state.token = session.tokens.accessToken;
    state.csrf = session.csrfToken;
    state.user = session.user;
    const seconds = Number(session.tokens.expiresIn) || 900;
    state.expiresAt = Date.now() + seconds * 1000;
    if (state.refreshTimer) clearTimeout(state.refreshTimer);
    const delay = Math.max(30000, seconds * 1000 - 60000);
    state.refreshTimer = setTimeout(() => {
      void refreshSession().then((ok) => { if (ok) note('spacesHint', 'Sesión renovada automáticamente.'); });
    }, delay);
    $('userEmail').textContent = session.user?.email || 'estudiante';
  }

  function clearSession() {
    state.token = null;
    state.csrf = null;
    state.user = null;
    state.expiresAt = 0;
    state.activeSpace = null;
    state.sandbox = null;
    state.spaces = [];
    if (state.refreshTimer) clearTimeout(state.refreshTimer);
    state.refreshTimer = null;
  }

  async function refreshSession(options = {}) {
    if (state.refreshing) return state.refreshing;
    state.refreshing = (async () => {
      try {
        const payload = await request('/api/v1/auth/web/refresh', {
          method: 'POST', auth: false, csrf: true, retry: false,
        });
        applySession(payload.data);
        return true;
      } catch (err) {
        clearSession();
        if (!options.silent) showError(err);
        return false;
      } finally {
        state.refreshing = null;
      }
    })();
    return state.refreshing;
  }

  function showDashboard() {
    $('authCard').hidden = true;
    $('dashboard').hidden = false;
    $('logoutBtn').hidden = false;
  }

  function showLogin() {
    $('dashboard').hidden = true;
    $('authCard').hidden = false;
    $('logoutBtn').hidden = true;
  }

  async function enterDashboard() {
    showDashboard();
    await Promise.all([loadManifest(), loadSpaces(), loadMail()]);
    await loadScenarios();
  }

  async function downloadWithAuth(url, fileName, asTab = false) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${state.token}` },
      credentials: 'include',
    });
    if (!res.ok) {
      let payload = null;
      try { payload = await res.json(); } catch { /* ignore */ }
      const err = new Error(payload?.error?.message || `HTTP ${res.status}`);
      err.code = payload?.error?.code || `HTTP_${res.status}`;
      err.requestId = payload?.requestId || null;
      throw err;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    if (asTab) {
      window.open(objectUrl, '_blank', 'noopener');
    } else {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  async function loadManifest() {
    const payload = await request('/api/v1/portal/manifest');
    const data = payload.data;
    state.manifest = data;
    $('apiBase').textContent = data.apiBaseUrl;
    $('apiBaseInline').textContent = data.apiBaseUrl;
    $('swaggerLink').href = data.swaggerUrl;

    const collection = $('collectionLink');
    const environment = $('environmentLink');
    const guide = $('guideLink');
    collection.href = data.downloads.collection;
    environment.href = data.downloads.environment;
    guide.href = data.downloads.guide;
    // Los enlaces necesitan Bearer: un <a> normal no lo envía.
    collection.addEventListener('click', (event) => {
      event.preventDefault();
      void downloadWithAuth(collection.href, 'backend-practicas.postman_collection.json').catch(showError);
    });
    environment.addEventListener('click', (event) => {
      event.preventDefault();
      void downloadWithAuth(environment.href, 'backend-practicas.postman_environment.json').catch(showError);
    });
    guide.addEventListener('click', (event) => {
      event.preventDefault();
      void downloadWithAuth(guide.href, 'coding-challenges.md', true).catch(showError);
    });
    renderChallenges(data.challenges, data.apiBaseUrl);
  }

  function renderChallenges(challenges, apiBaseUrl) {
    const host = apiBaseUrl.replace(/\/$/, '');
    $('challengeList').innerHTML = (challenges || []).map((challenge) => {
      const examples = [
        ['curl', challenge.examples.curl],
        ['JavaScript', challenge.examples.javascript],
        ['Kotlin', challenge.examples.kotlin],
      ].map(([label, code]) => `
        <div>
          <span class="code-label">${escapeHtml(label)}</span>
          <pre><code>${escapeHtml(String(code).replaceAll('$API', host))}</code></pre>
        </div>`).join('');
      return `
        <details class="challenge">
          <summary>Nivel ${escapeHtml(challenge.level)} — ${escapeHtml(challenge.title)}</summary>
          <p class="focus">${escapeHtml(challenge.focus)}</p>
          ${examples}
        </details>`;
    }).join('');
  }

  async function loadSpaces() {
    const payload = await request('/api/v1/portal/spaces');
    const spaces = (payload.data.spaces || []).slice();
    if (state.sandbox && !spaces.some((space) => space.id === state.sandbox.id)) {
      spaces.push(state.sandbox);
    }
    state.spaces = spaces;
    if (!state.activeSpace || !spaces.some((space) => space.id === state.activeSpace.id)) {
      state.activeSpace = spaces.find((space) => space.type === 'PERSONAL') || spaces[0] || null;
    }
    renderSpaces();
  }

  function renderSpaces() {
    const list = $('spacesList');
    if (!state.spaces.length) {
      list.innerHTML = '<li class="muted">No hay espacios disponibles.</li>';
    } else {
      list.innerHTML = state.spaces.map((space) => {
        const active = state.activeSpace && space.id === state.activeSpace.id;
        const meta = `${space.type} · ${space.role}${space.readOnly ? ' · solo lectura' : ''}`;
        const expiry = space.expiresAt ? ` · expira ${escapeHtml(space.expiresAt.slice(0, 10))}` : '';
        return `
          <li class="${active ? 'active' : ''}">
            <span class="who">
              <strong>${escapeHtml(space.name)}</strong>
              <small>${escapeHtml(meta)}${expiry}</small>
              <code>${escapeHtml(space.id)}</code>
            </span>
            <button class="btn btn-small" type="button" data-space-id="${escapeHtml(space.id)}" ${active ? 'disabled' : ''}>
              ${active ? 'Activo' : 'Seleccionar'}
            </button>
          </li>`;
      }).join('');
    }

    const space = state.activeSpace;
    $('activeSpaceId').textContent = space?.id || '—';
    $('activeSpaceMeta').textContent = space ? `${space.type} · ${space.role}` : 'sin espacio';
    const demo = space?.type === 'DEMO';
    $('resetSpaceBtn').textContent = demo ? 'Restaurar datos iniciales' : 'Reiniciar espacio';
    $('resetSpaceBtn').disabled = !space || (space.readOnly && !demo);
    const supportsScenarios = space && ['PERSONAL', 'TEAM'].includes(space.type);
    if (!supportsScenarios) {
      note('spacesHint', 'Los escenarios se guardan solo en espacios personales o de equipo (con rol ADMINISTRADOR).');
    } else {
      note('spacesHint', '');
    }
  }

  function scenariosPath() {
    const space = state.activeSpace;
    if (!space) return null;
    if (space.type === 'PERSONAL') return '/api/v1/spaces/me/scenarios';
    if (space.type === 'TEAM') return `/api/v1/spaces/${encodeURIComponent(space.id)}/scenarios`;
    return null;
  }

  async function loadScenarios() {
    const definitions = state.manifest?.scenarios || [];
    const path = scenariosPath();
    if (!path) {
      $('scenarioList').innerHTML = definitions.map((scenario) => `
        <label class="scenario">
          <input type="checkbox" disabled />
          <span><code>${escapeHtml(scenario.key)}</code><small>${escapeHtml(scenario.description)}</small></span>
        </label>`).join('') || '<p class="muted">No hay escenarios disponibles.</p>';
      note('scenarioStatus', 'Selecciona tu espacio personal o un equipo para activar escenarios.');
      return;
    }
    const payload = await request(path);
    const config = payload.data.scenarios || {};
    $('scenarioList').innerHTML = definitions.map((scenario) => `
      <label class="scenario">
        <input type="checkbox" data-key="${escapeHtml(scenario.key)}" ${config[scenario.key]?.active ? 'checked' : ''} />
        <span><code>${escapeHtml(scenario.key)}</code><small>${escapeHtml(scenario.description)}</small></span>
      </label>`).join('');
    note('scenarioStatus', '');
  }

  async function loadMail() {
    const payload = await request('/api/v1/mail/me');
    const messages = payload.data.messages || [];
    $('mailList').innerHTML = messages.length
      ? messages.map((message) => `
          <li>
            <span class="who">
              <strong>${escapeHtml(message.subject)}</strong>
              <small>De ${escapeHtml(message.from)} · ${escapeHtml(message.createdAt || '')}</small>
            </span>
            <span class="tag">${message.read ? 'leído' : 'nuevo'}</span>
          </li>`).join('')
      : '<li class="muted">No tienes correos de prueba en este momento.</li>';
  }

  async function boot() {
    $('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError();
      const email = $('email').value.trim();
      const password = $('password').value;
      try {
        const payload = await request('/api/v1/auth/web/login', {
          method: 'POST', auth: false,
          body: { email, password },
        });
        applySession(payload.data);
        $('password').value = '';
        await enterDashboard();
      } catch (err) {
        showError(err);
      }
    });

    $('logoutBtn').addEventListener('click', async () => {
      try {
        await request('/api/v1/auth/web/logout', { method: 'POST', auth: false, csrf: true });
      } catch (err) {
        showError(err);
      } finally {
        clearSession();
        showLogin();
      }
    });

    $('spacesList').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-space-id]');
      if (!button) return;
      const space = state.spaces.find((item) => item.id === button.dataset.spaceId);
      if (!space) return;
      state.activeSpace = space;
      renderSpaces();
      void loadScenarios().catch(showError);
    });

    $('createSandboxBtn').addEventListener('click', async () => {
      clearError();
      try {
        const payload = await request('/api/v1/public/sandboxes', { method: 'POST' });
        const data = payload.data;
        state.sandbox = {
          id: data.spaceId, slug: data.slug, type: data.type,
          name: 'Sandbox anónimo', role: 'SANDBOX', readOnly: false,
          expiresAt: data.expiresAt || null,
        };
        state.activeSpace = state.sandbox;
        await loadSpaces();
        await loadScenarios();
        note('spacesHint', `Sandbox creado: ${data.spaceId}`);
      } catch (err) {
        showError(err);
      }
    });

    $('createTeamBtn').addEventListener('click', async () => {
      clearError();
      const name = $('teamName').value.trim();
      if (name.length < 2) {
        showError({ code: 'VALIDATION_ERROR', message: 'Escribe un nombre de al menos 2 caracteres.' });
        return;
      }
      try {
        const payload = await request('/api/v1/spaces/teams', { method: 'POST', body: { name } });
        $('teamName').value = '';
        await loadSpaces();
        state.activeSpace = state.spaces.find((space) => space.id === payload.data.id) || state.activeSpace;
        renderSpaces();
        await loadScenarios();
        note('spacesHint', `Equipo creado: ${payload.data.name}`);
      } catch (err) {
        showError(err);
      }
    });

    $('resetSpaceBtn').addEventListener('click', async () => {
      const space = state.activeSpace;
      if (!space) return;
      clearError();
      const confirmed = window.confirm(
        `Esto borrará los datos del espacio "${space.name}" (${space.id}). ¿Continuar?`,
      );
      if (!confirmed) return;
      let path;
      if (space.type === 'SANDBOX') path = `/api/v1/public/sandboxes/${encodeURIComponent(space.id)}/reset`;
      else if (space.type === 'DEMO') path = `/api/v1/public/sandboxes/${encodeURIComponent(space.slug)}/reset`;
      else if (space.type === 'TEAM') path = `/api/v1/spaces/${encodeURIComponent(space.id)}/reset`;
      else path = '/api/v1/spaces/me/reset';
      try {
        const payload = await request(path, { method: 'POST' });
        await loadSpaces();
        await loadScenarios();
        await loadMail();
        note('spacesHint', payload?.data?.message || 'Espacio reiniciado.');
      } catch (err) {
        showError(err);
      }
    });

    $('refreshMailBtn').addEventListener('click', () => { void loadMail().catch(showError); });

    $('scenarioList').addEventListener('change', async (event) => {
      const input = event.target;
      const path = scenariosPath();
      if (!input || input.type !== 'checkbox' || !input.dataset.key || !path) return;
      clearError();
      try {
        await request(path, { method: 'PATCH', body: { [input.dataset.key]: input.checked } });
        note('scenarioStatus', `${input.dataset.key} ${input.checked ? 'activado' : 'desactivado'} en este espacio.`);
      } catch (err) {
        input.checked = !input.checked;
        showError(err);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.token && state.expiresAt && Date.now() >= state.expiresAt - 30000) {
        void refreshSession();
      }
    });

    if (await refreshSession({ silent: true })) {
      await enterDashboard();
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void boot(); });
  } else {
    void boot();
  }
})();
