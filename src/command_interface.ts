import { Logger } from 'winston';
import { RedisClientType as RedisClient } from 'redis';
import {
  Server,
  CommandInterface,
} from '@restorecommerce/chassis-srv';
import { Events } from '@restorecommerce/kafka-client';

export class OrderingCommandInterface extends CommandInterface {
  constructor(
    server: Server,
    cfg: any,
    logger: Logger,
    events: Events,
    redisClient: RedisClient
  ) {
    super(server, cfg, logger, events, redisClient);
  }
}