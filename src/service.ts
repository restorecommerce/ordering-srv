import { ResourcesAPIBase, ServiceBase, } from '@restorecommerce/resource-base-interface';
import { DatabaseProvider } from '@restorecommerce/chassis-srv';
import { Topic } from '@restorecommerce/kafka-client';
import * as _ from 'lodash';
import * as grpcClient from '@restorecommerce/grpc-client';
import { Fulfillment } from './interface';

const ENTITY_NAME = 'order';
const STATUS_CREATED = 'Created';
const STATUS_IN_PROGRESS = 'Fulfillment in Progress';
const STATUS_COMPLETED = 'Fulfilled';

// TODO add update api() and call this on fulfilled event to update order status as Fulfilled
// also add a context query so that user is not able to update after he checks out order
export class OrderingService extends ServiceBase {
  logger: any;
  constructor(topic: Topic, db: DatabaseProvider, private cfg: any, logger: any,
    enableEvents: boolean, private fulfillMentTopic: Topic) {
    super(ENTITY_NAME, topic, logger, new ResourcesAPIBase(db, `${ENTITY_NAME}s`), enableEvents);
    this.logger = logger;
  }

  /**
   * Creates an Order
   *
   * @param call  list of Orders
   * @returns list of orders created
   */
  async create(call: any): Promise<any> {
    const listOfOrders = call.request.items || [];
    for (let order of listOfOrders) {
      order.status = STATUS_CREATED;
      if (!_.isArray(order.items)) {
        order.items = [order.items];
      }
      for (let itemObj of order.items) {
        const item = itemObj.item;
        if (!item.product_variant_bundle_id) {
          throw new Error('Product or bundle identifier missing');
        }
        // TODO: why isn't the type specified as well so the service doesn't have to
        // figure out whether the item is a product, bundle or variant?
        const item_id = item.product_variant_bundle_id;
        const quantity = item.quantity;
        if (!quantity) {
          throw new Error('Please specify Quantity');
        }
        // read and get complete Item details
        const filter = {
          $or: [
            {
              'product.id': {
                $eq: item_id
              }
            },
            {
              'bundle.id': {
                $eq: item_id
              }
            }
          ]
        };

        const client = new grpcClient.Client(this.cfg.get('client:catalog-product-srv'), this.logger);
        const productService = await client.connect();

        let productDetails: any = {};
        let variantDetails: any = {};
        const productBundleDetails = await productService.read({
          filter: grpcClient.toStruct(filter)
        });

        if (productBundleDetails && productBundleDetails.data &&
          productBundleDetails.data.items && productBundleDetails.data.items.length === 0) {
          variantDetails = await productService.read({
            custom_queries: ['filterByVariants'],
            custom_arguments: {
              value: Buffer.from(JSON.stringify({
                variantIDValue: item_id
              }))
            }
          });

          if (variantDetails.data.items.length === 0) {
            throw new Error(`No product, variant or bundle with the specified ID exists`);
          }
        }

        Object.assign(productDetails, productBundleDetails, variantDetails);
        let product_weight;
        if (productDetails && productDetails.data && productDetails.data.items &&
          productDetails.data.items.length > 0) {
          // below is mainproduct
          let product = productDetails.data.items[0];
          if (!product.active) {
            this.logger.info(`The product ${item_id} is no longer active`);
            throw new Error(`The product ${item_id} is no longer active and hence
              the order cannot be created`);
          }
          // resolve to either a bundle or product
          if (product && product.product_type === 'product') {
            product = product.product;
            if (product.id === item_id) {
              // Selected item is a product
              item.item_type = 'product';
            } else {
              // should be a variant
              let variantsList = product.variants;
              for (let variant of variantsList) {
                if (variant.id === item_id) {
                  item.item_type = 'variant';
                  // The main object will remain same i.e. product variable
                  // assignment to it differs depending on input is product or bundle or variant
                  product = variant;
                  break;
                }
              }
            }
          } else if (product && product.product_type === 'bundle') {
            product = product.bundle;
            item.item_type = 'bundle';
          }

          item.product_name = product.name;
          item.product_description = product.description;
          if (product.sale) {
            item.price = product.sale_price;
          } else {
            item.price = product.price;
          }
          this.logger.info('Quantity and item price are: ', { quantity, price: item.price });
          itemObj.quantity_price = (quantity * item.price);
          // weight is no longer a fixed product attribute - just set a dummy value for now
          product_weight = 0.5; // product.weight_in_kg;
          // to update item for order
          item.weight_in_kg = 0.5; // product.weight_in_kg;
        }
        order.total_price = order.total_price + itemObj.quantity_price;
        order.total_weight_in_kg = order.total_weight_in_kg + product_weight;
      }
    }

    const orderResponse = await super.create({
      request: {
        items: listOfOrders
      }
    });

    this.logger.info('Order created successfully: ', { details: orderResponse });
    return orderResponse;
  }

