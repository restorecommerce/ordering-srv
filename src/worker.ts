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
import { OrderingCommandInterface } from './commandInterface';
import { Fulfillment } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment';
import { Subject } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth';


const CREATE_ORDERS = 'createOrders';
const UPDATE_ORDERS = 'updateOrders';
const UPSERT_ORDERS = 'upsertOrders';
const SUBMIT_ORDERS = 'submitOrders';
const SHIP_ORDERS = 'shipOrders';
const WITHDRAW_ORDERS = 'withdrawOrders';
const CANCEL_ORDERS = 'cancelOrders';
const DELETE_ORDERS = 'deleteOrders';

const FULFILLMENT_SUBMITTED = 'fulfillmentSubmitted';
const FULFILLMENT_INVALIDE = 'fulfillmentInvalide';
const FULFILLMENT_FAILED = 'fulfillmentFailed';
const FULFILLMENT_FULFILLED = 'fulfillmentFulfilled';
const FULFILLMENT_CANCELLED = 'fulfillmentCancelled';

const QUEUED_JOB = 'queuedJob';

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

  async start(cfg?: any, logger?: any): Promise<any> {
    // Load config
    this._cfg = cfg = cfg ?? createServiceConfig(process.cwd());

    // create server
    this.logger = logger = logger || createLogger(cfg.get('logger'));
    this.server = new Server(cfg.get('server'), logger);

    // get database connection
    const db = await database.get(cfg.get('database:main'), logger);

    // create events
    const kafkaCfg = cfg.get('events:kafka');
    this.events = new Events(kafkaCfg, logger);
    await this.events.start();
    this.offsetStore = new OffsetStore(this.events, cfg, logger);

    const topics = new Map<string, Topic>();
    const redisConfig = cfg.get('redis');
    redisConfig.db = this.cfg.get('redis:db-indexes:db-subject');
    this.redisClient = createClient(redisConfig);

    const that = this;
    const serviceActions = {
      [CREATE_ORDERS]: (msg: OrderList, context: any, config: any, eventName: string) => {
        return orderService.create(msg, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [UPDATE_ORDERS]: (msg: OrderList, context: any, config: any, eventName: string) => {
        return orderService.update(msg, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [UPSERT_ORDERS]: (msg: OrderList, context: any, config: any, eventName: string) => {
        return orderService.upsert(msg, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [SUBMIT_ORDERS]: (msg: OrderList, context: any, config: any, eventName: string) => {
        return orderService.submit(msg, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [SHIP_ORDERS]: (msg: FulfillmentRequestList, context: any, config: any, eventName: string) => {
        return orderService.createFulfillment(msg, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [WITHDRAW_ORDERS]: (msg: OrderIdList, context: any, config: any, eventName: string) => {
        return orderService.withdraw(msg, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [CANCEL_ORDERS]: (msg: OrderIdList, context: any, config: any, eventName: string) => {
        return orderService.cancel(msg, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [DELETE_ORDERS]: (msg: any, context: any, config: any, eventName: string) => {
        return orderService.delete(msg, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [FULFILLMENT_SUBMITTED]: (msg: Fulfillment, context: any, config: any, eventName: string) => {
        if (msg.packaging?.reference?.instance_type !== orderService.instance_type) return;
        const ids = [msg.packaging?.reference?.instance_id];
        const subject = {} as Subject; // System Admin?
        return orderService.updateState(ids, OrderState.IN_PROCESS, subject, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [FULFILLMENT_INVALIDE]: (msg: Fulfillment, context: any, config: any, eventName: string) => {
        if (msg.packaging?.reference?.instance_type !== orderService.instance_type) return;
        const ids = [msg.packaging?.reference?.instance_id];
        const subject = {} as Subject; // System Admin?
        return orderService.updateState(ids, OrderState.INVALID, subject, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [FULFILLMENT_FULFILLED]: (msg: Fulfillment, context: any, config: any, eventName: string) => {
        if (msg.packaging?.reference?.instance_type !== orderService.instance_type) return;
        const ids = [msg.packaging?.reference?.instance_id];
        const subject = {} as Subject; // System Admin?
        return orderService.updateState(ids, OrderState.DONE, subject, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [FULFILLMENT_FAILED]: (msg: Fulfillment, context: any, config: any, eventName: string) => {
        if (msg.packaging?.reference?.instance_type !== orderService.instance_type) return;
        const ids = [msg.packaging?.reference?.instance_id];
        const subject = {} as Subject; // System Admin?
        return orderService.updateState(ids, OrderState.FAILED, subject, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
      [FULFILLMENT_CANCELLED]: (msg: Fulfillment, context: any, config: any, eventName: string) => {
        if (msg.packaging?.reference?.instance_type !== orderService.instance_type) return;
        const ids = [msg.packaging?.reference.instance_id];
        const subject = {} as Subject; // System Admin?
        return orderService.updateState(ids, OrderState.CANCELLED, subject, context).then(
          () => that.logger.info(`Event ${eventName} done.`),
          err => that.logger.error(`Event ${eventName} failed: ${err}`)
        );
      },
    };

    const serviceEventListeners = (msg: any, context: any, config: any, eventName: string) => {
      if (eventName === QUEUED_JOB) {
        return serviceActions[msg?.type](msg?.data?.payload, context, config, msg?.type).then(
          () => that.logger.info(`Job ${msg?.type} done.`),
          (err: any) => that.logger.error(`Job ${msg?.type} failed: ${err}`)
        );
      }
      else {
        return serviceActions[eventName](msg, context, config, eventName);
      }
    };

    await Promise.all(Object.keys(kafkaCfg.topics).map(async key => {
      const topicName = kafkaCfg.topics[key].topic;
      const topic = await this.events.topic(topicName);
      const offsetValue: number = await this.offsetStore.getOffset(topicName);
      logger.info('subscribing to topic with offset value', topicName, offsetValue);
      Object.values(kafkaCfg.topics[key]?.events ?? {}).forEach(
        (eventName: string) => topic.on(
          eventName,
          serviceEventListeners[eventName],
          { startingOffset: offsetValue }
        )
      );
      topics.set(key, topic);
    }));

    // ordering command interface
    logger.verbose('Setting up command interface services');
    const cis = new OrderingCommandInterface(
      this.server,
      cfg,
      logger,
      this.events,
      this.redisClient
    );

    // ordering service
    logger.verbose('Setting up ordering services');
    const orderService = new OrderingService(
      topics.get('ordering.resource'),
      db,
      cfg,
      logger
    );

    logger.verbose('Add server bindings');
    const serviceNamesCfg = cfg.get('serviceNames');

    await this.server.bind(serviceNamesCfg.ordering, {
      service: OrderServiceDefinition,
      implementation: orderService
    } as BindConfig<OrderServiceDefinition>);

    await this.server.bind(serviceNamesCfg.cis, {
      service: CommandInterfaceServiceDefinition,
      implementation: cis
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
      implementation: new Health(cis, {
        logger,
        cfg,
        dependencies: [],
        readiness: async () => !!await (db as Arango).db.version()
      })
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

