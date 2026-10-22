(function () {
  'use strict';
  const kind = document.body.dataset.overlay;
  if (!['poll', 'quest'].includes(kind)) return;
  const lang = document.body.dataset.overlayLang === 'en' ? 'en' : 'es';
  const catalog = window.Level38Translations;
  const t = (key, params) => catalog.translate(lang, key, params);
  document.title = t(kind === 'poll' ? 'LEVEL 38 — Poll overlay' : 'LEVEL 38 — Quest overlay');
  const byId = id => document.getElementById(id);
  const text = (id, value) => { const node = byId(id); if (node && node.textContent !== value) node.textContent = value; };
  const stamp = value => typeof value === 'string' ? Date.parse(value) : NaN;
  const visibleQuest = quest => quest && !quest.hidden && quest.title !== '???' && quest.status !== 'SECRET';
  const questText = (quest, field) => catalog.questText(quest, field, lang);
  let state = null, clockServer = 0, clockLocal = 0, viewKey = '', contentKey = '', fallbackTimer = 0, receiveSequence = 0;
  const now = () => clockServer + (performance.now() - clockLocal);
  function receive(next) {
    if (!next?.event || !Array.isArray(next.quests) || !Array.isArray(next.polls) || !Number.isFinite(next.serverTime)) return;
    if (state && (next.event.revision < state.event.revision || (next.event.revision === state.event.revision && next.serverTime < clockServer))) return;
    state = next; clockServer = next.serverTime; clockLocal = performance.now(); receiveSequence++;
    clearTimeout(fallbackTimer); draw();
  }
  function mode(root, key, value, id) {
    if (key !== viewKey) {
      root.hidden = !value; root.dataset.overlayMode = value || ''; root.dataset[kind === 'poll' ? 'pollId' : 'questId'] = id || ''; viewKey = key; contentKey = '';
      // A new accepted result may arrive while the previous announcement is
      // visible. Replace only decorative stars to restart their bounded CSS
      // animation once per announcement, without forcing a layout on ticks.
      if (value === 'winner' || value === 'complete') for (const star of root.querySelectorAll('.obs-pixel-star')) star.replaceWith(star.cloneNode(true));
    }
  }
  function safeOptions(poll) {
    return poll.options.filter(option => !option.questId || state.quests.some(quest => quest.id === option.questId && visibleQuest(quest)));
  }
  function optionLabel(poll, option) {
    if (!option) return '';
    const quest = option.questId && state.quests.find(item => item.id === option.questId);
    return poll.type === 'NEXT_QUEST' ? (quest ? `#${String(quest.number).padStart(2, '0')} · ${questText(quest, 'title')}` : catalog.questText({ ...option, title: option.label }, 'title', lang)) : option.label;
  }
  function drawPoll() {
    const root = byId('poll-overlay'), time = now();
    const relevant = state.polls.filter(poll => ['NEXT_QUEST', 'NEXT_GAME', 'YES_NO', 'CUSTOM'].includes(poll.type) && poll.source !== 'WEB' && !poll.cancelledAt && poll.closeReason !== 'CANCELLED');
    // A native poll stays on screen at 00:00 until Twitch supplies its definitive
    // result. Local countdowns and provisional leaders never declare a winner.
    const open = relevant.filter(poll => poll.status === 'OPEN' && (poll.source === 'TWITCH' || stamp(poll.endsAt) > time)).sort((a, b) => b.number - a.number)[0];
    const resultTime = poll => stamp(poll.winnerAcceptedAt || poll.closedAt);
    const result = relevant.filter(poll => poll.status === 'CLOSED' && (poll.source !== 'TWITCH' || poll.resultsFinal === true) &&
      (poll.effectiveWinnerId || poll.source === 'TWITCH') && time >= resultTime(poll) && time - resultTime(poll) < 10000)
      .sort((a, b) => resultTime(b) - resultTime(a) || b.number - a.number)[0];
    const poll = open || result, currentMode = open ? 'open' : result?.effectiveWinnerId ? 'winner' : result ? 'result' : '';
    const options = poll ? safeOptions(poll) : [];
    if (!poll || options.length !== poll.options.length || (result?.effectiveWinnerId && !open && !options.some(option => option.id === poll.effectiveWinnerId))) { mode(root, '', '', ''); return; }
    mode(root, `${poll.id}:${currentMode}:${poll.winnerAcceptedAt || poll.closedAt || ''}`, currentMode, poll.id);
    const dense = currentMode === 'open' && options.length >= 6;
    if (root.classList.contains('is-dense') !== dense) root.classList.toggle('is-dense', dense);
    byId('poll-live').hidden = currentMode !== 'open'; byId('poll-result').hidden = !['winner', 'result'].includes(currentMode); byId('poll-countdown').hidden = currentMode !== 'open';
    text('poll-type', t(poll.type));
    if (open) {
      const seconds = Math.max(0, Math.ceil((stamp(poll.endsAt) - time) / 1000));
      text('poll-countdown', `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
      byId('poll-countdown').classList.toggle('is-ending', seconds <= 10);
      text('poll-cta', t(seconds === 0 ? 'Waiting for final Twitch results…' : 'Vote on Twitch'));
      text('poll-channel', twitchChannel(poll.twitchUrl));
      const signature = String(receiveSequence);
      if (signature !== contentKey) {
        contentKey = signature; text('poll-title', poll.title); text('poll-total', t(poll.totalVotes === 1 ? '{count} vote' : '{count} votes', {count:poll.totalVotes}));
        const nodes = options.map((option, index) => {
          const node = document.createElement('li'); node.className = 'obs-option'; node.dataset.optionId = option.id;
          const percent = `${poll.totalVotes ? Math.round(option.votes / poll.totalVotes * 100) : 0}%`;
          node.style.setProperty('--vote-percent', percent);
          for (const [className, value] of [['obs-option-index', String(index + 1).padStart(2, '0')], ['obs-option-label', optionLabel(poll, option)]]) { const label = document.createElement('span'); label.className = className; label.textContent = value; node.append(label); }
          const tally = document.createElement('span'); tally.className = 'obs-option-tally';
          for (const [className, value] of [['obs-option-votes', String(option.votes)], ['obs-option-percent', percent]]) { const label = document.createElement('span'); label.className = className; label.textContent = value; tally.append(label); }
          node.append(tally);
          return node;
        });
        byId('poll-options').replaceChildren(...nodes);
      }
    } else {
      const hasWinner = !!poll.effectiveWinnerId;
      text('poll-winner-label', t(hasWinner ? 'WINNER CONFIRMED!' : 'TWITCH POLL FINISHED'));
      text('poll-winner', hasWinner ? optionLabel(poll, options.find(option => option.id === poll.effectiveWinnerId)) : t(poll.totalVotes === 0 ? 'No votes' : 'Tie'));
      text('poll-result-note', t(hasWinner ? 'The party has chosen. Adventure awaits!' : 'The operator will confirm the final choice.'));
    }
  }
  function twitchChannel(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.twitch.tv' && /^\/[a-z0-9_]{1,25}\/?$/i.test(url.pathname) ? `twitch.tv${url.pathname}` : 'Twitch'; }
    catch { return 'Twitch'; }
  }
  function drawQuest() {
    const root = byId('quest-overlay'), time = now();
    const recent = state.overlayQuestCompletion;
    const complete = visibleQuest(recent) && time >= stamp(recent.completedAt) && time - stamp(recent.completedAt) < 4000 ? recent : null;
    const active = visibleQuest(state.overlayActiveQuest) && state.overlayActiveQuest.status === 'ACTIVE' ? state.overlayActiveQuest : state.quests.filter(quest => visibleQuest(quest) && quest.status === 'ACTIVE').sort((a, b) => (stamp(b.updatedAt) || 0) - (stamp(a.updatedAt) || 0) || b.id.localeCompare(a.id))[0];
    const quest = complete || active, currentMode = complete ? 'complete' : active ? 'active' : '';
    if (!quest) { mode(root, '', '', ''); return; }
    mode(root, `${quest.id}:${currentMode}:${complete?.completedAt || ''}`, currentMode, quest.id);
    byId('quest-complete').hidden = !complete; byId('quest-active').hidden = !!complete;
    const signature = String(receiveSequence);
    if (signature === contentKey) return;
    contentKey = signature;
    text('quest-number', t('QUEST {number}', {number:String(quest.number).padStart(2, '0')})); text('quest-active', t('ACTIVE')); text('quest-complete-label', t('QUEST COMPLETE!'));
    text('quest-title', questText(quest, 'title')); text('quest-objective', questText(quest, 'description'));
    text('quest-game', state.games.find(game => game.id === quest.gameId)?.title || t('Between adventures'));
  }
  function draw() { if (state) (kind === 'poll' ? drawPoll : drawQuest)(); }
  if (typeof window.io !== 'function') return;
  const socket = window.io('/level38', { path:'/level38/socket.io' });
  socket.on('level38:state', receive);
  socket.on('connect', () => {
    const sequence = receiveSequence;
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(async () => {
      if (receiveSequence !== sequence) return;
      try { const response = await fetch('/level38/api/state', {cache:'no-store', credentials:'omit'}); if (response.ok) receive(await response.json()); } catch {}
    }, 2000);
  });
  const timer = setInterval(draw, 250);
  window.addEventListener('pagehide', () => { clearInterval(timer); clearTimeout(fallbackTimer); socket.disconnect(); }, {once:true});
})();
