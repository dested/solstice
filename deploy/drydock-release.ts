/** Build once through Drydock, then run the same immutable image as independent
 * game and bot ECS services. --bots-only reuses the current game image. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const drydock = resolve(process.env.DRYDOCK_DIR || '../drydock');
const load = (file: string) => import(pathToFileURL(resolve(drydock, file)).href);
const { aws } = await load('server/aws/clients.ts');
const { getProject } = await load('server/store.ts');
const { registerTaskDef } = await load('server/aws/projects.ts');
const { startLocalDeploy, localDeployStatus } = await load('server/aws/deploy-local.ts');
const { DescribeServicesCommand, DescribeTaskDefinitionCommand, UpdateServiceCommand, waitUntilServicesStable } = await load('node_modules/@aws-sdk/client-ecs/dist-cjs/index.js');
const client = aws();
let image: string;
if (process.argv.includes('--bots-only')) {
  const service = await client.ecs.send(new DescribeServicesCommand({cluster: 'drydock', services: ['drydock-solstice']}));
  const def = await client.ecs.send(new DescribeTaskDefinitionCommand({taskDefinition: service.services[0].taskDefinition}));
  image = def.taskDefinition.containerDefinitions[0].image;
} else {
  startLocalDeploy('solstice');
  let previous = '';
  while (true) {
    const job = localDeployStatus('solstice');
    const current = job.steps.find((step: {status: string}) => step.status === 'running');
    const progress = current ? `${current.name}: ${current.detail || ''}` : 'Finalizing';
    if (progress !== previous) { console.log(progress); previous = progress; }
    if (!job.running) {
      if (job.error) throw new Error(job.error);
      image = job.image;
      break;
    }
    await Bun.sleep(5000);
  }
}
const botDef = await registerTaskDef(getProject('solstice-bots'), image);
await client.ecs.send(new UpdateServiceCommand({cluster:'drydock',service:'drydock-solstice-bots',taskDefinition:botDef,desiredCount:1,forceNewDeployment:true}));
console.log('Bot worker is deploying the game release image.');
await waitUntilServicesStable({client:client.ecs,maxWaitTime:900},{cluster:'drydock',services:['drydock-solstice','drydock-solstice-bots']});
const final = await client.ecs.send(new DescribeServicesCommand({cluster:'drydock',services:['drydock-solstice','drydock-solstice-bots']}));
for (const service of final.services) {
  const def = await client.ecs.send(new DescribeTaskDefinitionCommand({taskDefinition:service.taskDefinition}));
  if (def.taskDefinition.containerDefinitions[0].image !== image || service.runningCount < 1) throw new Error(`${service.serviceName} rolled back or did not start`);
}
const response = await fetch('https://solstice.dested.com/healthz');
if (!response.ok) throw new Error(`Public game health failed: ${response.status}`);
console.log(`Live release: ${image}`);
console.log(await response.text());
