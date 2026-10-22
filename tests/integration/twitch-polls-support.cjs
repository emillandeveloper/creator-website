const assert = require('node:assert/strict');
const { setup } = require('./twitch-support.cjs');
const { signed } = require('../twitch-fake.cjs');

const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data; };
async function nativeFixture(t, overrides = {}) {
  const f = await setup(t, { nativePolls: true, ...overrides });
  await f.twitch.run('ensure');
  f.op = async (route, body) => f.call(`/api/control/${route}`, { ...body, controlRevision: await f.revision() }, f.owner.cookie);
  f.statePoll = async id => (await f.service.state(true)).polls.find(poll => poll.id === id);
  f.dbPoll = id => f.db.poll.findUniqueOrThrow({ where: { id }, include: { options: { orderBy: { position: 'asc' } } } });
  f.create = async input => {
    ok(await f.op('polls', { title: 'A native Twitch poll', type: 'CUSTOM', options: [{ label: 'First choice' }, { label: 'Second choice' }], durationSeconds: 60, ...input }));
    return f.db.poll.findFirstOrThrow({ orderBy: { number: 'desc' }, include: { options: { orderBy: { position: 'asc' } } } });
  };
  f.sendPoll = async (type, upstream, { votes, status, at, id } = {}) => {
    if (votes) upstream.choices.forEach((choice, index) => { choice.votes = votes[index]; });
    const final = type === 'channel.poll.end';
    const event = { id: upstream.id, broadcaster_user_id: '1234', broadcaster_user_login: 'leonifelheim', broadcaster_user_name: 'LeoNifelheim',
      title: upstream.title, choices: upstream.choices.map(choice => ({ ...choice })), started_at: upstream.started_at,
      ...(final ? { ended_at: at || new Date().toISOString(), status: status || 'completed' } : { ends_at: upstream.ends_at }),
      channel_points_voting: { is_enabled: false, amount_per_vote: 0 }, bits_voting: { is_enabled: false, amount_per_vote: 0 } };
    if (final) Object.assign(upstream, { status: (status || 'completed').toUpperCase(), ended_at: event.ended_at });
    const body = { subscription: { id: `test-${type}`, type, version: '1', status: 'enabled', condition: { broadcaster_user_id: '1234' }, transport: { method: 'webhook', callback: f.cfg.callback } }, event };
    const message = signed(body, { ...(at ? { at } : {}), ...(id ? { id } : {}) });
    const response = await f.webhook(message);
    return { status: response.status, message, event };
  };
  return f;
}
module.exports = { nativeFixture, ok };
