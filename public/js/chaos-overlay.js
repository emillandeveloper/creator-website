(() => {
  'use strict';
  const card = document.getElementById('chaos-alert');
  const type = document.getElementById('chaos-type');
  const test = document.getElementById('chaos-test');
  const name = document.getElementById('chaos-reward');
  const viewer = document.getElementById('chaos-viewer');
  let lastId = null;

  async function update() {
    try {
      const response = await fetch('/chaos/api/latest', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable');
      const { event } = await response.json();
      if (!event || Date.now() - Date.parse(event.occurredAt) > 10_000) { card.hidden = true; return; }
      if (lastId === event.id) return;
      lastId = event.id;
      card.className = 'chaos-alert ' + (['help', 'sabotage', 'random'].includes(event.category) ? event.category : '');
      type.textContent = event.category === 'help' ? 'AYUDA' : event.category === 'sabotage' ? 'SABOTAJE' : 'RULETA DEL CAOS';
      test.hidden = event.source !== 'TEST' && event.source !== 'LOCAL';
      name.textContent = event.name;
      viewer.textContent = event.viewer + ' ha activado este efecto';
      card.hidden = false;
    } catch { card.hidden = true; }
  }
  update();
  setInterval(update, 1200);
})();
