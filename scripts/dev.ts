const children = [Bun.spawn(['bun', '--watch', 'server/index.ts'], { stdio: ['inherit', 'inherit', 'inherit'] }), Bun.spawn(['bun', 'run', 'dev:client'], { stdio: ['inherit', 'inherit', 'inherit'] }), Bun.spawn(['bun', '--watch', 'bots/index.ts'], {stdio: ['inherit','inherit','inherit']})];
const stop = () => { for (const child of children) child.kill(); process.exit(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await Promise.race(children.map(c => c.exited)); stop();

export {};

