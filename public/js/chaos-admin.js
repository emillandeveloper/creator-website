(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);

  function message(value, error = false) {
    const node = byId('admin-message');
    node.textContent = value;
    node.dataset.error = String(error);
    node.hidden = false;
  }

  async function api(path, body) {
    const response = await fetch('/admin/api/chaos/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Catalog-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se ha podido completar la operación.');
    return result;
  }

  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  function renderActivity(events) {
    const list = byId('chaos-activity');
    list.replaceChildren();
    if (!events.length) { list.append(element('li', '', 'Todavía no hay pruebas.')); return; }
    events.forEach((event) => {
      const item = element('li', '', event.viewer + ' · ' + event.rewardId);
      item.append(element('small', '', (event.source === 'TEST' ? 'Simulación' : event.status) + ' · ' + new Date(event.occurredAt).toLocaleTimeString('es-ES')));
      list.append(item);
    });
  }

  function renderReward(reward) {
    const card = element('article', 'chaos-reward');
    const heading = element('div', 'chaos-reward-head');
    const info = element('div');
    info.append(element('h3', '', reward.name), element('p', '', reward.description));
    heading.append(info, element('span', 'chaos-tag ' + reward.category, reward.category === 'help' ? 'Ayuda' : reward.category === 'sabotage' ? 'Sabotaje' : 'Aleatorio'));
    card.append(heading);

    const fields = element('div', 'chaos-reward-fields');
    function numberField(label, value, min, max) {
      const wrapper = element('label', '', label);
      const input = element('input');
      input.type = 'number'; input.min = String(min); input.max = String(max); input.step = '1'; input.required = true; input.value = String(value);
      wrapper.append(input);
      return { wrapper, input };
    }
    const cost = numberField('Puntos', reward.cost, 1, 1000000);
    const cooldown = numberField('Cooldown (segundos)', reward.cooldownSeconds, 0, 3600);
    const toggle = element('label', 'admin-check chaos-enabled');
    const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = reward.enabled;
    toggle.append(checkbox, document.createTextNode(' Preparada para Twitch'));
    fields.append(cost.wrapper, cooldown.wrapper, toggle);
    card.append(fields);

    const actions = element('div', 'chaos-reward-actions');
    const test = element('button', 'admin-secondary', 'Probar overlay'); test.type = 'button';
    const agentTest = element('button', 'admin-secondary', 'Probar en PC');
    agentTest.type = 'button'; agentTest.dataset.agentTest = '1'; agentTest.disabled = true;
    const save = element('button', 'admin-primary', 'Guardar'); save.type = 'button';
    actions.append(test, agentTest, save); card.append(actions);
    const run = async (button, operation) => {
      button.disabled = true;
      try { await operation(); } catch (error) { message(error.message, true); } finally { button.disabled = false; }
    };
    save.addEventListener('click', () => run(save, async () => {
      await api('rewards/' + encodeURIComponent(reward.id), {
        cost: Number(cost.input.value), cooldownSeconds: Number(cooldown.input.value), enabled: checkbox.checked,
      });
      message('Configuración de «' + reward.name + '» guardada. Los canjes reales siguen desactivados.');
    }));
    test.addEventListener('click', () => run(test, async () => {
      await api('test/' + encodeURIComponent(reward.id), {});
      message('Prueba enviada al overlay: ' + reward.name + '.');
      renderActivity((await api('state')).activity);
    }));
    agentTest.addEventListener('click', () => run(agentTest, async () => {
      await api('agent/test/' + encodeURIComponent(reward.id), {});
      message('Orden de prueba enviada al PC. El conector la confirmará sin modificar FFX.');
    }));
    return card;
  }

  async function refreshAgent() {
    try {
      const state = await api('agent/status');
      byId('chaos-agent-status').textContent = !state.paired ? 'Sin vincular' : !state.connected ? 'Vinculado · PC desconectado' : state.gameRunning ? 'Conectado · FFX.exe detectado' : 'Conectado · esperando a FFX.exe';
      byId('chaos-game').textContent = state.gameRunning ? 'FFX: ejecutándose' : 'FFX: sin detectar';
      document.querySelectorAll('[data-agent-test]').forEach(button => { button.disabled = !state.connected; });
    } catch (error) { byId('chaos-agent-status').textContent = 'Conexión no disponible'; }
  }

  async function load() {
    try {
      const state = await api('state');
      byId('chaos-twitch').textContent = state.twitchConnected ? 'Twitch: conectado' : 'Twitch: pendiente';
      byId('chaos-game').textContent = state.gameConnected ? 'Juego: conectado' : 'Juego: pendiente';
      const list = byId('chaos-rewards'); list.replaceChildren(...state.rewards.map(renderReward));
      renderActivity(state.activity);
      await refreshAgent();
    } catch (error) { message(error.message, true); }
  }
  byId('chaos-pair').addEventListener('click', async () => {
    if (!window.confirm('Se invalidará cualquier clave de conector anterior. ¿Continuar?')) return;
    const button = byId('chaos-pair'); button.disabled = true;
    try {
      const { token } = await api('agent/pair', {});
      byId('chaos-token').value = token;
      byId('chaos-pair-result').hidden = false;
      message('Clave generada. Cópiala en tu PC; solo se mostrará ahora.');
      await refreshAgent();
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
  byId('chaos-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(byId('chaos-token').value); message('Clave copiada. Pégala únicamente en tu PC.'); }
    catch { byId('chaos-token').select(); message('Selecciona y copia la clave manualmente.'); }
  });
  byId('chaos-logout').addEventListener('click', async () => {
    try {
      const response = await fetch('/admin/api/logout', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Catalog-Request': '1' }, body: '{}' });
      if (!response.ok) throw new Error('No se ha podido cerrar la sesión.');
      window.location.assign('/admin');
    } catch (error) { message(error.message, true); }
  });
  load();
  setInterval(refreshAgent, 5000);
})();
