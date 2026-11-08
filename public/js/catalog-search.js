(() => {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const es = document.documentElement.lang === 'es';
  document.querySelectorAll('[data-catalog]').forEach(section => {
    const search = section.querySelector('[data-catalog-search]');
    const status = section.querySelector('[data-catalog-status]');
    const cards = Array.from(section.querySelectorAll('.game-card'), card => ({
      card, text: normalize(card.querySelector('.game-title').textContent + ' ' + card.querySelector('.game-desc').textContent),
    }));
    const groups = Array.from(section.querySelectorAll('.game-group'), group => ({
      group, heading: group.querySelector('.game-group-title'), title: group.querySelector('.game-group-title').textContent.split('·')[0].trim(),
    }));
    function filter() {
      const words = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
      let count = 0;
      for (const { card, text } of cards) {
        const match = (status.value === 'all' || card.dataset.status === status.value) && words.every(word => text.includes(word));
        card.hidden = !match; if (match) count++;
      }
      for (const { group, heading, title } of groups) {
        const matches = Array.from(group.querySelectorAll('.game-card')).filter(card => !card.hidden).length;
        group.hidden = matches === 0; heading.textContent = title + ' · ' + matches;
      }
      section.querySelector('[data-catalog-count]').textContent = es ? `${count} de ${cards.length} juegos` : `${count} of ${cards.length} games`;
      section.querySelector('[data-catalog-empty]').hidden = count > 0 || cards.length === 0;
      const empty = section.querySelector('.empty-state'); if (empty) empty.hidden = cards.length > 0;
    }
    search.addEventListener('input', filter); status.addEventListener('change', filter); filter();
  });
})();
