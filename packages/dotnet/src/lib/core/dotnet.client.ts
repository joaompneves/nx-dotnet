import { ChildProcess, spawn, spawnSync } from 'child_process';
import * as semver from 'semver';

import { getSpawnParameterArray, swapKeysUsingMap } from '@nx-dotnet/utils';

import {
  addPackageKeyMap,
  buildKeyMap,
  dotnetAddPackageOptions,
  dotnetBuildOptions,
  dotnetFormatOptions,
  dotnetNewOptions,
  dotnetPublishOptions,
  dotnetRunOptions,
  DotnetTemplate,
  dotnetTestOptions,
  formatKeyMap,
  KnownDotnetTemplates,
  newKeyMap,
  publishKeyMap,
  runKeyMap,
  testKeyMap,
} from '../models';
import { parseDotnetNewListOutput } from '../utils/parse-dotnet-new-list-output';
import { LoadedCLI } from './dotnet.factory';

export class DotNetClient {
  constructor(private cliCommand: LoadedCLI, public cwd?: string) {}

  new(template: KnownDotnetTemplates, parameters?: dotnetNewOptions): void {
    const params = [`new`, template];
    if (parameters) {
      parameters = swapKeysUsingMap(parameters, newKeyMap);
      params.push(...getSpawnParameterArray(parameters));
    }
    return this.logAndExecute(params);
  }

  listInstalledTemplates(opts?: {
    search?: string;
    language?: string;
  }): DotnetTemplate[] {
    const version = this.getSdkVersion();
    const params: string[] = ['new'];
    if (semver.lt(version, '6.0.100') && opts?.search) {
      params.push(opts.search);
    }
    if (semver.gte(version, '7.0.100')) {
      params.push('list');
    } else {
      params.push('--list');
    }
    if (semver.gte(version, '6.0.100') && opts?.search) {
      params.push(opts.search);
    }
    if (opts?.language) {
      params.push('--language', opts.language);
    }
    const output = this.spawnAndGetOutput(params);
    return parseDotnetNewListOutput(output);
  }

  build(
    project: string,
    parameters?: dotnetBuildOptions,
    extraParameters?: string,
  ): void {
    const params = [`build`, project];
    if (parameters) {
      parameters = swapKeysUsingMap(parameters, buildKeyMap);
      params.push(...getSpawnParameterArray(parameters));
    }
    if (extraParameters) {
      const matches = extraParameters.match(EXTRA_PARAMS_REGEX);
      params.push(...(matches as string[]));
    }
    return this.logAndExecute(params);
  }

  run(
    project: string,
    watch = false,
    parameters?: dotnetRunOptions,
  ): ChildProcess {
    const params = watch
      ? [`watch`, `--project`, project, `run`]
      : [`run`, `--project`, project];
    if (parameters) {
      parameters = swapKeysUsingMap(parameters, runKeyMap);
      params.push(...getSpawnParameterArray(parameters));
    }

    return this.logAndSpawn(params);
  }

  test(
    project: string,
    watch?: boolean,
    parameters?: dotnetTestOptions,
    extraParameters?: string,
  ): void | ChildProcess {
    const params = watch
      ? [`watch`, `--project`, project, `test`]
      : [`test`, project];

    if (parameters) {
      parameters = swapKeysUsingMap(parameters, testKeyMap);
      params.push(...getSpawnParameterArray(parameters));
    }
    if (extraParameters) {
      const matches = extraParameters.match(EXTRA_PARAMS_REGEX);
      params.push(...(matches as string[]));
    }
    if (!watch) {
      return this.logAndExecute(params);
    } else {
      return this.logAndSpawn(params);
    }
  }

  addPackageReference(
    project: string,
    pkg: string,
    parameters?: dotnetAddPackageOptions,
  ): void {
    const params = [`add`, project, `package`, pkg];
    if (parameters) {
      parameters = swapKeysUsingMap(parameters, addPackageKeyMap);
      params.push(...getSpawnParameterArray(parameters));
    }
    return this.logAndExecute(params);
  }

  addProjectReference(hostCsProj: string, targetCsProj: string): void {
    return this.logAndExecute([`add`, hostCsProj, `reference`, targetCsProj]);
  }

  publish(
    project: string,
    parameters?: dotnetPublishOptions,
    publishProfile?: string,
    extraParameters?: string,
  ): void {
    const params = [`publish`, `"${project}"`];
    if (parameters) {
      parameters = swapKeysUsingMap(parameters, publishKeyMap);
      params.push(...getSpawnParameterArray(parameters));
    }
    if (publishProfile) {
      params.push(`-p:PublishProfile=${publishProfile}`);
    }
    if (extraParameters) {
      const matches = extraParameters.match(EXTRA_PARAMS_REGEX);
      params.push(...(matches as string[]));
    }
    return this.logAndExecute(params);
  }

  installTool(tool: string, version?: string, source?: string): void {
    const cmd = [`tool`, `install`, tool];
    if (version) {
      cmd.push('--version', version);
    }
    if (source) {
      cmd.push('--add-source', source);
    }
    return this.logAndExecute(cmd);
  }

  restorePackages(project: string): void {
    const cmd = [`restore`, project];
    return this.logAndExecute(cmd);
  }

