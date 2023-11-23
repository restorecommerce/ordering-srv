import {} from 'mocha';
import should from 'should';
import { Semaphore } from 'async-mutex';
import { Client } from 'nice-grpc';
import { createClient, createChannel, GrpcClientConfig } from '@restorecommerce/grpc-client';
import { Events, Topic } from '@restorecommerce/kafka-client';
import {
  FulfillmentRequest,
  Order,
  OrderServiceDefinition,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/order';
import {
  Order as Order_,
  OrderState as Order_State,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order';
import { GrpcMockServer } from '@alenon/grpc-mock-server';
import { Worker } from '../src/worker';
import {
  cfg,
  logger,
  samples,
  startWorker,
  connectEvents,
  connectTopics,
  mockServices,
} from './utils';

describe('The Ordering Service:', () => {
  let mocking: GrpcMockServer[];
  let worker: Worker;
  let events: Events;
  let topics: Topic;
  let client: Client<OrderServiceDefinition>;
  const orderCreatedSemaphore = new Semaphore(0);
  const orderSubmittedSemaphore = new Semaphore(0);

  const onOrderCreated = (msg: Order_, context?:any): void => {
    should.equal(msg?.order_state, Order_State.CREATED);
    orderCreatedSemaphore.release(1);
  };

  const onOrderSubmitted = (msg: Order_, context?:any): void => {
    should.equal(msg?.order_state, Order_State.SUBMITTED);
    orderSubmittedSemaphore.release(1);
  };

  before(async function() {
    this.timeout(30000);
    mocking = await mockServices(cfg.get('client'));
    worker = await startWorker();
    events = await connectEvents();
    topics = await connectTopics(events, 'ordering.resource');
    client = createClient(
      {
        ...cfg.get('client:order'),
        logger
      } as GrpcClientConfig,
      OrderServiceDefinition,
      createChannel(cfg.get('client:order:address'))
    ) as Client<OrderServiceDefinition>;

    await Promise.all([
      topics.on('orderCreated', onOrderCreated),
      topics.on('orderSubmitted', onOrderSubmitted),
    ]);
    await topics.consumer.run();
  });

  after(async function() {
    this.timeout(30000);
    await Promise.allSettled([
      client?.delete({ collection: true }),
      topics.removeListener('orderCreated', onOrderCreated),
      topics.removeListener('orderSubmitted', onOrderSubmitted),
    ]).finally(
      () => Promise.allSettled([
        events?.stop(),
        worker?.stop(),
      ])
    ).finally(
      () => mocking?.forEach(mock => mock?.stop())
    );
  });

  for (let [sample_name, sample] of Object.entries(samples.orders.valid)) {
    it(`should create valid orders by sample: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.create(sample);
      should.equal(
        response.operationStatus?.code,
        200,
        '\n' + JSON.stringify(response.operationStatus, null, 2),
      );
      should.ok(
        !response.items?.some(item => item.status?.code !== 200),
        'response.items[*].status.code expected all to be 200',
      );
    });

    it('should have received an order create event', async function() {
      this.timeout(5000);
      await orderCreatedSemaphore.acquire(1);
    })
  }

  for (let [sample_name, sample] of Object.entries(samples.orders.valid)) {
    it(`should evaluate valid orders by sample: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.evaluate(sample);
      should.equal(
        response.operationStatus?.code,
        200,
        '\n' + JSON.stringify(response.operationStatus, null, 2),
      );
      should.ok(
        !response.items?.some(item => item.status?.code !== 200),
        'response.items[*].status.code expected all to be 200',
      );
    });
  }

  for (let [sample_name, sample] of Object.entries(samples.orders.invalid)) {
    it(`should not evaluate invalid orders by sample: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.evaluate(sample);
      should.notEqual(
        response.operationStatus?.code,
        200,
        'response.operationStatus?.code expected NOT to be 200'
      );
      should.ok(
        !response.items?.some(item => item.status?.code === 200),
        'response.items[*].status.code expected all NOT to be 200',
      );
    });
  }

  for (let [sample_name, sample] of Object.entries(samples.orders.valid)) {
    it(`should submit valid orders by sample: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.submit(sample);
      should.equal(
        response.operationStatus?.code,
        200,
        '\n' + JSON.stringify(response.operationStatus, null, 2),
      );
      should.ok(
        !response.orders?.some(item => item.status?.code !== 200),
        'response.orders[*].status.code expected all to be 200',
      );
    });

    it('should have received an order submit event', async function() {
      this.timeout(5000);
      await orderSubmittedSemaphore.acquire(1);
    });
  }

  for (let [sample_name, sample] of Object.entries(samples.orders.invalid)) {
    it(`should not submit invalid orders by sample: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.submit(sample);
      should.notEqual(
        response.operationStatus?.code,
        200,
        '\n' + JSON.stringify(response.operationStatus, null, 2),
      );
      should.ok(
        !response.orders?.some(item => item.status?.code === 200),
        'response.orders[*].status.code expected all NOT to be 200',
      );
    });
  }

  for (let [sample_name, sample] of Object.entries(samples.orders.valid)) {
    it(`should create a fulfillment request: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.createFulfillment({
        items: sample.items?.map((order: Order): FulfillmentRequest => ({
          orderId: order.id,
          selectedItems: [],
          senderAddress: samples.businessAddresses[0],
        })),
        totalCount: 1,
        subject: sample.subject,
      });
      should.equal(
        response.operationStatus?.code,
        200,
        '\n' + JSON.stringify(response.operationStatus, null, 2),
      );
      should.ok(
        !response.items?.some(item => item.status?.code !== 200),
        'response.items[*].status.code expected all to be 200',
      );
    });
  }

  for (let [sample_name, sample] of Object.entries(samples.orders.valid)) {
    it(`should withdraw orders: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.withdraw({
        ids: sample.items?.map((item: any) => item.id),
        subject: sample.subject,
      });
      should.equal(
        response.operationStatus?.code,
        200,
        '\n' + JSON.stringify(response.operationStatus, null, 2),
      );
      should.ok(
        !response.items?.some(item => item.status?.code !== 200),
        'response.items[*].status.code expected all to be 200',
      );
    });
  }

  for (let [sample_name, sample] of Object.entries(samples.orders.valid)) {
    it(`should cancel orders: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.cancel({
        ids: sample.items?.map((item: any) => item.id),
        subject: sample.subject,
      });
      should.equal(
        response.operationStatus?.code,
        200,
        '\n' + JSON.stringify(response.operationStatus, null, 2),
      );
      should.ok(
        !response.items?.some(item => item.status?.code !== 200),
        'response.items[*].status.code expected all to be 200',
      );
    });
  }

  for (let [sample_name, sample] of Object.entries(samples.orders.valid)) {
    it(`should delete orders: ${sample_name}`, async function() {
      this.timeout(5000);
      const response = await client.delete({
        ids: sample.items?.map((item: any) => item.id),
        subject: sample.subject,
      });
      should.equal(
        response.operationStatus?.code,
        200,
        '\n' + JSON.stringify(response.operationStatus, null, 2),
      );
      should.ok(
        !response?.status?.some(status => status?.code !== 200),
        'response.status[*].code expected all to be 200',
      );
    });
  }
});