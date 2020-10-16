import * as chassis from '@restorecommerce/chassis-srv';
import { Events } from '@restorecommerce/kafka-client';
import { RedisClient } from 'redis';

export class OrderingCommandInterface extends chassis.CommandInterface {
  constructor(server: chassis.Server, cfg: any, logger: any, events: Events, redisClient: RedisClient) {
    super(server, cfg, logger, events, redisClient);
  }
}
