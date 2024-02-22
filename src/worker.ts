import {
  Server,
  OffsetStore,
  database,
  buildReflectionService,
  Health
} from '@restorecommerce/chassis-srv';
import {
  Events,
  Topic,
  registerProtoMeta
} from '@restorecommerce/kafka-client';
import {
  FulfillmentRequestList,
  OrderIdList,
  OrderList,
  OrderServiceDefinition,
  OrderState,
  protoMetadata as OrderMeta,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order.js';
import {
  CommandInterfaceServiceDefinition,
  protoMetadata as CommandInterfaceMeta,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/commandinterface.js';
import { ServiceConfig, createServiceConfig } from '@restorecommerce/service-config';
import { createLogger } from '@restorecommerce/logger';
import { OrderingService } from './service.js';
import { RedisClientType as RedisClient, createClient } from 'redis';
import { Arango } from '@restorecommerce/chassis-srv/lib/database/provider/arango/base.js';
import { Logger } from 'winston';
import { BindConfig } from '@restorecommerce/chassis-srv/lib/microservice/transport/provider/grpc.js';
import { HealthDefinition } from '@restorecommerce/rc-grpc-clients/dist/generated-server/grpc/health/v1/health.js';
import { ServerReflectionService } from 'nice-grpc-server-reflection';
import { Fulfillment } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment.js';
import { Subject } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth.js';
import { OrderingCommandInterface } from './command_interface.js';
import { initAuthZ } from '@restorecommerce/acs-client';

registerProtoMeta(
  OrderMeta,
  CommandInterfaceMeta,
);

export class Worker {
  private _cfg: ServiceConfig;
  private _offsetStore: OffsetStore;
  private _server: Server;
  private _events: Events;
  private _logger: Logger;
  private _redisClient: RedisClient;
  private _orderingService: OrderingService;
  private _orderingCommandInterface: OrderingCommandInterface;

  get cfg() {
    return this._cfg;
  }

  protected set cfg(value: any) {
    this._cfg = value;
  }

  get offsetStore() {
    return this._offsetStore;
  }

  protected set offsetStore(value: OffsetStore) {
    this._offsetStore = value;
  }

  get server() {
    return this._server;
  }

  protected set server(value: Server) {
    this._server = value;
  }

  get events() {
    return this._events;
  }

  protected set events(value: Events) {
    this._events = value;
  }

  get logger() {
    return this._logger;
  }

  protected set logger(value: Logger) {
    this._logger = value;
  }

  get redisClient() {
    return this._redisClient;
  }

  protected set redisClient(value: RedisClient) {
    this._redisClient = value;
  }

  get orderingService() {
    return this._orderingService;
  }

  protected set orderingService(value: OrderingService) {
    this._orderingService = value;
  }

  get orderingCommandInterface() {
    return this._orderingCommandInterface;
  }

  protected set orderingCommandInterface(value: OrderingCommandInterface) {
    this._orderingCommandInterface = value;
  }

  protected readonly topics = new Map<string, Topic>();
  protected readonly serviceActions = new Map<string, ((msg: any, context: any, config: any, eventName: string) => Promise<any>)>();

  protected readonly handlers = {
    handleCreateOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.create(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}:`, { error })
      );
    },
    handleUpdateOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.update(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleUpsertOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.upsert(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleSubmitOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.submit(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleFulfillOrders: (msg: FulfillmentRequestList, context: any, config: any, eventName: string) => {
      return this.orderingService?.createFulfillment(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleWithdrawOrders: (msg: OrderIdList, context: any, config: any, eventName: string) => {
      return this.orderingService?.withdraw(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleCancelOrders: (msg: OrderIdList, context: any, config: any, eventName: string) => {
      return this.orderingService?.cancel(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleDeleteOrders: (msg: any, context: any, config: any, eventName: string) => {
      return this.orderingService?.delete(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleFulfillmentSubmitted: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      const refs = msg?.references?.filter(ref => ref.instance_type === this.orderingService.instanceType);
      if (!refs?.length) return;
      const ids = refs?.map(ref => ref.instance_id);
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.IN_PROCESS, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleFulfillmentInvalid: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      const refs = msg?.references?.filter(ref => ref.instance_type === this.orderingService.instanceType);
      if (!refs?.length) return;
      const ids = refs?.map(ref => ref.instance_id);
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.INVALID, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleFulfillmentFulfilled: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      const refs = msg?.references?.filter(ref => ref.instance_type === this.orderingService.instanceType);
      if (!refs?.length) return;
      const ids = refs?.map(ref => ref.instance_id);
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.DONE, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleFulfillmentFailed: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      const refs = msg?.references?.filter(ref => ref.instance_type === this.orderingService.instanceType);
      if (!refs?.length) return;
      const ids = refs?.map(ref => ref.instance_id);
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.FAILED, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleFulfillmentWithdrawn: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      const refs = msg?.references?.filter(ref => ref.instance_type === this.orderingService.instanceType);
      if (!refs?.length) return;
      const ids = refs?.map(ref => ref.instance_id);
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.CANCELLED, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleFulfillmentCancelled: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      const refs = msg?.references?.filter(ref => ref.instance_type === this.orderingService.instanceType);
      if (!refs?.length) return;
      const ids = refs?.map(ref => ref.instance_id);
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.CANCELLED, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        error => this.logger.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleQueuedJob: (msg: any, context: any, config: any, eventName: string) => {
      return this.serviceActions.get(msg?.type)(msg?.data?.payload, context, config, msg?.type).then(
        () => this.logger.info(`Job ${msg?.type} done.`),
        error => this.logger.error(`Job ${msg?.type} failed: `, { error })
      );
    },
    handleCommand: (msg: any, context: any, config: any, eventName: string) => {
      return this.orderingCommandInterface.command(msg, context);
    }
  };

  async start(cfg?: ServiceConfig, logger?: Logger): Promise<any> {
    // Load config
    this._cfg = cfg = cfg ?? createServiceConfig(process.cwd());
    const logger_cfg = cfg.get('logger') ?? {};
    logger_cfg.esTransformer = (msg: any) => {
      msg.fields = JSON.stringify(msg.fields);
      return msg;
    };
    this.logger = logger = logger ?? createLogger(logger_cfg);

    // get database connection
    const db = await database.get(cfg.get('database:main'), logger);

    // create events
    const kafkaCfg = cfg.get('events:kafka');
    this.events = new Events(kafkaCfg, logger);
    await this.events.start();
    this.offsetStore = new OffsetStore(this.events, cfg, logger);
    logger.info('Event Groupes started');

    const redisConfig = cfg.get('redis');
    redisConfig.db = this.cfg.get('redis:db-indexes:db-subject');
    this.redisClient = createClient(redisConfig);
    await this.redisClient.connect();

    await Promise.all(Object.keys(kafkaCfg.topics).map(async key => {
      const topicName = kafkaCfg.topics[key].topic;
      const topic = await this.events.topic(topicName);
      const offsetValue = await this.offsetStore.getOffset(topicName);
      logger.info('subscribing to topic with offset value', topicName, offsetValue);
      await Promise.all(Object.entries(kafkaCfg.topics[key]?.events ?? {}).map(
        ([eventName, handler]) => {
          const handle = this.handlers[handler as string];
          if (!!handle) {
            this.serviceActions[eventName as string] = handle;
            return topic.on(
              eventName as string,
              handle,
              { startingOffset: offsetValue }
            );
          }
          else {
            logger.warn(`Topic Listener with handle name ${handler} not supported!`);
          }
        }
      ));
      this.topics.set(key, topic);
    }));

    // create server
    this.server = new Server(cfg.get('server'), logger);

    // ordering command interface
    logger.verbose('Setting up command interface services');
    this.orderingCommandInterface = new OrderingCommandInterface(
      this.server,
      cfg,
      logger,
      this.events,
      this.redisClient
    );

    // ordering service
    logger.verbose('Setting up ordering services');
    this.orderingService = new OrderingService(
      this.topics.get('ordering.resource'),
      db,
      cfg,
      logger
    );

    logger.verbose('Add server bindings');
    const serviceNamesCfg = cfg.get('serviceNames');

    await this.server.bind(serviceNamesCfg.ordering, {
      service: OrderServiceDefinition,
      implementation: this.orderingService
    } as BindConfig<OrderServiceDefinition>);

    await this.server.bind(serviceNamesCfg.cis, {
      service: CommandInterfaceServiceDefinition,
      implementation: this.orderingCommandInterface,
    } as BindConfig<CommandInterfaceServiceDefinition>);

    await this.server.bind(serviceNamesCfg.health, {
      service: HealthDefinition,
      implementation: new Health(
        this.orderingCommandInterface,
        {
          logger,
          cfg,
          dependencies: ['acs-srv'],
          readiness: () => (db as Arango).db.version().then(v => !!v)
        }
      )
    } as BindConfig<HealthDefinition>);

    // Add reflection service
    const reflectionServiceName = serviceNamesCfg.reflection;
    const reflectionService = buildReflectionService([
      { descriptor: OrderMeta.fileDescriptor },
      { descriptor: CommandInterfaceMeta.fileDescriptor },
    ]);

    await this.server.bind(reflectionServiceName, {
      service: ServerReflectionService,
      implementation: reflectionService
    });

    // start server
    await initAuthZ(cfg);
    await this.server.start();
    this.logger.info('server started successfully');
  }

  async stop(): Promise<any> {
    this.logger.info('Shutting down');
    await Promise.allSettled([
      this.events?.stop().catch(
        error => this.logger.error(error)
      )
    ]);
    await Promise.allSettled([
      this.server?.stop().catch(
        error => this.logger.error(error)
      ),
      this.offsetStore?.stop().catch(
        error => this.logger.error(error)
      ),
    ]);
  }
}

