import { createCliProgram } from './program';

export { createCliProgram, type CliProgramOptions } from './program';

export async function main(
  argv: string[] = process.argv,
  program = createCliProgram(),
): Promise<void> {
  await program.parseAsync(argv);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
