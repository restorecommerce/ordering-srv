import { createServiceConfig } from '@restorecommerce/service-config';
import * as _ from 'lodash';
import { Events } from '@restorecommerce/kafka-client';
import { Logger, createLogger } from '@restorecommerce/logger';
import * as chassis from '@restorecommerce/chassis-srv';
import { OrderingService } from './service';
import { OrderingCommandInterface } from './commandInterface';
import { RedisClient, createClient } from 'redis';
import { Arango } from '@restorecommerce/chassis-srv/lib/database/provider/arango/base';

export class Worker {
  events: Events;
  server: any;
  logger: Logger;
  cfg: any;
  topics: any;
  offsetStore: chassis.OffsetStore;
  redisClient: RedisClient;
  constructor(cfg?: any) {
    this.cfg = cfg || createServiceConfig(process.cwd());
    this.logger = createLogger(this.cfg.get('logger'));
    this.topics = {};
  }

  async start(): Promise<any> {
    // Load config
    const cfg = this.cfg;
    const logger = this.logger;
    const kafkaCfg = cfg.get('events:kafka');

    // list of service names
    const serviceNamesCfg = cfg.get('serviceNames');

    const server = new chassis.Server(cfg.get('server'), logger);

    // database
    const db = await chassis.database.get(cfg.get('database:main'), logger);

    // topics
    logger.verbose('Setting up topics');
    const events = new Events(cfg.get('events:kafka'), logger);
    await events.start();
    this.offsetStore = new chassis.OffsetStore(events, cfg, logger);

    // Enable events firing for resource api using config
    let isEventsEnabled = cfg.get('events:enableEvents');
    if (isEventsEnabled === true) {
      isEventsEnabled = true;
    } else { // Undefined means events not enabled
      isEventsEnabled = false;
    }

    let cis: OrderingCommandInterface;
    let orderingService: OrderingService;

    const eventListener = async(msg: any, context: any, config: any,
      eventName: string): Promise<any> => {
      if (eventName === 'triggerFulfillment') {
        const response = await orderingService.triggerFulfillment(msg);
        logger.info('Fulfilment trigger status:', response);
      }
      else {
        // command events
        await cis.command(msg, context);
      }
    };

    const topicTypes = _.keys(kafkaCfg.topics);
    for (let topicType of topicTypes) {
      const topicName = kafkaCfg.topics[topicType].topic;
      this.topics[topicType] = events.topic(topicName);
      const offSetValue = await this.offsetStore.getOffset(topicName);
      logger.info('subscribing to topic with offset value', topicName, offSetValue);
      if (kafkaCfg.topics[topicType].events) {
        const eventNames = kafkaCfg.topics[topicType].events;
        for (let eventName of eventNames) {
          await this.topics[topicType].on(eventName,
            eventListener, { startingOffset: offSetValue });
        }
      }
    }

    const redisConfig = cfg.get('redis');
    redisConfig.db = this.cfg.get('redis:db-indexes:db-subject');
    this.redisClient = createClient(redisConfig);

    // ordering command interface
    cis = new OrderingCommandInterface(server, cfg, logger, events, this.redisClient);

    // ordering service
    logger.verbose('Setting up ordering services');
    orderingService = new OrderingService(
      this.topics['order.resource'], db, cfg, logger, isEventsEnabled, this.topics['fulfillment.resource']);

    await server.bind(serviceNamesCfg.ordering, orderingService);
    await server.bind(serviceNamesCfg.cis, cis);

    // Add reflection service
    const reflectionServiceName = serviceNamesCfg.reflection;
    const transportName = cfg.get(`server:services:${reflectionServiceName}:serverReflectionInfo:transport:0`);
    const transport = server.transport[transportName];
    const reflectionService = new chassis.grpc.ServerReflection(transport.$builder, server.config);
    await server.bind(reflectionServiceName, reflectionService);

    await server.bind(serviceNamesCfg.health, new chassis.Health(cis, {
      readiness: async () => !!await ((db as Arango).db).version()
    }));

    // Start server
    await server.start();

    this.events = events;
    this.server = server;
  }

  async stop(): Promise<any> {
    this.logger.info('Shutting down');
    await this.server.stop();
    await this.events.stop();
    await this.offsetStore.stop();
  }
}

if (require.main === module) {
  const worker = new Worker();
  const logger = worker.logger;
  worker.start().then().catch((err) => {
    logger.error('startup error', err);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    worker.stop().then().catch((err) => {
      logger.error('shutdown error', err);
      process.exit(1);
    });
  });
}

