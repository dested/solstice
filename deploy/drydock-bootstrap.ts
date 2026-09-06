/** Run with Bun from this repository. Uses the sibling Drydock portal's configured
 * AWS profile and APIs; no credentials or generated secrets are written to disk.
 * Local-only projects deliberately skip GitHub wiring. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const drydock = resolve(process.env.DRYDOCK_DIR || '../drydock');
const load = (file: string) => import(pathToFileURL(resolve(drydock, file)).href);
const { aws, ignore, randomSecret } = await load('server/aws/clients.ts');
const { getProject, saveProject, getPlatform, setLocalRepoPath } = await load('server/store.ts');
const { defaultProjectConfig, registerTaskDef, listSsmEnv, putSsmEnv } = await load('server/aws/projects.ts');
const { ensureLogGroup, ensureService, logConfig } = await load('server/aws/system-services.ts');
const { syncProjectDns } = await load('server/aws/dns.ts');
const { N } = await load('server/aws/names.ts');
const { CreateRepositoryCommand, PutLifecyclePolicyCommand } = await load('node_modules/@aws-sdk/client-ecr/dist-cjs/index.js');
const { RegisterTaskDefinitionCommand, DescribeServicesCommand } = await load('node_modules/@aws-sdk/client-ecs/dist-cjs/index.js');
const client = aws();
const platform = getPlatform();
if (!platform.accountId || !platform.instanceId) throw new Error('Drydock platform must already exist');
const oldGameEnv = await listSsmEnv('solstice');
const oldRedisEnv = await listSsmEnv('solstice-redis');
const botSecret = oldGameEnv.BOT_SECRET || randomSecret(32);
const redisSecret = oldRedisEnv.REDIS_PASSWORD || randomSecret(32);
await putSsmEnv('solstice-redis', 'REDIS_PASSWORD', redisSecret);
await ensureLogGroup('/drydock/solstice-redis');
const existingRedis = await client.ecs.send(new DescribeServicesCommand({cluster:N.cluster,services:['drydock-solstice-redis']}));
// Re-running app bootstrap must not restart Redis beneath occupied universes.
if (!existingRedis.services?.some((service: {status: string}) => service.status !== 'INACTIVE')) {
const redisDef = await client.ecs.send(new RegisterTaskDefinitionCommand({
  family: 'drydock-solstice-redis', requiresCompatibilities: ['EC2'], networkMode: 'bridge',
  executionRoleArn: `arn:aws:iam::${platform.accountId}:role/${N.taskExecutionRole}`,
  containerDefinitions: [{ name: 'redis', image: 'public.ecr.aws/docker/library/redis:7-alpine',
    essential: true, memoryReservation: 64, memory: 256,
    portMappings: [{ containerPort: 6379, hostPort: 16379, protocol: 'tcp' }],
    secrets: [{name: 'REDIS_PASSWORD', valueFrom: `arn:aws:ssm:${client.region}:${platform.accountId}:parameter/drydock/solstice-redis/REDIS_PASSWORD`}],
    command: ['sh', '-c', 'exec redis-server --requirepass "$REDIS_PASSWORD" --appendonly no --save "" --maxmemory 192mb --maxmemory-policy noeviction'],
    logConfiguration: logConfig('/drydock/solstice-redis') }],
}));
await ensureService('drydock-solstice-redis', redisDef.taskDefinition.taskDefinitionArn, 1);
}
for (const name of ['solstice', 'solstice-bots']) {
  const bots = name.endsWith('-bots');
  const config = { ...defaultProjectConfig(name, ''), prisma: false, database: false,
    glibc: true, port: bots ? 2568 : 2567, healthPath: '/healthz', size: bots ? 's' : 'l',
    domains: bots ? [] : ['solstice.dested.com'], dnsZone: bots ? '' : 'dested.com',
    buildCommand: 'bun run build', startCommand: bots ? 'bun bots/index.ts' : 'bun server/index.ts', predeployCommand: '' };
  const project = getProject(name) || {name, repo: '', createdAt: new Date().toISOString(), config};
  saveProject({...project, config});
  setLocalRepoPath(name, resolve('.'));
  await ignore(['RepositoryAlreadyExistsException'], () => client.ecr.send(new CreateRepositoryCommand({repositoryName: N.ecrRepo(name)})));
  await client.ecr.send(new PutLifecyclePolicyCommand({repositoryName:N.ecrRepo(name), lifecyclePolicyText:JSON.stringify({rules:[{rulePriority:1,description:'Keep ten local releases',selection:{tagStatus:'any',countType:'imageCountMoreThan',countNumber:10},action:{type:'expire'}}]})}));
  await ensureLogGroup(N.logGroup(name), 30);
  const env = bots ? { BOT_SECRET: botSecret, SOLSTICE_SERVICE: 'bots', GAME_SERVER_URL: 'https://solstice.dested.com', BOT_WORKER_CAPACITY: '24' }
    : { BOT_SECRET: botSecret, REDIS_URL: `redis://:${redisSecret}@172.17.0.1:16379/0`, BOT_TARGET: '6', ALLOWED_ORIGINS: 'https://solstice.dested.com', DRAIN_SECONDS: '25' };
  for (const [key, value] of Object.entries(env)) await putSsmEnv(name, key, value);
  const registered = await registerTaskDef({...project, config});
  const existing = await client.ecs.send(new DescribeServicesCommand({cluster:N.cluster,services:[N.service(name)]}));
  if (!existing.services?.some((service: {status: string}) => service.status !== 'INACTIVE')) await ensureService(N.service(name), registered, 0);
  await syncProjectDns({...project, config});
  console.log(`${name}: provisioned; environment in SSM; ready for local deploy`);
}
console.log('Redis runs on private bridge port 16379; no security-group ports were opened.');
