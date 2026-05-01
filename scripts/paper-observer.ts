import {
  buildPaperObserverCliOptions,
  renderPaperObserverCycleSummary,
  runPaperObserverCycle,
  sleep,
} from '../src/operator/paper-observer-runtime';

async function main() {
  const options = buildPaperObserverCliOptions(process.argv.slice(2));
  const totalCycles = options.once ? 1 : options.cycles;

  let completedCycles = 0;

  do {
    const cycle = await runPaperObserverCycle(options);
    console.log(renderPaperObserverCycleSummary(cycle));
    completedCycles += 1;

    const shouldStop = options.once || (typeof totalCycles === 'number' && completedCycles >= totalCycles);
    if (shouldStop) {
      break;
    }

    await sleep(options.intervalMs);
  } while (true);
}

main().catch((error) => {
  console.error('[paper-observer] fatal', error);
  process.exitCode = 1;
});