  /**
   * Trigger a fulfillment (from an order), this has the possibility to split
   * the weigtht from incoming request so that there we can create multiple
   * shipments for single order
   *
   * @param call  list of fulfillment Orders
   * @returns list of fulfillment order status
   */
  async triggerFulfillment(call: any): Promise<string> {
    let order_data;
    let meta;
    let orderIDs = [];
    let shipments = [];
    let senderCountryEconomicArea;
    let receiverCountryEconomicArea;
    let placeOfCommital;
    try {
      order_data = call.request.order_data;
      meta = call.request.meta;
      for (let each_order_data of order_data) {
        orderIDs.push(each_order_data.order_id);
      }
      let fulfillments = [];
      const result = await super.read({
        request: {
          filter: grpcClient.toStruct({
            id: {
              $in: orderIDs
            }
          })
        }
      });
      const orderDataResponses = result.items;
      const cpClient = new grpcClient.Client(this.cfg.get('client:contact-point-srv'), this.logger);
      const cpService = await cpClient.connect();

      const addressClient = new grpcClient.Client(this.cfg.get('client:address-srv'), this.logger);
      const addressService = await addressClient.connect();
      const countryClient = new grpcClient.Client(this.cfg.get('client:country-srv'), this.logger);
      const countryService = await countryClient.connect();
      const orgClient = new grpcClient.Client(this.cfg.get('client:organization-srv'), this.logger);
      const orgService = await orgClient.connect();

      const cpTypeClient = new grpcClient.Client(this.cfg.get('client:contact-point-type-srv'), this.logger);
      const cpTypeService = await cpTypeClient.connect();

      const fulfillmentClient = new grpcClient.Client(this.cfg.get('client:fulfillment-srv'), this.logger);
      const fulfillmentService = await fulfillmentClient.connect();
      // shipper will be same for all the Orders
      const orgResult = await orgService.read({
        filter: grpcClient.toStruct({
          system_owner: {
            $eq: true
          }
        })
      });
      const org = orgResult.data.items[0];
      const orgCPs = org.contact_point_ids;

      let org_contact_point;
      for (let cp_id of orgCPs) {
        const orgCP = await cpService.read({
          filter: grpcClient.toStruct({
            id: {
              $eq: cp_id
            }
          })
        });
        org_contact_point = orgCP.data.items[0];
        const typeID = org_contact_point.contact_point_type_id;
        const org_contact_point_type = await cpTypeService.read({
          filter: grpcClient.toStruct({
            id: {
              $eq: typeID
            }
          })
        });

        if (org_contact_point_type.data.items[0].type === 'shipping') {
          break;
        }
      }

      const senderAddressResult = await addressService.read({
        filter: grpcClient.toStruct({
          id: {
            $eq: org_contact_point.physical_address_id
          }
        })
      });
      const senderAddress = senderAddressResult.data.items[0];

      const senderCountryResult = await countryService.read({
        filter: grpcClient.toStruct({
          id: {
            $eq: senderAddress.country_id
          }
        })
      });
      const senderCountry = senderCountryResult.data.items[0];
      senderCountryEconomicArea = senderCountry.economic_areas;
      placeOfCommital = senderCountry.country_code;

      const sender_name1 = org.name;
      const sender_streetName = senderAddress.street;
      const sender_streetNumber = senderAddress.building_number;
      let sender_addressAddition;
      if (senderAddress.addressAddition) {
        sender_addressAddition = {
          field1: senderAddress.addressAddition.field1,
          field2: senderAddress.addressAddition.field2
        };
      }
      const sender_zip = senderAddress.postcode;
      const sender_city = senderAddress.locality;
      const sender_origin = {
        country: senderCountry.name,
        countryISOCode: senderCountry.country_code
      };

      const sender_communication = {
        email: org_contact_point.email,
        phone: org_contact_point.telephone
      };

      const Shipper = {
        Name: { name1: sender_name1 },
        Address: {
          streetName: sender_streetName,
          streetNumber: sender_streetNumber,
          zip: sender_zip,
          city: sender_city,
          addressAddition: sender_addressAddition,
          Origin: sender_origin
        },
        Communication: sender_communication
      };

      for (let order of orderDataResponses) {
        let fulfillOrder: Fulfillment = {};
        fulfillOrder.OrderId = order.id;
        // TODO change this to courier service
        fulfillOrder.fulFillmentService = 'DHL';

        let receiverAddress;
        let country;
        let contact_point;

        if (!order.shipping_contact_point_id) {
          throw new Error('Shipment address missing');
        }
        contact_point = await cpService.read({
          filter: grpcClient.toStruct({
            id: {
              $eq: order.shipping_contact_point_id
            }
          })
        });
        contact_point = contact_point.data.items[0];

        if (!contact_point || !contact_point.physical_address_id) {
          throw new Error('Address missing in contact point');
        }
        receiverAddress = await addressService.read({
          filter: grpcClient.toStruct({
            id: {
              $eq: contact_point.physical_address_id
            }
          })
        });
        receiverAddress = receiverAddress.data.items[0];

        if (!receiverAddress || !receiverAddress.country_id) {
          throw new Error('Country missing in Address');
        }
        country = await countryService.read({
          filter: grpcClient.toStruct({
            id: {
              $eq: receiverAddress.country_id
            }
          })
        });
        country = country.data.items[0];
        receiverCountryEconomicArea = country.economic_areas;

        // TODO The format of some of the address data is mismatched
        // between the way it's stored in the database and the way it's sent to the fulfillment service

        // First check the org_name if its not present then look up at user first and last name
        let full_name;
        full_name = receiverAddress.org_name;
        if (!full_name) {
          full_name = `${receiverAddress.first_name} ${receiverAddress.last_name}`;
        }
        const name1 = full_name;
        const streetName = receiverAddress.street;
        const streetNumber = receiverAddress.building_number;
        let addressAddition;
        if (receiverAddress.addressAddition) {
          addressAddition = {
            field1: receiverAddress.addressAddition.field1,
            field2: receiverAddress.addressAddition.field2
          };
        }
        const zip = receiverAddress.postcode;
        const city = receiverAddress.locality;
        const Origin = {
          country: country.name,
          countryISOCode: country.country_code
        };

        const Communication = {
          email: contact_point.email,
          phone: contact_point.telephone
        };
        const Notification = {
          recipientEmailAddress: contact_point.email
        };

        const Receiver = {
          name1,
          Address: {
            streetName,
            streetNumber,
            zip,
            city,
            addressAddition,
            Origin
          },
          Communication
        };

        // check from input if orderid is same then extract shipments
        shipments = [];
        for (let each_order_data of order_data) {
          if (each_order_data.order_id === order.id) {
            for (let eachShipment of each_order_data.shipments) {
              eachShipment['weightInKG'] = eachShipment.total_weight_in_kg;
              delete eachShipment['total_weight_in_kg'];
              // Check if sender and receiver countries EEA are same, if not
              // add export document details
              if (JSON.stringify(senderCountryEconomicArea) != JSON.stringify(receiverCountryEconomicArea)) {
                if (eachShipment['individual_weight_in_kg'] === 0) {
                  throw new Error('Indvidual weight of each item should be specified');
                } else if (eachShipment['amount'] === 0) {
                  throw new Error('Number of items should be specified');
                } else if (_.isEmpty(eachShipment['export_type'])) {
                  throw new Error('Export type missing for International shipment');
                } else if (_.isEmpty(eachShipment.export_description)) {
                  throw new Error('Export description missing for International shipment');
                } else if (_.isEmpty(eachShipment.customs_tariff_number)) {
                  throw new Error('Export customs tariff number missing for International shipment');
                } else if (_.isEmpty(eachShipment.customs_value)) {
                  throw new Error('Export customs value missing for International shipment');
                }
                eachShipment['ExportDocument'] = {
                  exportType: eachShipment.export_type,
                  ExportDocPosition: {
                    // TODO update it after generating the invoice
                    // use a local array or store in redis, store as orderID:InvoiceNumber)
                    invoiceNumber: '',
                    description: eachShipment.export_description,
                    countryCodeOrigin: senderCountry.country_code,
                    customsTariffNumber: eachShipment.customs_tariff_number,
                    netWeightInKG: eachShipment.individual_weight_in_kg,
                    customsValue: eachShipment.customs_value,
                    amount: eachShipment.amount
                  }
                };
              }
              delete eachShipment['individual_weight_in_kg'];
              delete eachShipment['amount'];
              delete eachShipment['export_type'];
              delete eachShipment['country_code'];
              delete eachShipment['customs_tariff_number'];
              delete eachShipment['customs_value'];
              delete eachShipment['export_description'];
              delete eachShipment['invoice_number'];
              shipments.push({ ShipmentItem: eachShipment });
            }
          }
        }

        fulfillOrder.Shipment = {
          ShipmentDetails: shipments,
          Receiver,
          Shipper,
          Notification
        };
        fulfillments.push(fulfillOrder);
        order.status = STATUS_IN_PROGRESS;
      }

      // shipmentOrderLists
      const fulfillmentMsg = {
        ShipmentOrder: {
          fulfillmentList: fulfillments,
          meta
        }
      };
      const fulfillmentResult = await fulfillmentService.createFulfillment(fulfillmentMsg);
      this.logger.info('Response from fulfilment-srv is:', { fulfillmentResult });

      if (fulfillmentResult && fulfillmentResult.data
        && fulfillmentResult.data.fulfillmentResults) {
        const fulfillmentStatusList = fulfillmentResult.data.fulfillmentResults;
        for (let ffStatus of fulfillmentStatusList) {
          if (ffStatus.Status.OrderStatus === 'Created') {
            ffStatus.Status.OrderStatus = STATUS_IN_PROGRESS;
          }
        }
      }

      // change order status to fulfillment in progress
      await super.update({
        request: {
          items: orderDataResponses
        }
      });
      return fulfillmentResult.data;
    } catch (err) {
      this.logger.error(`Error occured while creating fulfillment for ${orderIDs}`, { error: err.message });
      return `There was an error creating the fulfillment for ${JSON.stringify(orderIDs)} :
        ${err.message}`;
    }
  }
}
