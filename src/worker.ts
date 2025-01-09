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
  protoMetadata as OrderMeta,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order.js';
import {
  CommandInterfaceServiceDefinition,
  protoMetadata as CommandInterfaceMeta,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/commandinterface.js';
import {
  protoMetadata as ResourceBaseMeta,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/resource_base.js';
import { ServiceConfig, createServiceConfig } from '@restorecommerce/service-config';
import { createLogger } from '@restorecommerce/logger';
import { OrderingService } from './service.js';
import { RedisClientType as RedisClient, createClient } from 'redis';
import { Arango } from '@restorecommerce/chassis-srv/lib/database/provider/arango/base.js';
import { Logger } from 'winston';
import { BindConfig } from '@restorecommerce/chassis-srv/lib/microservice/transport/provider/grpc/index.js';
import { HealthDefinition } from '@restorecommerce/rc-grpc-clients/dist/generated-server/grpc/health/v1/health.js';
import { ServerReflectionService } from 'nice-grpc-server-reflection';
import { OrderingCommandInterface } from './command_interface.js';
import { initAuthZ } from '@restorecommerce/acs-client';

registerProtoMeta(
  OrderMeta,
  CommandInterfaceMeta,
  ResourceBaseMeta,
);

export type Handler = (msg: any, context: any, config: any, eventName: string) => any;
export type HandlerMap = Record<string, Handler>;
export class Worker {
  private _cfg?: ServiceConfig;
  private _offsetStore?: OffsetStore;
  private _server?: Server;
  private _events?: Events;
  private _logger?: Logger;
  private _redisClient?: RedisClient;
  private _orderingService?: OrderingService;
  private _orderingCommandInterface?: OrderingCommandInterface;

  get cfg() {
    return this._cfg;
  }

  protected set cfg(value: any) {
    this._cfg = value;
  }

  get offsetStore() {
    return this._offsetStore;
  }

  protected set offsetStore(value: OffsetStore | undefined) {
    this._offsetStore = value;
  }

  get server() {
    return this._server;
  }

  protected set server(value: Server | undefined) {
    this._server = value;
  }

  get events() {
    return this._events;
  }

  protected set events(value: Events | undefined) {
    this._events = value;
  }

  get logger() {
    return this._logger;
  }

  protected set logger(value: Logger | undefined) {
    this._logger = value;
  }

  get redisClient() {
    return this._redisClient;
  }

  protected set redisClient(value: RedisClient | undefined) {
    this._redisClient = value;
  }

  get orderingService() {
    return this._orderingService;
  }

  protected set orderingService(value: OrderingService | undefined) {
    this._orderingService = value;
  }

  get orderingCommandInterface() {
    return this._orderingCommandInterface;
  }

  protected set orderingCommandInterface(value: OrderingCommandInterface | undefined) {
    this._orderingCommandInterface = value;
  }

  protected readonly topics = new Map<string, Topic>();
  protected readonly serviceActions = new Map<string, Handler>();

  protected readonly handlers: HandlerMap = {
    handleCreateOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.create(msg, context).then(
        () => this.logger?.info(`Event ${eventName} handled.`),
        error => this.logger?.error(`Error while handling event ${eventName}:`, { error })
      );
    },
    handleUpdateOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.update(msg, context).then(
        () => this.logger?.info(`Event ${eventName} handled.`),
        error => this.logger?.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleUpsertOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.upsert(msg, context).then(
        () => this.logger?.info(`Event ${eventName} handled.`),
        error => this.logger?.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleSubmitOrders: (msg: OrderList, context: any, config: any, eventName: string) => {
      return this.orderingService?.submit(msg, context).then(
        () => this.logger?.info(`Event ${eventName} handled.`),
        error => this.logger?.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleFulfillOrders: (msg: FulfillmentRequestList, context: any, config: any, eventName: string) => {
      return this.orderingService?.createFulfillment(msg, context).then(
        () => this.logger?.info(`Event ${eventName} handled.`),
        error => this.logger?.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleWithdrawOrders: (msg: OrderIdList, context: any, config: any, eventName: string) => {
      return this.orderingService?.withdraw(msg, context).then(
        () => this.logger?.info(`Event ${eventName} handled.`),
        error => this.logger?.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleCancelOrders: (msg: OrderIdList, context: any, config: any, eventName: string) => {
      return this.orderingService?.cancel(msg, context).then(
        () => this.logger?.info(`Event ${eventName} handled.`),
        error => this.logger?.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleDeleteOrders: (msg: any, context: any, config: any, eventName: string) => {
      return this.orderingService?.delete(msg, context).then(
        () => this.logger?.info(`Event ${eventName} handled.`),
        error => this.logger?.error(`Error while handling event ${eventName}: `, { error })
      );
    },
    handleQueuedJob: (msg: any, context: any, config: any, eventName: string) => {
      return this.serviceActions?.get(msg?.type)?.(msg?.data?.payload, context, config, msg?.type).then(
        () => this.logger?.info(`Job ${msg?.type} done.`),
        (error: any) => this.logger?.error(`Job ${msg?.type} failed: `, { error })
      );
    },
    handleCommand: (msg: any, context: any, config: any, eventName: string) => {
      return this.orderingCommandInterface?.command(msg, context);
    }
  };

  async start(cfg?: ServiceConfig, logger?: Logger): Promise<any> {
    // Load config
    this._cfg = cfg = cfg ?? createServiceConfig(process.cwd());
    const logger_cfg = cfg.get('logger') ?? {};
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
      const topic = await this.events!.topic(topicName);
      const offsetValue = await this.offsetStore!.getOffset(topicName);
      logger?.info('subscribing to topic with offset value', topicName, offsetValue);
      await Promise.all(
        Object.entries(
          (kafkaCfg.topics[key]?.events ?? {}) as { [key: string]: string }
        ).map(
          ([eventName, handler]) => {
            const handle = this.handlers[handler];
            if (handle) {
              this.serviceActions?.set(eventName as string, handle);
              return topic.on(
                eventName as string,
                handle,
                { startingOffset: offsetValue }
              );
            }
            else {
              logger?.warn(`Topic Listener with handle name ${handler} not supported!`);
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
      this.topics.get('ordering.resource')!,
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
    const reflectionService = buildReflectionService([
      { descriptor: OrderMeta.fileDescriptor as any },
      { descriptor: CommandInterfaceMeta.fileDescriptor as any },
    ]);

    await this.server.bind(serviceNamesCfg.reflection, {
      service: ServerReflectionService,
      implementation: reflectionService
    });

    // start server
    await initAuthZ(cfg);
    logger.debug('Starting server...');
    await this.server.start();
    logger.info('Server started and ready to use.');
  }

  async stop(): Promise<any> {
    this.logger?.info('Shutting down');
    await Promise.allSettled([
      this.events?.stop().catch(
        error => this.logger?.error(error)
      )
    ]);
    await Promise.allSettled([
      this.server?.stop().catch(
        error => this.logger?.error(error)
      ),
      this.offsetStore?.stop().catch(
        error => this.logger?.error(error)
      ),
    ]);
  }
}