  restoreTools(): void {
    const cmd = [`tool`, `restore`];
    return this.logAndExecute(cmd);
  }

  format(
    project: string,
    parameters?: dotnetFormatOptions,
    forceToolUsage?: boolean,
  ): void {
    const params = forceToolUsage
      ? ['tool', 'run', 'dotnet-format', '--']
      : [`format`];
    if (
      semver.major(this.getSdkVersion()) >= 6 &&
      (parameters?.fixWhitespace !== undefined ||
        parameters?.fixStyle !== undefined ||
        parameters?.fixAnalyzers !== undefined)
    ) {
      // The handling of these 3 options changed in .NET 6.
      // Now, we need to run the command separately for each option that isn't disabled
      // if any of them were disabled or modified.
      const whitespace = parameters.fixWhitespace;
      const style = parameters.fixStyle;
      const analyzers = parameters.fixAnalyzers;
      delete parameters.fixWhitespace;
      delete parameters.fixStyle;
      delete parameters.fixAnalyzers;

      if (whitespace !== false) {
        const subcommandParams = [...params, 'whitespace', project];
        const subcommandParameterObject = {
          ...parameters,
        };
        delete subcommandParameterObject.fixWhitespace;
        subcommandParams.push(
          ...getSpawnParameterArray(subcommandParameterObject),
        );
        this.logAndExecute(subcommandParams);
      }
      if (style !== false) {
        const subcommandParams = [...params, 'style', project];
        const subcommandParameterObject: dotnetFormatOptions & {
          severity?: string;
        } = {
          ...parameters,
        };
        if (typeof style === 'string') {
          subcommandParameterObject.severity = style;
        }
        delete subcommandParameterObject.fixStyle;
        subcommandParams.push(
          ...getSpawnParameterArray(subcommandParameterObject),
        );
        this.logAndExecute(subcommandParams);
      }
      if (analyzers !== false) {
        const subcommandParams = [...params, 'analyzers', project];
        const subcommandParameterObject: dotnetFormatOptions & {
          severity?: string;
        } = {
          ...parameters,
        };
        if (typeof analyzers === 'string') {
          subcommandParameterObject.severity = analyzers;
        }
        delete subcommandParameterObject.fixAnalyzers;
        subcommandParams.push(
          ...getSpawnParameterArray(subcommandParameterObject),
        );
        this.logAndExecute(subcommandParams);
      }
    } else {
      params.push(project);
      if (parameters) {
        parameters = swapKeysUsingMap(parameters, formatKeyMap);
        params.push(...getSpawnParameterArray(parameters));
      }
      return this.logAndExecute(params);
    }
  }

  runTool<T extends Record<string, string | boolean>>(
    tool: string,
    positionalParameters?: string[],
    parameters?: T,
    extraParameters?: string,
  ) {
    const params = ['tool', 'run', tool];

    if (positionalParameters) {
      params.push(...positionalParameters);
    }

    if (parameters) {
      params.push(...getSpawnParameterArray(parameters));
    }

    if (extraParameters) {
      const matches = extraParameters.match(EXTRA_PARAMS_REGEX);
      params.push(...(matches as string[]));
    }

    return this.logAndExecute(params);
  }

  addProjectToSolution(solutionFile: string, project: string) {
    const params = [`sln`, solutionFile, `add`, project];
    this.logAndExecute(params);
  }

  getSdkVersion(): string {
    return this.cliCommand.info.version.toString();
  }

  printSdkVersion(): void {
    this.logAndExecute(['--version']);
  }

  public logAndExecute(params: string[]): void {
    params = params.map((param) =>
      param.replace(/\$(\w+)/, (_, varName) => process.env[varName] ?? ''),
    );

    const cmd = `${this.cliCommand.command} "${params.join('" "')}"`;
    console.log(`Executing Command: ${cmd}`);

    const res = spawnSync(this.cliCommand.command, params, {
      cwd: this.cwd || process.cwd(),
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      throw new Error(`dotnet execution returned status code ${res.status}`);
    }
  }

  private spawnAndGetOutput(params: string[]): string {
    params = params.map((param) =>
      param.replace(/\$(\w+)/, (_, varName) => process.env[varName] ?? ''),
    );

    const res = spawnSync(this.cliCommand.command, params, {
      cwd: this.cwd || process.cwd(),
      stdio: 'pipe',
    });
    if (res.status !== 0) {
      throw new Error(
        `dotnet execution returned status code ${res.status} \n ${res.stderr}`,
      );
    }
    return res.stdout.toString();
  }

  private logAndSpawn(params: string[]): ChildProcess {
    console.log(
      `Executing Command: ${this.cliCommand.command} "${params.join('" "')}"`,
    );
    return spawn(this.cliCommand.command, params, {
      stdio: 'inherit',
      cwd: this.cwd || process.cwd(),
    });
  }
}

/**
 * Regular Expression for Parsing Extra Params before sending to spawn / exec
 * First part of expression matches parameters such as --flag="my answer"
 * Second part of expression matches parameters such as --flag=my_answer
 */
const EXTRA_PARAMS_REGEX = /\S*".+?"|\S+/g;
