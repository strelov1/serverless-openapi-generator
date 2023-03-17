import Serverless from 'serverless';
import YAML from 'js-yaml';
import { writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { execSync } from "child_process";
import OpenApiGenerator from './openApiGenerator';
import path from "node:path";

type CliOptions = {
  format: string;
  output: string;
};

class ServerlessOpenapiGenerator {
  private serverless: Serverless;
  private options: Serverless.Options;

  private hooks: { [key: string]: Function };
  private commands: { [key: string]: any };

  constructor(serverless: Serverless, options: Serverless.Options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      openapi: {
        usage: 'Generate OpenAPI Documentation',
        lifecycleEvents: ['serverless'],
        options: {
          output: {
            usage: 'Output file location [default: openapi.yml|json]',
            shortcut: 'o',
            type: 'string',
          },
          format: {
            usage: 'OpenAPI file format (yml|json) [default: yml]',
            shortcut: 'f',
            type: 'string',
          },
        },
      },
    };

    this.hooks = {
      'openapi:serverless': this.generate.bind(this),
    };
  }

  /**
   * Logs a message to the Serverless console
   * @param message The message to log
   * @param options Serverless options
   * @returns
   */
  private log(message: string, options?: Serverless.LogOptions): void {
    this.serverless.cli.log(message, '', options);
  }

  /**
   * Imports configuration options from the CLI
   * @returns A configuration object
   */
  private handleCliInput(): CliOptions {
    const formats = ['yaml', 'json'];
    const defaultOutputFilename = 'openapi.def';

    const config: CliOptions = {
      format: 'yaml',
      output: `${defaultOutputFilename}.yml`,
    };

    config.format = (this.serverless.pluginManager.cliOptions as CliOptions).format || 'yaml';

    if (!formats.includes(config.format.toLowerCase()))
      throw new Error(`Invalid format option specified. Please choose either "yaml" or "json"`);

    config.output =
      (this.serverless.pluginManager.cliOptions as CliOptions).output || config.format === 'json'
        ? `${defaultOutputFilename}.json`
        : `${defaultOutputFilename}.yml`;

    return config;
  }

  /**
   * Generates an OpenAPI specification file
   */
  private async generate() {
    this.log('Generating OpenAPI specification file');

    const documentation = this.serverless.service.custom.openapi;

    // Initialize the generator with required OpenAPI fields
    if (!documentation.openapi)
      throw new Error(`You must have an "openapi" field with the target OpenAPI version.`);

    if (!documentation.info || !documentation.info.title || !documentation.info.version)
      throw new Error(`You must have an "info" field with "title" and "version" properties`);

    const generator = new OpenApiGenerator(documentation);

    if (documentation.components) generator.parseComponents(documentation.components);

    const functions = this.serverless.service.functions as {
      [key: string]: Serverless.FunctionDefinitionHandler;
    };

    generator.parseFunctions(functions);

    try {
      const cliOptions = this.handleCliInput();

      const output =
        cliOptions.format === 'yaml'
          ? YAML.dump(generator.definition)
          : JSON.stringify(generator.definition);

      const tmpDir = await mkdtemp('sls-');
      const tmpFile = tmpDir + path.sep + cliOptions.output;

      try {
        await writeFile(tmpFile, output);
        const validateCommand = `spectral lint ${tmpFile}`;
        this.log(validateCommand);
        this.log(execSync(validateCommand).toString());
      } catch (err) {
        this.log(err.message, { bold: true, color: 'red' });
      } finally {
        await unlink(tmpFile);
        await rmdir(tmpDir);
      }


      await writeFile(cliOptions.output, output);

      this.log(`OpenAPI Generation Successful. Written to file ${cliOptions.output}`, {
        color: 'green',
        bold: true,
      });
    } catch (err: any) {
      this.log(err.message, { bold: true, color: 'red' });
    }
  }
}

module.exports = ServerlessOpenapiGenerator;
