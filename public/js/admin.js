(() => {
  const byId = id => document.getElementById(id);
  const message = (text, error = false) => {
    const node = byId('admin-message'); node.textContent = text; node.hidden = false; node.dataset.error = String(error);
    if (error) node.setAttribute('role', 'alert'); else node.setAttribute('role', 'status');
  };
  async function api(path, body) {
    const response = await fetch('/admin/api/' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Catalog-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se ha podido completar la acción.');
    return result;
  }
  const login = byId('login-form');
  if (login) {
    login.addEventListener('submit', async event => {
      event.preventDefault(); const button = login.querySelector('button'); button.disabled = true;
      try { await api('login', { key: byId('access-key').value.trim() }); byId('access-key').value = ''; window.location.reload(); }
      catch (error) { message(error.message, true); button.disabled = false; }
    });
    return;
  }
  const form = byId('game-form');
  if (!form) return;
  let games = [], selected = null, objectUrl = null, loaded = false, saving = false;
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const statusNames = { playing: 'En curso', completed: 'Completado', upcoming: 'Oculto' };
  function logoStyle() {
    byId('logo-preview').style.transform = 'scale(' + byId('logo-scale').value + ')';
    byId('logo-preview').classList.toggle('logo-outline', byId('logo-outline').checked);
  }
  function preview(source) {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    byId('logo-preview').hidden = !source; byId('logo-placeholder').hidden = Boolean(source);
    if (source) byId('logo-preview').src = source; else byId('logo-preview').removeAttribute('src');
  }
  function renderList() {
    const query = normalize(byId('admin-search').value.trim());
    const list = byId('admin-games'); list.replaceChildren();
    const matches = games.filter(game => normalize(game.title).includes(query));
    byId('game-count').textContent = '(' + games.length + ')'; byId('admin-empty').hidden = matches.length > 0;
    for (const game of matches) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-game'; button.dataset.id = game.id;
      button.setAttribute('aria-pressed', String(selected?.id === game.id));
      const image = document.createElement('img'); image.src = game.cover; image.alt = ''; image.loading = 'lazy';
      const title = document.createElement('span'); title.textContent = game.title;
      const detail = document.createElement('small'); detail.textContent = (game.type === 'challenge' ? 'Challenge' : 'Playthrough') + ' · ' + statusNames[game.status];
      title.append(detail); button.append(image, title); button.addEventListener('click', () => { if (!saving) select(game); }); list.append(button);
    }
  }
  function select(game) {
    byId('admin-message').hidden = true;
    selected = game; form.reset(); byId('editor-title').textContent = game ? 'Editar juego' : 'Añadir juego';
    byId('game-title').value = game?.title ?? '';
    byId('game-type').value = game?.type ?? 'playthrough'; byId('game-status').value = game?.status ?? 'playing';
    for (const lang of ['es', 'en']) {
      byId('description-' + lang).value = game?.description[lang] ?? '';
      byId('format-' + lang).value = game?.details.format[lang] ?? '';
      byId('rules-' + lang).value = game?.details.rules.map(rule => rule[lang]).join('\n') ?? '';
      byId('outcome-' + lang).value = game?.details.outcome[lang] ?? '';
    }
    byId('logo-scale').value = game?.coverScale ?? 1; byId('logo-outline').checked = game?.coverOutline ?? false;
    byId('challenge-fields').hidden = byId('game-type').value !== 'challenge';
    byId('save-game').disabled = !loaded;
    byId('view-game').hidden = !game || game.status === 'upcoming';
    if (game) byId('view-game').href = game.type === 'challenge' ? '/challenges/' + game.challengeSlug + '?lang=es' : '/?lang=es#playthroughs';
    preview(game?.cover); logoStyle(); renderList();
  }
  byId('admin-search').addEventListener('input', renderList);
  byId('new-game').addEventListener('click', () => { if (saving) return; select(null); byId('game-title').focus(); });
  byId('logo-scale').addEventListener('input', logoStyle);
  byId('logo-outline').addEventListener('change', logoStyle);
  byId('game-type').addEventListener('change', () => { byId('challenge-fields').hidden = byId('game-type').value !== 'challenge'; });
  byId('game-logo').addEventListener('change', () => {
    const file = byId('game-logo').files[0];
    if (!file) { preview(selected?.cover); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      byId('game-logo').value = ''; preview(selected?.cover); message('Elige un PNG, JPG o WebP de hasta 5 MB.', true); return;
    }
    preview(null); objectUrl = URL.createObjectURL(file); byId('logo-preview').src = objectUrl; byId('logo-preview').hidden = false; byId('logo-placeholder').hidden = true;
  });
  byId('logout').addEventListener('click', async () => {
    try { await api('logout', {}); window.location.reload(); } catch (error) { message(error.message, true); }
  });
  const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('No se ha podido leer el logo.')); reader.readAsDataURL(file); });
  const localized = prefix => ({ es: byId(prefix + '-es').value, en: byId(prefix + '-en').value });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!loaded || saving) return;
    saving = true;
    const button = byId('save-game'); button.disabled = true; button.textContent = 'Guardando…';
    try {
      const file = byId('game-logo').files[0];
      if (!selected && !file) throw new Error('Sube el logo del juego antes de guardar.');
      const body = { title: byId('game-title').value, type: byId('game-type').value, status: byId('game-status').value,
        description: localized('description'), revision: selected?.revision ?? 0,
        coverScale: Number(byId('logo-scale').value), coverOutline: byId('logo-outline').checked,
        details: { format: localized('format'), rules: localized('rules'), outcome: localized('outcome') },
        ...(file ? { logo: await readFile(file) } : {}) };
      const { game } = await api('games' + (selected ? '/' + selected.id : ''), body);
      const index = games.findIndex(item => item.id === game.id); if (index < 0) games.push(game); else games[index] = game;
      select(game); message(game.status === 'upcoming' ? 'Juego guardado. Está oculto en la web.' : 'Juego guardado y publicado en tu web.');
    } catch (error) { message(error.message, true); }
    finally { saving = false; button.disabled = false; button.textContent = 'Guardar juego'; }
  });
  api('games').then(result => { games = result.games; loaded = true; select(null); }).catch(error => message(error.message, true));
})();
