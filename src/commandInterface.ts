import {
  Server,
  CommandInterface,
} from '@restorecommerce/chassis-srv';
import { Events } from '@restorecommerce/kafka-client';
import { RedisClientType as RedisClient } from 'redis';

export class OrderingCommandInterface extends CommandInterface {
  constructor(
    server: Server,
    cfg: any,
    logger: any,
    events: Events,
    redisClient: RedisClient
  ) {
    super(server, cfg, logger, events, redisClient);
  }
}