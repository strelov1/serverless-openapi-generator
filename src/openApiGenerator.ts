import { OpenAPIV3 } from 'openapi-types';
import Serverless from 'serverless';
import { clone } from './utils';

type OpenAPIV3CustomDocumentation = {
  openapi: string;
  info: OpenAPIV3.InfoObject;
  servers?: OpenAPIV3.ServerObject[];
  components?: OpenAPIV3.ComponentsObject;
  security?: OpenAPIV3.SecurityRequirementObject[];
  tags?: OpenAPIV3.TagObject[];
  externalDocs?: OpenAPIV3.ExternalDocumentationObject;
};

export default class OpenApiGenerator {
  public definition: OpenAPIV3.Document;

  /**
   * Constructor
   * @param schema The intial OpenAPI schema
   */
  constructor(schema: OpenAPIV3CustomDocumentation) {
    const { openapi, info, servers = [], components, security = [], tags, externalDocs } = schema;

    this.definition = {
      openapi,
      info,
      paths: {},
    };

    if (servers) this.definition.servers = servers;
    if (components) this.definition.components = components;
    if (security) this.definition.security = security;
    if (tags) this.definition.tags = tags;
    if (externalDocs) this.definition.externalDocs = externalDocs;
  }

  /**
   * Parses through all children of the Components filed
   * @param components An OpenAPI Components Object
   */
  public parseComponents(components: OpenAPIV3.ComponentsObject): void {
    // Parse Schema Objects
    if (components.schemas) {
      const schemaComponents: { [key: string]: OpenAPIV3.SchemaObject } = {};
      const schemas = components.schemas;

      Object.keys(schemas).map((key) => {
        schemaComponents[key] = this.cleanSchema(schemas[key]);
      });

      this.definition.components = {
        ...this.definition.components,
        schemas: { ...schemaComponents },
      };
    }
  }

  /**
   * Parses through all children of the Functions field
   * @param functions An OpenAPI Components Object
   */
  public parseFunctions(functions: { [key: string]: Serverless.FunctionDefinitionHandler }): void {
    const paths: OpenAPIV3.PathsObject = {};

    Object.keys(functions).map((key) => {
      const httpEvents = functions[key].events
        .filter((event) => !!(event as any).http?.openapi)
        .map((event) => (event as any).http as ServerlessOpenapiGenerator.HttpFunctionEvent);

      httpEvents.map((event) => {
        const {
          summary,
          description,
          tags,
          externalDocs,
          operationId,
          parameters,
          requestBody,
          responses,
          callbacks,
          deprecated,
          security,
          servers,
        } = event.openapi;

        const pathOperation: OpenAPIV3.OperationObject = {};

        if (summary) pathOperation.summary = summary;
        if (description) pathOperation.description = description;
        if (tags) pathOperation.tags = tags;
        if (externalDocs) pathOperation.externalDocs = externalDocs;
        if (parameters) pathOperation.parameters = parameters;
        if (requestBody) pathOperation.requestBody = requestBody;
        if (callbacks) pathOperation.callbacks = callbacks;
        if (deprecated) pathOperation.deprecated = deprecated;
        if (operationId) pathOperation.operationId = operationId;
        if (security) pathOperation.security = security;
        if (servers) pathOperation.servers = servers;
        if (responses) pathOperation.responses = responses;

        paths[event.path] = {
          ...paths[event.path],
          [event.method]: pathOperation,
        };
      });
    });

    this.definition.paths = paths;
  }

  /**
   * Cleans schema objects to make them OpenAPI compatible
   * @param schema JSON schema object
   * @returns Cleaned JSON schema object
   */
  private cleanSchema(schema: { [key: string]: any }) {
    const cleanedSchema = clone(schema);

    if (cleanedSchema.$schema) delete cleanedSchema.$schema;

    return cleanedSchema;
  }
}
