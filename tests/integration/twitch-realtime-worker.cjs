// A fresh Node process starts the production PollRuntime against a disposable
// schema and an in-memory Twitch server; no credentials or endpoints are real.
const {PrismaClient} = require('@prisma/client');
const {TwitchApi} = require('../../dist/modules/level38/twitch/api');
const {NativeTwitchPolls} = require('../../dist/modules/level38/twitch/polls');
const {Level38Service} = require('../../dist/modules/level38/service');
const {PollRuntime} = require('../../dist/modules/level38/poll-runtime');
const {fakeTwitch} = require('../twitch-fake.cjs');
const {setTimeout:delay} = require('node:timers/promises');

async function main() {
  let input='';for await(const chunk of process.stdin) input+=chunk;
  const {databaseUrl,cfg,remote,votes}=JSON.parse(input), url=new URL(databaseUrl);
  if(!/test/i.test(url.pathname)||!/^level38_test_[a-f0-9]{32}$/.test(url.searchParams.get('schema'))) throw new Error('Disposable test schema required');
  const db=new PrismaClient({datasources:{db:{url:databaseUrl}}}),fake=fakeTwitch();fake.polls=[remote];
  const api=new TwitchApi(cfg,fake.fetch);let runtime;
  const native=new NativeTwitchPolls(db,api,cfg,state=>runtime?.update(state));
  const service=new Level38Service(db);service.setNativePolls(native);runtime=new PollRuntime(service);
  const started=Date.now();let timer;
  try {
    runtime.start();
    timer=setTimeout(()=>fake.polls[0].choices.forEach((choice,index)=>choice.votes=votes[index]),1000);
    while(Date.now()-started<8500) {
      const state=await service.state(), poll=state.polls.find(item=>item.source==='TWITCH'&&item.status==='OPEN');
      if(poll?.totalVotes===votes.reduce((a,b)=>a+b,0)) {
        process.stdout.write(JSON.stringify({totalVotes:poll.totalVotes,status:poll.status,elapsedMs:Date.now()-started,gets:fake.pollCalls.filter(call=>call.method==='GET').length}));return;
      }
      await delay(100);
    }
    throw new Error('Fresh process did not resume native synchronization');
  } finally {clearTimeout(timer);await runtime.close();await native.close();api.close();await db.$disconnect();}
}
main().catch(()=>{process.stderr.write('Disposable native runtime worker failed.');process.exitCode=1;});
