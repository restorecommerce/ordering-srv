import {
  type CallContext,
} from 'nice-grpc-common';
import { 
  ResourcesAPIBase,
  ServiceBase,
} from '@restorecommerce/resource-base-interface';
import { type ServiceConfig } from '@restorecommerce/service-config';
import { type Logger } from '@restorecommerce/logger';
import { type DatabaseProvider } from '@restorecommerce/chassis-srv';
import { Topic } from '@restorecommerce/kafka-client';
import {
  ACSClientContext,
  AuthZAction,
  DefaultACSClientContextFactory,
  Operation,
  ResourceFactory,
  access_controlled_function,
  access_controlled_service,
  injects_meta_data,
  resolves_subject,
} from '@restorecommerce/acs-client';
import {
  DeepPartial,
  type DeleteRequest,
  DeleteResponse,
  Filter_Operation,
  Filter_ValueType,
  ReadRequest,
  type ResourceList,
  type ResourceListResponse,
  ServiceImplementation,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/resource_base.js';
import {
  type Subject,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth.js';
import { 
  type OperationStatus,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/status.js';

export async function ACSContextFactory<O extends ResourceListResponse, I extends ResourceList>(
  self: AccessControlledServiceBase<O, I>,
  request: I & DeleteRequest,
  context: any,
): Promise<ACSClientContext> {
  const ids = request.ids ?? request.items?.map((item: any) => item.id);
  const resources = await self.get(ids, request.subject, context);
  return {
    ...context,
    subject: request.subject,
    resources: [
      ...resources.items ?? [],
      ...request.items ?? [],
    ],
  };
}

export function DefaultResourceFactory<T extends ResourceList>(
  ...resourceNames: string[]
): ResourceFactory<T> {
  return async (
    self: any,
    request: T,
    context: CallContext,
  ) => (resourceNames?.length ? resourceNames : [self.name])?.map(
    resourceName => ({
      resource: resourceName,
      id: request.items?.map((item: any) => item.id)
    })
  );
}

@access_controlled_service
export class AccessControlledServiceBase<O extends ResourceListResponse, I extends ResourceList>
  extends ServiceBase<O, I>
  implements ServiceImplementation
{
  protected readonly operation_status_codes: Record<string, OperationStatus> = {
    SUCCESS: {
      code: 200,
      message: 'SUCCESS',
    },
    PARTIAL: {
      code: 400,
      message: 'Patrial executed with errors!',
    },
    LIMIT_EXHAUSTED: {
      code: 500,
      message: 'Query limit 1000 exhausted!',
    },
  };

  constructor(
    resourceName: string,
    topic: Topic,
    db: DatabaseProvider,
    cfg: ServiceConfig,
    logger?: Logger,
    enableEvents?: boolean,
    collectionName?: string,
  ) {
    collectionName ??= resourceName + 's';
    const fieldHandlers = cfg.get('fieldHandlers');
    fieldHandlers.bufferedFields = fieldHandlers.bufferedFields?.flatMap(
      (item: any) => (item: any) => typeof(item) === 'string'
        ? item
        : item.entities?.includes(collectionName)
        ? item.fields
        : item.entities
        ? []
        : item.fields
    );
    fieldHandlers.timeStampFields = fieldHandlers.timeStampFields?.flatMap(
      (item: any) => typeof(item) === 'string'
        ? item
        : item.entities?.includes(collectionName)
        ? item.fields
        : item.entities
        ? []
        : item.fields
    );
    const graph = cfg.get('graph');
    super(
      resourceName,
      topic,
      logger,
      new ResourcesAPIBase(
        db,
        collectionName,
        fieldHandlers,
        graph?.vertices?.[collectionName],
        graph?.name,
        logger,
        resourceName
      ),
      enableEvents
    );
    this.operation_status_codes = {
      ...this.operation_status_codes,
      ...cfg.get('operationStatusCodes'),
    };
  }

  /**
   * Insecure read, bypassing ACS.
   * Override this function to alter read behaviour.
   * 
   * @param request 
   * @param context 
   * @returns 
   */
  protected async insecRead(
    request: ReadRequest,
    context?: CallContext,
  ): Promise<DeepPartial<O>> {
    return await super.read(request, context);
  }

  protected async insecCreate(
    request: I,
    context?: CallContext,
  ): Promise<DeepPartial<O>> {
    return await super.create(
      request,
      context,
    );
  }

  protected async insecUpdate(
    request: I,
    context?: CallContext,
  ): Promise<DeepPartial<O>> {
    return await super.update(
      request,
      context,
    );
  }

  protected async insecUpsert(
    request: I,
    context?: CallContext,
  ): Promise<DeepPartial<O>> {
    return await super.upsert(
      request,
      context,
    );
  }

  protected async insecDelete(
    request: DeleteRequest,
    context?: CallContext,
  ): Promise<DeleteResponse> {
    return await super.delete(
      request,
      context,
    );
  }

  public async get(
    ids: string[],
    subject?: Subject,
    context?: CallContext,
  ): Promise<DeepPartial<O>> {
    ids = [...new Set(ids)].filter(id => id);
    if (ids.length > 1000) {
      throw this.operation_status_codes.LIMIT_EXHAUSTED;
    }

    if (ids.length === 0) {
      const response = {
        total_count: 0,
        operation_status: this.operation_status_codes.SUCCESS,
      };
      return response as DeepPartial<O>;
    }

    const request = ReadRequest.fromPartial({
      filters: [{
        filters: [{
          field: '_key',
          operation: Filter_Operation.in,
          value: JSON.stringify(ids),
          type: Filter_ValueType.ARRAY
        }]
      }],
      subject
    });
    return await this.insecRead(request, context);
  }

  @resolves_subject()
  @injects_meta_data()
  @access_controlled_function({
    action: AuthZAction.CREATE,
    operation: Operation.isAllowed,
    context: ACSContextFactory<O, I>,
    resource: DefaultResourceFactory(),
    database: 'arangoDB',
    useCache: true,
  })
  public override async create(
    request: I,
    context?: CallContext
  ): Promise<DeepPartial<O>> {
    return await this.insecCreate(request, context);
  }

  @access_controlled_function({
    action: AuthZAction.READ,
    operation: Operation.whatIsAllowed,
    context: DefaultACSClientContextFactory,
    resource: DefaultResourceFactory(),
    database: 'arangoDB',
    useCache: true,
  })
  public override async read(
    request: ReadRequest,
    context?: CallContext,
  ): Promise<DeepPartial<O>> {
    return await this.insecRead(request, context);
  }

  @resolves_subject()
  @injects_meta_data()
  @access_controlled_function({
    action: AuthZAction.CREATE,
    operation: Operation.isAllowed,
    context: ACSContextFactory<O, I>,
    resource: DefaultResourceFactory(),
    database: 'arangoDB',
    useCache: true,
  })
  public override async update(
    request: I,
    context?: CallContext,
  ): Promise<DeepPartial<O>> {
    return await this.insecUpdate(request, context);
  }

  @resolves_subject()
  @injects_meta_data()
  @access_controlled_function({
    action: AuthZAction.MODIFY,
    operation: Operation.isAllowed,
    context: ACSContextFactory<O, I>,
    resource: DefaultResourceFactory(),
    database: 'arangoDB',
    useCache: true,
  })
  public override async upsert(
    request: I,
    context?: CallContext,
  ): Promise<DeepPartial<O>> {
    return await this.insecUpsert(request, context);
  }

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.DELETE,
    operation: Operation.isAllowed,
    context: ACSContextFactory<O, I>,
    resource: DefaultResourceFactory(),
    database: 'arangoDB',
    useCache: true,
  })
  public override async delete(
    request: DeleteRequest,
    context?: CallContext,
  ): Promise<DeleteResponse> {
    return this.insecDelete(request, context);
  }
}