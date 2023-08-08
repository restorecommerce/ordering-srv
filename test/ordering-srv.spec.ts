import {} from 'mocha';
import should from 'should';
import { Client } from 'nice-grpc';
import { createClient, createChannel, GrpcClientConfig } from '@restorecommerce/grpc-client';
import { Events, Topic } from '@restorecommerce/kafka-client';
import {
  FulfillmentRequest,
  Order,
  OrderServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/order';
import { GrpcMockServer } from '@alenon/grpc-mock-server';
import { Worker } from '../src/worker';
import {
  cfg,
  logger,
  samples,
  startWorker,
  connectEvents,
  connectTopics,
  mockServices
} from '.';


describe('The Ordering Service:', () => {
  let mocking: GrpcMockServer[];
  let worker: Worker;
  let events: Events;
  let topics: Topic;
  let client: Client<OrderServiceDefinition>;

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
      createChannel(cfg.get('client:order').address)
    ) as Client<OrderServiceDefinition>;
  });

  after(async function() {
    this.timeout(15000);
    await worker?.stop();
    mocking?.forEach(mock => mock?.stop());
  });

  it('should create valid orders', async function() {
    this.timeout(5000);
    const sample = samples.orders.valid[0];
    const response = await client.create(sample);
    should.equal(
      response.operationStatus?.code,
      200,
      'response.operationStatus?.code expected to be 200'
    );
    should.equal(
      Math.max(...response.items?.map(item => item.status?.code ?? 0)),
      200,
      'response.operationStatus.code expected to be 200'
    );
  });

  it('should evaluate valid orders', async function() {
    this.timeout(5000);
    const sample = samples.orders.valid[0];
    const response = await client.evaluate(sample);
    should.equal(
      response.operationStatus?.code,
      200,
      'response.operationStatus.code expected to be 200'
    );
    should.equal(
      Math.max(...response.items?.map(item => item.status?.code ?? 0)),
      200,
      'response.items[*].status.code expected to be 200'
    );
  });

  it('should not evaluate invalid orders', async function() {
    this.timeout(5000);
    const sample = samples.orders.invalid[0];
    const response = await client.evaluate(sample);
    should.notEqual(
      response.operationStatus?.code,
      200,
      'response.operationStatus?.code expected not to be 200'
    );
    should.notEqual(
      Math.max(...response.items?.map(item => item.status?.code ?? 0)),
      200,
      'response.items[*].status.code expected not to be 200'
    );
  });

  it('should submit valid orders', async function() {
    this.timeout(5000);
    const sample = samples.orders.valid[0];
    const response = await client.submit(sample);
    should.equal(
      response.operationStatus?.code,
      200,
      'response.operationStatus.code expected to be 200'
    );
    should.equal(
      Math.max(...response.items?.map(item => item.status?.code ?? 0)),
      200,
      'response.items[*].status.code expected to be 200'
    );
  });

  it('should not submit invalid orders', async function() {
    this.timeout(5000);
    const sample = samples.orders.invalid[0];
    const response = await client.submit(sample);
    should.notEqual(
      response.operationStatus?.code,
      200,
      'response.operationStatus?.code expected not to be 200'
    );
    should.notEqual(
      Math.max(...response.items?.map(item => item.status?.code ?? 0)),
      200,
      'response.items[*].status.code expected not to be 200'
    );
  });

  it('should create a fulfillment request', async function() {
    this.timeout(5000);
    const sample = samples.orders.valid[0];
    const response = await client.createFulfillment({
      items: sample.items.map((order: Order): FulfillmentRequest => ({
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
      'response.operationStatus.code expected to be 200'
    );
    should.equal(
      Math.max(...response.items?.map(item => item.status?.code ?? 0)),
      200,
      'response.items[*].status.code expected to be 200'
    );
  });

  it('should withdraw orders', async function() {
    this.timeout(5000);
    const sample = samples.orders.valid[0];
    const response = await client.withdraw({
      ids: sample.items.map((item: any) => item.id),
      subject: sample.subject,
    });
    should.equal(
      response.operationStatus?.code,
      200,
      'response.operationStatus.code expected to be 200'
    );
    should.equal(
      Math.max(...response.items?.map(item => item.status?.code ?? 0)),
      200,
      'response.items[*].status.code expected to be 200'
    );
  });

  it('should cancel orders', async function() {
    this.timeout(5000);
    const sample = samples.orders.valid[0];
    const response = await client.cancel({
      ids: sample.items.map((item: any) => item.id),
      subject: sample.subject,
    });
    should.equal(
      response.operationStatus?.code,
      200,
      'response.operationStatus.code expected to be 200'
    );
    should.equal(
      Math.max(...response.items?.map(item => item.status?.code ?? 0)),
      200,
      'response.items[*].status.code expected to be 200'
    );
  });

  it('should delete orders', async function() {
    this.timeout(5000);
    const sample = samples.orders.valid[0];
    const response = await client.delete({
      ids: sample.items.map((item: any) => item.id),
      subject: sample.subject,
    });
    should.equal(
      response.operationStatus?.code,
      200,
      'response.operationStatus.code expected to be 200'
    );
    should.equal(
      Math.max(...response.status?.map(status => status?.code as number)),
      200,
      'response.items[*].status.code expected to be 200'
    );
  });
});