import * as should from 'should';
import * as grpcClient from '@restorecommerce/grpc-client';
import * as kafkaClient from '@restorecommerce/kafka-client';
import { Worker } from '../src/worker';
import { createServiceConfig } from '@restorecommerce/service-config';
import { Topic } from '@restorecommerce/kafka-client/lib/events/provider/kafka';

let cfg: any;
let worker: Worker;
let client;
let logger;
// For event listeners
let events;
let topic: Topic;
let testOrderID: any, orderBasic: any, testOrderFulfillmentData: any;
let orderService: any;

// copied from identity-srv tests
const meta = {
    modified_by: 'SYSTEM',
    owner: [{
      id: 'urn:restorecommerce:acs:names:ownerIndicatoryEntity',
      value: 'urn:restorecommerce:acs:model:user.User'
    },
    {
      id: 'urn:restorecommerce:acs:names:ownerInstance',
      value: 'UserID'
    }]
};

async function start(): Promise<void> {
    cfg = createServiceConfig(process.cwd() + '/test');
    worker = new Worker(cfg);
    await worker.start();
}

async function connect(clientCfg: string, resourceName: string): Promise<any> { // returns a gRPC service
    logger = worker.logger;

    events = new kafkaClient.Events(cfg.get('events:kafka'), logger);
    await (events.start());
    topic = events.topic(cfg.get(`events:kafka:topics:${resourceName}:topic`));

    client = new grpcClient.Client(cfg.get(clientCfg), logger);
    return client.connect();
}

// services that must be running: catalog, resource, fulfillment

