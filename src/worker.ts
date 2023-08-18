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
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order';
import {
  CommandInterfaceServiceDefinition,
  protoMetadata as CommandInterfaceMeta,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/commandinterface';
import { createServiceConfig } from '@restorecommerce/service-config';
import { createLogger } from '@restorecommerce/logger';
import { OrderingService } from './service';
import { RedisClientType as RedisClient, createClient } from 'redis';
import { Arango } from '@restorecommerce/chassis-srv/lib/database/provider/arango/base';
import { Logger } from 'winston';
import { BindConfig } from '@restorecommerce/chassis-srv/lib/microservice/transport/provider/grpc';
import { HealthDefinition } from '@restorecommerce/rc-grpc-clients/dist/generated-server/grpc/health/v1/health';
import { ServerReflectionService } from 'nice-grpc-server-reflection';
import { OrderingCommandInterface } from './command_interface';
import { Fulfillment } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment';
import { Subject } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth';

registerProtoMeta(
  OrderMeta,
  CommandInterfaceMeta,
);

export class Worker {
  private _cfg: any;
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
  protected readonly serviceActions = new Map<string, ((msg: any, context: any, config: any, eventName: string) => Promise<void>)>();
  
  protected readonly handlers = { 
    handleCreateOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.create(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleUpdateOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.update(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleUpsertOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.upsert(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleSubmitOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.submit(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleShipOrders: (msg: FulfillmentRequestList, context: any, config: any, eventName: string) => {
      return this.orderingService?.createFulfillment(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleWithdrawOrders: (msg: OrderIdList, context: any, config: any, eventName: string) => {
      return this.orderingService?.withdraw(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleCancelOrders: (msg: OrderIdList, context: any, config: any, eventName: string) => {
      return this.orderingService?.cancel(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleDeleteOrders: (msg: any, context: any, config: any, eventName: string) => {
      return this.orderingService?.delete(msg, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleFulfillmentSubmitted: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      if (msg?.reference?.instance_type !== this.orderingService.instance_type) return;
      const ids = [msg?.reference?.instance_id];
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.IN_PROCESS, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleFulfillmentInvalide: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      if (msg?.reference?.instance_type !== this.orderingService.instance_type) return;
      const ids = [msg?.reference?.instance_id];
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.INVALID, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleFulfillmentFulfilled: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      if (msg?.reference?.instance_type !== this.orderingService.instance_type) return;
      const ids = [msg?.reference?.instance_id];
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.DONE, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleFulfillmentFailed: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      if (msg?.reference?.instance_type !== this.orderingService.instance_type) return;
      const ids = [msg?.reference?.instance_id];
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.FAILED, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleFulfillmentWithdrawn: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      if (msg?.reference?.instance_type !== this.orderingService.instance_type) return;
      const ids = [msg?.reference.instance_id];
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.CANCELLED, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleFulfillmentCancelled: (msg: Fulfillment, context: any, config: any, eventName: string) => {
      if (msg?.reference?.instance_type !== this.orderingService.instance_type) return;
      const ids = [msg?.reference.instance_id];
      const subject = {} as Subject; // System Admin?
      return this.orderingService?.updateState(ids, OrderState.CANCELLED, subject, context).then(
        () => this.logger.info(`Event ${eventName} handled.`),
        err => this.logger.error(`Error while handling event ${eventName}: ${err}`)
      );
    },
    handleQueuedJob: (msg: any, context: any, config: any, eventName: string) => {
      return this.serviceActions.get(msg?.type)(msg?.data?.payload, context, config, msg?.type).then(
        () => this.logger.info(`Job ${msg?.type} done.`),
        (err: any) => this.logger.error(`Job ${msg?.type} failed: ${err}`)
      );
    }
  }

  async start(cfg?: any, logger?: any): Promise<any> {
    // Load config
    this._cfg = cfg = cfg ?? createServiceConfig(process.cwd());

    // create server
    this.logger = logger = logger ?? createLogger(cfg.get('logger'));
    this.server = new Server(cfg.get('server'), logger);

    // get database connection
    const db = await database.get(cfg.get('database:main'), logger);

    // create events
    const kafkaCfg = cfg.get('events:kafka');
    this.events = new Events(kafkaCfg, logger);
    await this.events.start();
    this.offsetStore = new OffsetStore(this.events, cfg, logger);

    const redisConfig = cfg.get('redis');
    redisConfig.db = this.cfg.get('redis:db-indexes:db-subject');
    this.redisClient = createClient(redisConfig);

    await Promise.all(Object.keys(kafkaCfg.topics).map(async key => {
      const topicName = kafkaCfg.topics[key].topic;
      const topic = await this.events.topic(topicName);
      const offsetValue: number = await this.offsetStore.getOffset(topicName);
      logger.info('subscribing to topic with offset value', topicName, offsetValue);
      Object.entries(kafkaCfg.topics[key]?.events ?? {}).forEach(
        ([eventName, handler]) => {
          this.serviceActions[eventName as string] = this.handlers[handler as string];
          topic.on(
            eventName as string,
            this.handlers[handler as string],
            { startingOffset: offsetValue }
          )
        }
      );
      this.topics.set(key, topic);
    }));

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

    // Add reflection service
    const reflectionServiceName = serviceNamesCfg.reflection;
    const reflectionService = buildReflectionService([
      { descriptor: OrderMeta.fileDescriptor },
    ]);

    await this.server.bind(reflectionServiceName, {
      service: ServerReflectionService,
      implementation: reflectionService
    });

    await this.server.bind(serviceNamesCfg.health, {
      service: HealthDefinition,
      implementation: new Health(
        this.orderingCommandInterface,
        {
          logger,
          cfg,
          dependencies: [],
          readiness: async () => !!await (db as Arango).db.version()
        }
      )
    } as BindConfig<HealthDefinition>);

    // start server
    await this.server.start();
    this.logger.info('server started successfully');
  }

  async stop(): Promise<any> {
    this.logger.info('Shutting down');
    await Promise.all([
      this.server?.stop(),
      this.events?.stop(),
      this.offsetStore?.stop(),
    ]);
  }
}

if (require.main === module) {
  const worker = new Worker();
  const logger = worker.logger;
  worker.start().catch((err) => {
    logger.error('startup error', err);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    worker.stop().catch((err) => {
      logger.error('shutdown error', err);
      process.exit(1);
    });
  });
}