describe('testing ordering-srv', function () {
    this.timeout(10000)

    before(async function startServer(): Promise<void> {
        await start();
    });


    after(async function stopServer(): Promise<void> {
        await worker.stop();
    });

    describe('testing ordering service', () => {

        before(async function connectOrderService(): Promise<void> {
            orderService = await connect('client:ordering-srv', 'order.resource');
        });

        it('should create an order', async () => {
            orderBasic = {
                items: [
                    {
                        id: "id_test_order_basic",
                        name: "name_test_order_basic",
                        description: "description_test_order_basic",
                        items: [
                            {
                                item: {
                                    // ID of first product in test database, will change if data is regenerated from source table
                                    product_variant_bundle_id: "ea7ee1e3620b8f56bb14fb45224a5f2fe15a484d",
                                    quantity: 3,
                                }
                            }
                        ],
                        // see mock data - last ID contained
                        meta
                    }
                ],
                // this is never actually checked, but it's not necessary anyway
                total_count: 1000
            };

            const result = await orderService.create(orderBasic);

            should.not.exist(result.error);
            should.exist(result);
            should.exist(result.data);
            should.exist(result.data.items);
            result.data.items.should.have.length(1);
            testOrderID = result.data.items[0].id; // necessary for fulfillment testing
        });

        it('should not create an order if an item identifier is not specified', async () => {
            const orderNoItemId = {
                items: [
                    {
                        id: "id_test_order_no_item_id",
                        name: "name_test_order_no_item_id",
                        description: "description_test_order_no_item_id",
                        items: [
                            {
                                item: {
                                    quantity: 3
                                }
                            }
                        ],
                        meta
                    }
                ],
                total_count: 1
            };

            const result = await orderService.create(orderNoItemId);

            should.not.exist(result.data);
            should.exist(result.error);
            // this is "internal" instead?
            // should.equal(result.error.message, 'Product or bundle identifier missing');
        });

        it('should not create an order if an item quantity is not specified', async () => {
            const orderNoQuantity = {
                items: [
                    {
                        id: "id_test_order_no_item_quantity",
                        name: "name_test_order_no_item_quantity",
                        description: "description_test_order_no_item_quantity",
                        items: [
                            {
                                item: {
                                    // ID of first product in test database, will change if data is regenerated from source table
                                    product_variant_bundle_id: "ea7ee1e3620b8f56bb14fb45224a5f2fe15a484d"
                                }
                            }
                        ],
                        meta
                    }
                ],
                total_count: 1
            };

            const result = await orderService.create(orderNoQuantity);

            should.not.exist(result.data);
            should.exist(result.error);
            //should.equal(result.error.message, 'Please specify Quantity');
        });

        it('should resolve a product ID correctly', async () => {
            const orderProduct = {
                items: [
                    {
                        id: "id_test_order_product",
                        name: "name_test_order_product",
                        description: "description_test_order_product",
                        items: [
                            {
                                item: {
                                    // ID of first product in test database, will change if data is regenerated from source table
                                    product_variant_bundle_id: "ea7ee1e3620b8f56bb14fb45224a5f2fe15a484d",
                                    quantity: 3
                                }
                            }
                        ],
                        meta
                    }
                ],
                total_count: 1
            };

            const result = await orderService.create(orderProduct);

            should.not.exist(result.error);
            should.exist(result.data);
            should.exist(result.data.items);
            result.data.items.should.have.length(1);
            result.data.items[0].items[0].item.product_description.should.equal(
                "Dummy description for product Alisha Solid Women's Cycling Shorts"
            );

        });

        it('should resolve a variant ID correctly', async () => {
            const orderVariant = {
                items: [
                    {
                        id: "id_test_order_variant",
                        name: "name_test_order_variant",
                        description: "description_test_order_variant",
                        items: [
                            {
                                item: {
                                    // ID for last variant of first product listed in test data, will change if data is regenerated from source table
                                    product_variant_bundle_id: "d95b0456a0350bc42f2393c6e84b0f09",
                                    quantity: 3
                                }
                            }
                        ],
                        meta
                    }
                ],
                total_count: 1
            };

            const result = await orderService.create(orderVariant);

            should.not.exist(result.error);
            should.exist(result.data);
            should.exist(result.data.items);
            result.data.items.should.have.length(1);
            result.data.items[0].items[0].item.product_description.should.equal(
                "Key Features of Alisha Solid Women's Cycling Shorts Cotton Lycra Black, White, White,"
                + "Specifications of Alisha Solid Women's Cycling Shorts Shorts Details Number of Contents "
                + "in Sales Package Pack of 3 Fabric Cotton Lycra Type Cycling Shorts General Details "
                + "Pattern Solid Ideal For Women's Fabric Care Gentle Machine Wash in Lukewarm Water, "
                + "Do Not Bleach Additional Details Style Code ALTHT_3P_2 In the Box 3 shorts"
            );
        });

        // there is currently no bundle test data defined
        it('should resolve a bundle ID correctly', async () => {

        });

        it('should not create an order for an invalid/non-resolvable ID', async () => {
            const orderInvalidId = {
                items: [
                    {
                        id: "id_test_order_invalid_id",
                        name: "name_test_order_invalid_id",
                        description: "description_test_order_invalid_id",
                        items: [
                            {
                                item: {
                                    product_variant_bundle_id: "invalid",
                                    quantity: 3
                                }
                            }
                        ],
                        meta
                    }
                ],
                total_count: 1
            };

            const result = await orderService.create(orderInvalidId);

            should.not.exist(result.data);
            should.exist(result.error);
        });


        it('should not create an order for an inactive product', async () => {
            const orderInactiveProduct = {
                items: [
                    {
                        id: "id_test_order_inactive_product",
                        name: "name_test_order_inactive_product",
                        description: "description_test_order_inactive_product",
                        items: [
                            {
                                item: {
                                    // first inactive product listed in test data, will change if data is regenerated from source table
                                    product_variant_bundle_id: "2b0a72382d4a626da01ee5776f102b248dbbfb92",
                                    quantity: 3
                                }
                            }
                        ],
                        meta
                    }
                ],
                total_count: 1
            };

            const result = await orderService.create(orderInactiveProduct);

            should.not.exist(result.data);
            should.exist(result.error);
        });

        it('should not create an order for a variant of an inactive product', async () => {
            const orderInactiveProductVariant = {
                items: [
                    {
                        id: "id_test_order_inactive_product_variant",
                        name: "name_test_order_inactive_product_variant",
                        description: "description_test_order_inactive_product_variant",
                        items: [
                            {
                                item: {
                                    // see above
                                    product_variant_bundle_id: "4f3511c33a6869b1d5102cd97818ef00",
                                    quantity: 3
                                }
                            }
                        ],
                        meta
                    }
                ],
                total_count: 1
            };

            const result = await orderService.create(orderInactiveProductVariant);

            should.not.exist(result.data);
            should.exist(result.error);
        });

        it('should trigger order fulfillment', async () => {
            const orderWithCP = {
                items: [
                    {
                        id: "id_test_order_fulfillment",
                        name: "name_test_order_fulfillment",
                        description: "description_test_order_fulfillment",
                        items: [
                            {
                                item: {
                                    // ID of first product in test database, will change if data is regenerated from source table
                                    product_variant_bundle_id: "ea7ee1e3620b8f56bb14fb45224a5f2fe15a484d",
                                    quantity: 3,
                                }
                            }
                        ],
                        // see mock data - last ID contained
                        shipping_contact_point_id: "60db337d800f4b009c043e2d70d8f6f4",
                        meta
                    }
                ],
            };

            const orderResult = await orderService.create(orderWithCP);


            const fulfillmentData = {
                order_data: [
                    {
                        order_id: orderResult.data.items[0].id,
                        // automation here?
                        shipments: [{ total_weight_in_kg: 3.14 }]
                    }
                ],
                meta
            }

            const result = await orderService.triggerFulfillment(fulfillmentData);

            should.not.exist(result.error);
            should.exist(result.data);
            should.exist(result.data.fulfillmentResults[0].Status);
            should.equal(result.data.fulfillmentResults[0].Status.OrderId, orderResult.data.items[0].id);
            should.equal(result.data.fulfillmentResults[0].Status.OrderStatus, 'Fulfillment in Progress');
        });

        it('should not trigger order fulfillment with no shipping contact point specified', async () => {
            const fulfillmentDataNoCP = {
                order_data: [
                    {
                        order_id: testOrderID,
                    }
                ],
                meta
            }

            const result = await orderService.triggerFulfillment(fulfillmentDataNoCP);

            should.not.exist(result.data);
            should.exist(result.error);
        });

        after(async function deleteOrders(): Promise<void> {
            await orderService.delete({ collection: true });
        });
    });

});
