import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { parse as CSV } from 'csv-parse/sync';
import { type CallContext } from 'nice-grpc-common';
import { BigNumber } from 'bignumber.js';
import { Logger } from '@restorecommerce/logger';
import { ServiceConfig } from '@restorecommerce/service-config';
import {
  database
} from '@restorecommerce/chassis-srv';
import {
  Client,
  createClient,
  createChannel,
  GrpcClientConfig
} from '@restorecommerce/grpc-client';
import {
  ACSClientContext,
  AuthZAction,
  DefaultACSClientContextFactory,
  Operation,
  DefaultResourceFactory,
  DefaultMetaDataInjector,
  access_controlled_function,
  injects_meta_data,
  resolves_subject,
} from '@restorecommerce/acs-client';
import { Topic } from '@restorecommerce/kafka-client';
import {
  OrderList,
  FulfillmentRequestList,
  Order,
  OrderState,
  OrderIdList,
  OrderListResponse,
  OrderServiceImplementation,
  OrderingInvoiceRequestList,
  FulfillmentInvoiceMode,
  OrderSubmitListResponse,
  FulfillmentRequest,
  OrderingInvoiceRequest,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order.js';
import {
  Product,
  ProductServiceDefinition,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/product.js';
import {
  TaxServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/tax.js';
import {
  CustomerServiceDefinition, CustomerType,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/customer.js';
import {
  ShopServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/shop.js';
import {
  OrganizationServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/organization.js';
import {
  ContactPointServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/contact_point.js';
import {
  FulfillmentServiceDefinition,
  Item as FulfillmentItem,
  FulfillmentListResponse,
  FulfillmentResponse,
  Packaging,
  Fulfillment,
  FulfillmentState,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment.js';
import {
  FulfillmentProductServiceDefinition,
  FulfillmentSolutionQuery,
  FulfillmentSolutionQueryList,
  FulfillmentSolutionListResponse,
  FulfillmentSolutionResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment_product.js';
import {
  Filter_Operation
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/filter.js';
import {
  Filter_ValueType,
  FilterOp_Operator,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/resource_base.js';
import {
  StatusListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/status.js';
import {
  InvoiceListResponse,
  InvoiceResponse,
  Section,
  Position,
  InvoiceServiceDefinition,
  InvoiceList,
  Invoice,
  PaymentState
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/invoice.js';
import {
  Subject
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth.js';
import {
  AddressServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/address.js';
import {
  CountryServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/country.js';
import {
  CurrencyServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/currency.js';
import {
  NotificationReqServiceDefinition,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/notification_req.js';
import {
  Setting,
  SettingServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/setting.js';
import {
  RenderRequest_Template,
  RenderRequestList,
  RenderResponseList,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/rendering.js';
import {
  ManufacturerServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/manufacturer.js';
import {
  UserServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/user.js';
import {
  Template,
  TemplateServiceDefinition,
  TemplateUseCase
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/template.js';
import {
  AccessControlledServiceBase,
  AccessControlledServiceBaseOperationStatusCodes,
} from '@restorecommerce/resource-base-interface/lib/experimental/AccessControlledServiceBase.js';
import {
  ClientRegister,
  ResourceAggregator,
  ResourceAwaitQueue,
  ResourceMap,
  Pipe,
} from '@restorecommerce/resource-base-interface/lib/experimental/index.js';
import {
  DefaultUrns,
  FulfillmentMap,
  FulfillmentSolutionMap,
  ResolvedSettingMap,
  ProductNature,
  ProductVariant,
  RatioedTax,
  toObjectMap,
  parseSetting,
  ResolvedSetting,
  DefaultSetting,
  OrderAggregationTemplate,
  AggregatedOrderListResponse,
  resolveCustomerAddress,
  marshallProtobufAny,
  createOperationStatusCode,
  createStatusCode,
  throwStatusCode,
  OrderMap,
  calcAmount,
  calcTotalAmounts,
  packRenderData,
  StateMap,
} from './utils.js';
import {
  OperationStatusCodes,
  ServiceBaseStatusCodes,
  StatusCodes
} from '@restorecommerce/resource-base-interface';

const CREATE_FULFILLMENT = 'createFulfillment';
const CREATE_INVOICE = 'createInvoice';

export const OrderingStatusCodes = {
  ...ServiceBaseStatusCodes,
  ITEM_NOT_FOUND: {
    code: 404,
    message: '{entity} {id} not found!',
  },
  NO_LEGAL_ADDRESS: {
    code: 404,
    message: '{entity} {id} has no legal address!',
  },
  NO_SHIPPING_ADDRESS: {
    code: 404,
    message: '{entity} {id} has no shipping address!',
  },
  NOT_SUBMITTED: {
    code: 400,
    message: '{entity} {id} expected to be submitted!',
  },
  NO_ITEM: {
    code: 400,
    message: '{entity} {id} has no item in query',
  },
  NO_AMOUNT: {
    code: 400,
    message: '{entity} {id} amount is missing',
  },
  NO_PHYSICAL_ITEM: {
    code: 207,
    message: '{entity} {id} includes no physical item!',
  },
  IN_HOMOGEN_INVOICE: {
    code: 400,
    message: '{entity} {id} must have identical customer_id and shop_id to master {entity}!',
  },
  SOLUTION_NOT_FOUND: {
    code: 404,
    message: 'Solution for {entity} {id} not found!',
  },
  SUB_SERVICE_ERROR: {
    code: 500,
    message: 'Order {id} rejected due to errors in {entity}: {details}!'
  },
  CONTENT_NOT_SUPPORTED: {
    code: 400,
    message: '{entity} {id}: Content type {details} is not supported!',
  },
  PROTOCOL_NOT_SUPPORTED: {
    code: 400,
    message: '{entity} {id}: Protocol of {details} is not supported!',
  },
  FETCH_FAILED: {
    code: 500,
    message: '{entity} {id}: {details}!',
  },
  NO_TEMPLATE_BODY: {
    code: 500,
    message: 'No body defined in template {id}!',
  },
  OUT_OF_STOCK: {
    code: 400,
    message: 'The following {entity} are out of stock {id}!',
  },
  OVERBOOKED: {
    code: 207,
    message: 'Warning: The following {entity} are overbooked {id}!',
  },
};
export type OrderingStatusCodes = StatusCodes<typeof OrderingStatusCodes>;

export const OrderingOperationStatusCodes = {
  ...AccessControlledServiceBaseOperationStatusCodes,
  LIMIT_EXHAUSTED: {
    code: 500,
    message: 'Query limit 1000 exhausted!',
  },
  CONFLICT: {
    code: 409,
    message: 'Resource conflict, ID already in use!'
  },
  NO_ITEM: {
    code: 400,
    message: 'No {entity} in query!',
  },
  ITEM_NOT_FOUND: {
    code: 404,
    message: '{entity} {id} not found!',
  },
  INVALID_INVOICES: {
    code: 500,
    message: 'Invalid invoices!'
  },
  NO_TEMPLATES: {
    code: 500,
    message: 'No render templates defined!',
  },
  TIMEOUT: {
    code: 500,
    message: 'Request timeout, API not responding!',
  },
};
export type OrderingOperationStatusCodes = OperationStatusCodes<typeof OrderingOperationStatusCodes>

export class OrderingService
  extends AccessControlledServiceBase<OrderListResponse, OrderList>
  implements OrderServiceImplementation
{
  private static async ACSContextFactory(
    self: OrderingService,
    request: OrderList & OrderIdList & FulfillmentRequestList & OrderingInvoiceRequestList,
    context: any,
  ): Promise<ACSClientContext> {
    const ids = request.ids ?? request.items?.map(
      (item: Order & FulfillmentRequest & OrderingInvoiceRequest) => item.id ?? item.order_id
    ) ?? [] as string[];
    const resources = await self.get(ids, request.subject!, context);
    return {
      ...context,
      subject: request.subject,
      resources: [
        ...resources.items ?? [],
        ...request.items ?? [],
      ],
    };
  }

  private readonly urns = DefaultUrns;
  protected readonly tech_user: Subject;
  protected readonly emitters: Record<string, string>;
  protected readonly product_service?: Client<ProductServiceDefinition>;
  protected readonly notification_service?: Client<NotificationReqServiceDefinition>;
  protected readonly fulfillment_service?: Client<FulfillmentServiceDefinition>;
  protected readonly fulfillment_product_service?: Client<FulfillmentProductServiceDefinition>;
  protected readonly invoice_service?: Client<InvoiceServiceDefinition>;
  protected readonly awaits_render_result = new ResourceAwaitQueue<string[]>;
  protected readonly default_setting: ResolvedSetting;
  protected readonly default_templates: Template[] = [];
  protected readonly kafka_timeout: number = 15000;
  protected readonly contact_point_type_ids = {
    legal: 'legal',
    shipping: 'shipping',
    billing: 'billing',
  };

  override get operationStatusCodes(): OrderingOperationStatusCodes {
    return super.operationStatusCodes;
  }

  override get statusCodes(): OrderingStatusCodes {
    return super.statusCodes;
  }

  override set operationStatusCodes(value: OrderingOperationStatusCodes) {
    super.operationStatusCodes = value;
  }

  get entityName() {
    return this.name;
  }

  constructor(
    protected readonly orderingTopic: Topic,
    protected readonly renderingTopic: Topic,
    protected readonly db: database.DatabaseProvider,
    public readonly cfg: ServiceConfig,
    logger: Logger,
    client_register = new ClientRegister(cfg, logger),
    protected readonly aggregator = new ResourceAggregator(cfg, logger, client_register),
  ) {
    super(
      cfg.get('database:main:entities:0') ?? 'order',
      orderingTopic as any,
      db,
      cfg,
      logger,
      cfg.get('events:enableEvents')?.toString() === 'true',
      cfg.get('database:main:collections:0') ?? 'orders',
    );

    this.urns = {
      ...this.urns,
      ...cfg.get('urns'),
      ...cfg.get('authentication:urns'),
    };
    super.statusCodes = {
      ...OrderingStatusCodes,
      ...cfg?.get('statusCodes'),
    };
    super.operationStatusCodes = {
      ...OrderingOperationStatusCodes,
      ...cfg?.get('operationStatusCodes'),
    };
    this.contact_point_type_ids = {
      ...this.contact_point_type_ids,
      ...cfg.get('contactPointTypeIds'),
    };
    this.default_setting = {
      ...DefaultSetting,
      ...cfg.get('defaults:Setting'),
    };
    
    this.emitters = cfg.get('events:emitters');
    this.tech_user = cfg.get('authorization:techUser');
    this.kafka_timeout = cfg.get<number>('events:kafka:timeout') ?? 5000;

    const product_cfg = cfg.get('client:product');
    if (product_cfg.disabled?.toString() === 'true') {
      this.logger?.info('Notification-srv disabled!');
    }
    else if (product_cfg) {
      this.product_service = createClient(
        {
          ...product_cfg,
          logger
        } as GrpcClientConfig,
        ProductServiceDefinition,
        createChannel(product_cfg.address)
      );
    }
    else {
      this.logger?.warn('product config is missing!');
    }

    // optional Fulfillment
    const fulfillment_cfg = cfg.get('client:fulfillment');
    if (fulfillment_cfg.disabled?.toString() === 'true') {
      this.logger?.info('Fulfillment-srv disabled!');
    }
    else if (fulfillment_cfg) {
      this.logger?.debug('Fulfillment-srv enabled.', fulfillment_cfg);
      this.fulfillment_service = createClient(
        {
          ...fulfillment_cfg,
          logger
        } as GrpcClientConfig,
        FulfillmentServiceDefinition,
        createChannel(fulfillment_cfg.address)
      );
    }
    else {
      this.logger?.warn('fulfillment config is missing!');
    }

    const fulfillment_product_cfg = cfg.get('client:fulfillment_product');
    if (fulfillment_product_cfg.disabled?.toString() === 'true') {
      this.logger?.info('Fulfillment-Product-srv disabled!');
    }
    else if (fulfillment_product_cfg) {
      this.logger?.debug('Fulfillment-Product-srv enabled.', fulfillment_product_cfg);
      this.fulfillment_product_service = createClient(
        {
          ...fulfillment_product_cfg,
          logger
        } as GrpcClientConfig,
        FulfillmentProductServiceDefinition,
        createChannel(fulfillment_product_cfg.address)
      );
    }
    else {
      this.logger?.warn('fulfillment_product config is missing!');
    }

    const notification_cfg = cfg.get('client:notification_req');
    if (notification_cfg.disabled?.toString() === 'true') {
      this.logger?.info('Notification-srv disabled!');
    }
    else if (notification_cfg) {
      this.notification_service = createClient(
        {
          ...notification_cfg,
          logger
        } as GrpcClientConfig,
        NotificationReqServiceDefinition,
        createChannel(notification_cfg.address)
      );
    }
    else {
      this.logger?.warn('notification config is missing!');
    }

    const invoicing_cfg = cfg.get('client:invoice');
    if (invoicing_cfg.disabled?.toString() === 'true') {
      this.logger?.info('Invoicing-srv disabled!');
    }
    else if (invoicing_cfg) {
      this.invoice_service = createClient(
        {
          ...invoicing_cfg,
          logger
        } as GrpcClientConfig,
        InvoiceServiceDefinition,
        createChannel(invoicing_cfg.address)
      );
    }
    else {
      this.logger?.warn('invoice config is missing!');
    }
  }

  private getOrderMap(
    ids: (string | undefined)[] | undefined,
    subject?: Subject,
    context?: CallContext,
  ): Promise<OrderMap> {
    return this.get(
      ids,
      subject,
      context
    ).then(
      response => {
        if (response.operation_status?.code < 300) {
          return toObjectMap(response.items);
        }
        else {
          throw response.operation_status;
        }
      }
    );
  }

  protected async aggregateProductBundles(
    products: ResourceMap<Product>,
    output?: ResourceMap<Product>,
  ): Promise<ResourceMap<Product>> {
    output ??= products;
    const ids = products?.all.filter(
      p => p.bundle
    ).flatMap(
      p => p.bundle.products.map(
        p => p.product_id
      )
    ).filter(
      id => !output.has(id)
    );

    if (ids?.length) {
      const bundled_products = await this.aggregator.getByIds<Product>(
        ids,
        ProductServiceDefinition
      );

      bundled_products.forEach(
        p => output.set(p.id, p)
      );

      await this.aggregateProductBundles(
        bundled_products,
        output,
      );
    }
    return output;
  }

  protected async aggregate(
    orders: OrderListResponse,
    subject?: Subject,
    context?: CallContext,
  ): Promise<AggregatedOrderListResponse> {
    const aggregation = await this.aggregator.aggregate(
      orders,
      [
        {
          service: ShopServiceDefinition,
          map_by_ids: (orders) => orders.items?.map(
            i => i.payload.shop_id
          ),
          container: 'shops',
          entity: 'Shop',
        },
        {
          service: CustomerServiceDefinition,
          map_by_ids: (orders) => orders.items?.map(
            i => i.payload.customer_id
          ),
          container: 'customers',
          entity: 'Customer',
        },
        {
          service: ProductServiceDefinition,
          map_by_ids: (orders) => orders.items?.flatMap(
            item => item.payload.items
          )?.flatMap(
            item => item?.product_id
          ),
          container: 'products',
          entity: 'Product',
        },
      ],
      {} as OrderAggregationTemplate,
      subject,
      context,
    ).then(
      async aggregation => {
        aggregation.products = await this.aggregateProductBundles(
          aggregation.products
        );
        return aggregation;
      }
    ).then(
      async aggregation => await this.aggregator.aggregate(
        aggregation,
        [
          {
            service: UserServiceDefinition,
            map_by_ids: (aggregation) => [].concat(
              subject?.id,
              aggregation.items?.map(item => item.payload.user_id),
              aggregation.customers?.all.map(customer => customer.private?.user_id)
            ),
            container: 'users',
            entity: 'User',
          },
          {
            service: OrganizationServiceDefinition,
            map_by_ids: (aggregation) => [].concat(
              aggregation.customers?.all.map(
                customer => customer.public_sector?.organization_id
              ),
              aggregation.customers?.all.map(
                customer => customer.commercial?.organization_id
              ),
              aggregation.shops?.all.map(
                shop => shop?.organization_id
              ),
            ),
            container: 'organizations',
            entity: 'Organization',
          },
          {
            service: ManufacturerServiceDefinition,
            map_by_ids: (aggregation) => aggregation.products?.all.map(
              product => product!.product?.manufacturer_id
            ),
            container: 'manufacturers',
            entity: 'Manufacturer',
          },
          {
            service: TaxServiceDefinition,
            map_by_ids: (aggregation) => aggregation.products?.all.flatMap(
              product => [
                product.product?.tax_ids,
                product.product?.physical?.variants?.flatMap(
                  variant => variant.tax_ids
                ),
                product.product?.virtual?.variants?.flatMap(
                  variant => variant.tax_ids
                ),
                product.product?.service?.variants?.flatMap(
                  variant => variant.tax_ids
                ),
              ].flatMap(ids => ids)
            ),
            container: 'taxes',
            entity: 'Tax',
          },
          {
            service: TemplateServiceDefinition,
            map_by_ids: (aggregation) => aggregation.shops?.all.flatMap(
              shop => shop?.template_ids
            ),
            container: 'templates',
            entity: 'Template',
          },
          {
            service: SettingServiceDefinition,
            map_by_ids: (aggregation) => [].concat(
              aggregation.shops?.all.map(
                shop => shop?.setting_id
              ),
              aggregation.customers?.all.map(
                customer => customer?.setting_id
              ),
            ),
            container: 'settings',
            entity: 'Setting',
          },
          {
            service: CurrencyServiceDefinition,
            map_by_ids: (aggregation) => aggregation.products.all.flatMap(
              product => [
                product.product?.physical?.templates?.map(
                  t => t.price?.currency_id
                ),
                product.product?.physical?.variants?.map(
                  t => t.price?.currency_id
                ),
                product.product?.virtual?.templates?.map(
                  t => t.price?.currency_id
                ),
                product.product?.virtual?.variants?.map(
                  t => t.price?.currency_id
                ),
                product.product?.service?.templates?.map(
                  t => t.price?.currency_id
                ),
                product.product?.service?.variants?.map(
                  t => t.price?.currency_id
                ),
              ].flatMap(ids => ids)
            ),
            container: 'currencies',
            entity: 'Currency'
          }
        ],
        {} as OrderAggregationTemplate,
        subject,
        context,
      )
    ).then(
      async aggregation => await this.aggregator.aggregate(
        aggregation,
        [
          {
            service: ContactPointServiceDefinition,
            map_by_ids: (aggregation) => [
              aggregation.customers.all.flatMap(
                customer => customer.private?.contact_point_ids
              ),
              aggregation.organizations.all.flatMap(
                organization => organization.contact_point_ids
              )
            ].flatMap(ids => ids),
            container: 'contact_points',
            entity: 'ContactPoint',
          },
        ],
        {} as OrderAggregationTemplate,
        subject,
        context,
      )
    ).then(
      async aggregation => await this.aggregator.aggregate(
        aggregation,
        [
          {
            service: AddressServiceDefinition,
            map_by_ids: (aggregation) => [].concat(
              aggregation.contact_points.all.map(
                cp => cp.physical_address_id
              ),
              aggregation.items.map(
                item => item.payload?.billing_address?.address?.id
              ),
              aggregation.items.map(
                item => item.payload?.shipping_address?.address?.id
              ),
            ),
            container: 'addresses',
            entity: 'Address',
          },
        ],
        {} as OrderAggregationTemplate,
        subject,
        context,
      )
    ).then(
      async aggregation => await this.aggregator.aggregate(
        aggregation,
        [
          {
            service: CountryServiceDefinition,
            map_by_ids: (aggregation) => [].concat(
              aggregation.addresses.all.map(
                a => a.country_id
              ),
              aggregation.taxes.all.map(
                tax => tax.country_id
              ),
              /*aggregation.currencies.all.flatMap(
                currency => currency.country_ids
              ),*/
              aggregation.items.map(
                item => item.payload?.billing_address?.address?.country_id
              ),
              aggregation.items.map(
                item => item.payload?.shipping_address?.address?.country_id
              ),
            ),
            container: 'countries',
            entity: 'Country',
          },
        ],
        {} as OrderAggregationTemplate,
        subject,
        context,
      )
    ).then(
      aggregation => {
        aggregation.items?.forEach(
          item => {
            try {
              item.payload.shipping_address ??= resolveCustomerAddress(
                item.payload,
                aggregation,
                this.contact_point_type_ids.shipping,
              );
              item.payload.billing_address ??= resolveCustomerAddress(
                item.payload,
                aggregation,
                this.contact_point_type_ids.billing,
              );
              delete item.payload.shipping_address?.address?.meta;
              delete item.payload.billing_address?.address?.meta;
            }
            catch (e: any) {
              this.catchStatusError(e, item);
            }
          }
        );
        return aggregation;
      }
    );
    return aggregation;
  }

  private mergeProductVariantRecursive(
    nature?: ProductNature,
    variant_id?: string,
    product_id?: string,
  ): ProductVariant {
    const variant = nature?.templates?.find(
      v => v.id === variant_id
    ) ?? nature?.variants?.find(
      v => v.id === variant_id
    );
    if (!variant) {
      throw createStatusCode(
        product_id,
        'ProductVariant',
        this.statusCodes.ITEM_NOT_FOUND,
        `${product_id}:${variant_id}`,
      );
    }
    if (variant?.parent_variant_id) {
      const template = this.mergeProductVariantRecursive(
        nature,
        variant.parent_variant_id
      );
      return {
        ...template,
        ...variant,
      };
    }
    else {
      return variant;
    }
  };

  private flatMapProductToFulfillmentItem(
    aggreation: AggregatedOrderListResponse,
    product_id: string,
    variant_id?: string,
    quantity = 1
  ): FulfillmentItem[] {
    const main = aggreation.products.get(product_id);
    if (main?.product?.physical) {
      const variant = this.mergeProductVariantRecursive(
        main.product.physical,
        variant_id,
        product_id,
      );
      if (!variant) {
        throw createStatusCode(
          product_id,
          'ProductVariant',
          this.statusCodes.ITEM_NOT_FOUND,
          `${product_id}:${variant_id}`
        );
      }

      return [{
        product_id: main.id,
        variant_id,
        quantity,
        name: variant.name,
        description: variant.export_description ?? variant.description,
        hs_code: variant.hs_code,
        taric_code: variant.taric_code,
        origin_country_id: main.product.origin_country_id,
        value: {
          currency_id: variant.price?.currency_id,
          net: variant.price?.regular_price,
        },
        package: variant.package,
      }];
    }
    else if (main?.bundle?.pre_packaged) {
      return [{
        product_id: main!.id,
        variant_id,
        quantity,
        package: main!.bundle.pre_packaged,
      }];
    }
    else if (main?.bundle?.products) {
      return main.bundle.products.flatMap(
        item => this.flatMapProductToFulfillmentItem(
          aggreation,
          item.product_id!,
          item.variant_id,
          item.quantity,
        )
      ) ?? [];
    }
    else if (!main) {
      throw createStatusCode(
        product_id,
        'Product',
        this.statusCodes.ITEM_NOT_FOUND,
      );
    }
  };

  private async getFulfillmentMap(
    order_ids: (string | undefined)[] | undefined,
    subject?: Subject,
    context?: CallContext,
    fulfillments?: FulfillmentResponse[],
  ): Promise<FulfillmentMap> {
    if (!this.fulfillment_service) return {};
    order_ids = [...new Set<string | undefined>(order_ids ?? [])];

    if (order_ids.length > 1000) {
      throw createOperationStatusCode(
        this.operationStatusCodes.LIMIT_EXHAUSTED,
        'fulfillment',
      );
    }

    fulfillments ??= await this.fulfillment_service!.read(
      {
        filters: [{
          filters: order_ids?.map(id => ({
            field: 'references[*].instance_id',
            operation: Filter_Operation.in,
            value: id,
          })),
          operator: FilterOp_Operator.or,
        }],
        subject,
      },
      context,
    ).then(
      response => {
        if (response.operation_status?.code < 300) {
          return response.items;
        }
        else {
          throw response.operation_status;
        }
      }
    );
    
    return fulfillments?.reduce(
      (a, b) => {
        b.payload?.references.filter(
          r => r.instance_type === this.urns.order
        ).forEach(
          r => {
            const c = a[r.instance_id];
            if (c) {
              c.push(b);
            }
            else {
              a[r.instance_id] = [b];
            }
          }
        );
        return a;
      },
      {} as FulfillmentMap
    );
  }

  private resolveSettings(
    ...settings: Setting[]
  ): ResolvedSetting {
    const smap = new Map<string, string>(
      settings?.flatMap(
        s => s?.settings?.map(
          s => [s.id, s.value]
        ) ?? []
      ) ?? []
    );
    const sobj = Object.assign(
      {},
      ...Object.entries(this.urns).filter(
        ([key, value]) => smap.has(value)
      ).map(
        ([key, value]) => ({ [key]: parseSetting(key, smap.get(value)) })
      )
    );
    
    return {
      ...this.default_setting,
      ...sobj,
    };
  }

  private async aggregateSettings(
    aggregation: AggregatedOrderListResponse,
  ): Promise<ResolvedSettingMap> {
    const resolved_settings: ResolvedSettingMap = new Map(
      aggregation.items.map(
        (item) => {
          const shop = aggregation.shops.get(item.payload.shop_id);
          const customer = aggregation.customers.get(item.payload.customer_id);
          const settings = [
            aggregation.settings.get(shop.setting_id),
            aggregation.settings.get(customer.setting_id)
          ];
          return [item.payload.id, this.resolveSettings(
            ...settings
          )];
        }
      )
    );
    return resolved_settings;
  }

  protected async resolveOrderListResponse(
    aggregation: AggregatedOrderListResponse,
    subject?: Subject,
    context?: CallContext,
  ): Promise<OrderListResponse> {
    if (!aggregation?.items?.length) {
      return {
        operation_status: createOperationStatusCode(
          this.operationStatusCodes.NO_ITEM,
          'order',
        )
      };
    }

    const getTaxesRecursive = async (
      main: Product,
      price_ratio = 1.0
    ): Promise<RatioedTax[]> => {
      if (main.bundle) {
        return await Promise.all(
          main?.bundle?.products?.flatMap(
            p => getTaxesRecursive(
              aggregation.products.get(p?.product_id),
              (p.price_ratio ?? 0) * price_ratio
            )
          ).filter(t => t) ?? []
        ).then(
          promise => promise.flatMap(p => p)
        );
      }
      else {
        return aggregation.taxes.getMany(
          [].concat(
            main.product?.tax_ids,
            main.product?.physical?.variants?.flatMap(
              variant => variant.tax_ids
            ),
            main.product?.virtual?.variants?.flatMap(
              variant => variant.tax_ids
            ),
            main.product?.service?.variants?.flatMap(
              variant => variant.tax_ids
            ),
          ).filter(t => t)
        );
      }
    };

    const promises = aggregation.items?.map(async (order) => {
      try {
        if (order.status?.code && order.status.code >= 300) {
          return order;
        }
        const customer = aggregation.customers.get(order.payload.customer_id);
        const billing_country = aggregation.countries.get(
          order.payload?.billing_address?.address?.country_id
        );

        if (customer?.private) {
          order.payload.customer_type ??= CustomerType.PRIVATE;
          order.payload.user_id ??= customer?.private?.user_id;
        }
        else if (customer?.commercial) {
          const vat_id = aggregation.organizations.get(
            customer.commercial?.organization_id
          )?.vat_id;
          order.payload.customer_type ??= CustomerType.COMMERCIAL;
          order.payload.customer_vat_id ??= vat_id;
        }
        else if (customer?.public_sector) {
          const vat_id = aggregation.organizations.get(
            customer.public_sector?.organization_id
          )?.vat_id;
          order.payload.customer_type ??= CustomerType.PUBLIC_SECTOR;
          order.payload.customer_vat_id ??= vat_id;
        }
        order.payload.user_id ??= subject?.id;

        const shop = aggregation.shops.get(order.payload.shop_id); 
        const shop_country = new Pipe(
          aggregation.shops.get(order.payload.shop_id)
        ).then(
          shop => aggregation.organizations.get(shop.organization_id)
        ).then(
          orga => aggregation.contact_points.getMany(orga.contact_point_ids)
        ).then(
          cps => cps.find(
            (cp) => cp.contact_point_type_ids?.includes(
              this.contact_point_type_ids.legal
            )
          )
        ).then(
          cp => aggregation.addresses.get(cp.physical_address_id)
        ).then(
          address => aggregation.countries.get(address.country_id)
        ).value;

        if (!shop_country) {
          throw createStatusCode(
            order.payload.id,
            'Shop',
            this.statusCodes.NO_LEGAL_ADDRESS,
            order.payload.shop_id,
          )
        };

        if (!order.payload.shipping_address) {
          throwStatusCode(
            order?.payload.id,
            'Order',
            this.statusCodes.NO_SHIPPING_ADDRESS,
            order?.payload.id,
          );
        }

        if (order.payload.items?.length) {
          await Promise.all(order.payload.items?.map(
            async (item) => {
              const product = aggregation.products.get(item.product_id);
              const nature = product.product?.physical ?? product.product?.virtual;
              const variant = this.mergeProductVariantRecursive(nature, item.variant_id);
              const currency = aggregation.currencies.get(variant.price?.currency_id);
              const taxes = await getTaxesRecursive(product);
              const unit_price = product.bundle ? product.bundle?.price : variant?.price;
              const net = new BigNumber(
                unit_price?.sale ? unit_price?.sale_price ?? 0 : unit_price?.regular_price ?? 0
              ).multipliedBy(item.quantity ?? 0);
              item.unit_price = unit_price;
              item.amount = calcAmount(
                net, taxes, shop_country,
                billing_country, currency,
                !!customer.private?.user_id
              );
            }
          ) ?? []);
        }
        else {
          throw createStatusCode(
            order?.payload.id,
            'Order',
            this.statusCodes.NO_ITEM,
            order?.payload.id,
          );
        }

        order.payload.total_amounts = calcTotalAmounts(
          order.payload.items.map(item => item.amount),
          aggregation.currencies,
        );

        const has_shop_as_owner = order.payload.meta?.owners?.filter(
          owner => owner.id === this.urns.ownerIndicatoryEntity
            && owner.value === this.urns.organization
        ).some(
          owner => owner.attributes?.some(
            a => a.id === this.urns.ownerInstance
              && a.value === shop.organization_id
          )
        );

        const customer_entity = (
          customer?.private
            ? this.urns.user
            : this.urns.organization
        );
        const customer_instance = (
          customer?.private?.user_id
            ?? customer?.commercial?.organization_id
            ?? customer?.public_sector?.organization_id
        );
        const has_customer_as_owner = order.payload.meta?.owners?.filter(
          owner => owner.id === this.urns.ownerIndicatoryEntity
            && owner.value === customer_entity
        ).some(
          owner => owner.attributes?.some(
            a => a.id === this.urns.ownerInstance
              && a.value === customer_instance
          )
        );

        if (!has_shop_as_owner && shop.organization_id?.length) {
          order.payload.meta.owners.push(
            {
              id: this.urns.ownerIndicatoryEntity,
              value: this.urns.organization,
              attributes: [
                {
                  id: this.urns.ownerInstance,
                  value: shop.organization_id
                }
              ]
            }
          );
        }

        if (!has_customer_as_owner && customer_instance?.length) {
          order.payload.meta.owners.push(
            {
              id: this.urns.ownerIndicatoryEntity,
              value: customer_entity,
              attributes: [
                {
                  id: this.urns.ownerInstance,
                  value: customer_instance
                }
              ]
            }
          );
        };

        order.status ??= createStatusCode(
          order?.payload.id,
          'Order',
          this.statusCodes.SUCCESS,
          order?.payload.id,
        );
        return order;
      }
      catch (e: any) {
        return this.catchStatusError(e, order);
      }
    });

    const items = await Promise.all(promises);
    const operation_status = items.some(
      a => a.status?.code >= 300
    ) ? createOperationStatusCode(
        this.operationStatusCodes.MULTI_STATUS,
        'order',
      ) : createOperationStatusCode(
        this.operationStatusCodes.SUCCESS,
        'order',
      );

    return {
      items,
      total_count: items.length ?? 0,
      operation_status,
    };
  }

  protected async loadDefaultTemplates(
    subject?: Subject,
    context?: CallContext
  ) {
    if(this.default_templates.length) {
      return this.default_templates;
    }

    this.default_templates.push(...(this.cfg.get('defaults:Templates') ?? []));
    const ids = this.default_templates.map(t => t.id).filter(id => id);
    if (ids.length) {
      await this.aggregator.getByIds(
        ids,
        TemplateServiceDefinition,
        this.tech_user ?? subject,
        context,
      ).then(
        resp_map => {
          this.default_templates.forEach(
            template => Object.assign(
              template,
              resp_map.get(template.id, null) // null for ignore missing
            )
          )
        }
      );
    }

    return this.default_templates;
  }

  protected evaluateProducts(
    aggregation: AggregatedOrderListResponse,
    settings?: ResolvedSettingMap,
  ) {
    aggregation.items?.forEach(
      item => {
        const overbooking = settings?.get(item.payload?.id)?.shop_order_overbooking_enabled;
        const out_of_stock = item.payload.items?.filter(
          position => { 
            const main = aggregation.products.get(position.product_id);
            const items = main.bundle?.products ?? [{ ...position, quantity: 1 }];
            return items.some(
              item => {
                const product = aggregation.products.get(item.product_id).product;
                const nature = product?.physical ?? product?.virtual ?? product?.service;
                const variant = nature.variants.find(variant => variant.id === item.variant_id);
                if (variant.stock_level === undefined) {
                  return false;
                }
                const remains = variant.stock_level - position.quantity * item.quantity;
                if (overbooking || remains >= 0) {
                  variant.stock_level = remains;
                }
                return remains < 0;
              }
            );
          }
        );

        if (out_of_stock?.length) {
          item.status = createStatusCode(
            item.payload?.id ?? item.status?.id,
            'ProductVariants',
            overbooking ? this.statusCodes.OVERBOOKED : this.statusCodes.OUT_OF_STOCK,
            out_of_stock.map(item => `${item.product_id}:${item.variant_id}`).join(', ')
          );
        }
      }
    );
  }

  protected async claimProducts(
    aggregation: AggregatedOrderListResponse,
    subject?: Subject,
    context?: CallContext,
  ) {
    const items: Product[] = aggregation.items?.flatMap(
      item => item.payload.items?.flatMap(
        position => { 
          const main = aggregation.products.get(position.product_id);
          const products = main.bundle?.products ?? [{ ...position, quantity: 1 }];
          return products.map(
            main => {
              const product = aggregation.products.get(main.product_id).product;
              const { physical, virtual, service } = product;
              for(const [type, nature] of Object.entries({ physical, virtual, service })) {
                const variant = nature?.variants?.find(v => v.id === position.variant_id);
                if (!variant) continue;
                return {
                  id: main.product_id,
                  product: {
                    [type]: {
                      variants: [{
                        id: position.variant_id,
                        stock_level: variant.stock_level,
                      }]
                    }
                  }
                } as Product
              }
              item.status = createStatusCode(
                item.payload?.id,
                'ProductVariant',
                this.statusCodes.ITEM_NOT_FOUND,
                `${position.product_id}:${position.variant_id}`,
              );
            }
          );
        }
      )
    ).filter(item => item);

    return await this.product_service.update(
      {
        items,
        total_count: items.length,
        subject,
      },
      context,
    );
  }

  public async updateState(
    orders: OrderMap,
    state: OrderState,
    subject?: Subject,
    context?: CallContext,
    aggregation?: AggregatedOrderListResponse,
    settings?: ResolvedSettingMap,
    upsert = false,
  ): Promise<OrderListResponse> {
    const items = Object.values(orders).filter(
      item => item.status?.code < 300 && item.payload
    );
    aggregation ??= await this.aggregate(
      {
        items,
      },
      subject,
      context,
    );
    settings ??= await this.aggregateSettings(
      aggregation
    );

    const action = upsert ? this.superUpsert.bind(this) : this.superUpdate.bind(this);
    const response = await action(
      {
        items: items.map(
          item => {
            item.payload.order_state = state;
            item.payload.history ??= [];
            item.payload.history.push({
              state,
              code: StateMap[state].code,
              message: StateMap[state].message,
              timestamp: new Date(),
            });
            return item.payload;
          }
        ),
        total_count: items.length,
        subject
      },
      context
    ).then(
      response => {
        if (response.operation_status?.code >= 300) {
          throw response.operation_status;
        }
        response.items?.forEach(
          item => {
            const order = orders[item.payload?.id ?? item.status?.id];
            order.payload = item.payload;
            // not !(smaller) includes check for undefined!
            if (!(order.status?.code > item.status?.code)) {
              order.status = item.status;
            }
          }
        );
        return response;
      }
    );
    
    if (this.notification_service) {
      this.logger?.debug(`Send notifications for Order State ${state}...`);
      const default_templates = await this.loadDefaultTemplates();
      const notified = await Promise.all(response.items?.filter(
        item => {
          const setting = settings.get(item.payload?.id);
          return item.status?.code < 300
            && !setting?.shop_order_notifications_disabled;
        }
      ).map(
        item => {
          try {
            const render_id = `order/${StateMap[state].action}/${item.payload.id}`;
            return this.emitRenderRequest(
              item.payload,
              aggregation,
              render_id,
              StateMap[state].templates,
              default_templates,
              subject,
            ).then(
              () => this.awaits_render_result.await(render_id, this.kafka_timeout)
            ).then(
              async (bodies) => {
                const setting = settings.get(item.payload.id);
                const title = bodies.shift();
                const body = bodies.join('');
                const status = await this.sendNotification(
                  item.payload,
                  body,
                  setting,
                  title,
                  context,
                );
                // not !(smaller) includes check for undefined!
                if (!(item.status?.code > status?.code)) {
                  item.status = {
                    ...status,
                    id: item.payload?.id,
                  };
                }
                return item;
              }
            );
          }
          catch (error: any) {
            return this.catchStatusError(
              error, item
            );
          }
        }
      ));
      this.logger.debug('Notification result', notified);
      await this.superUpdate(
        {
          items: notified.map(
            item => {
              item.payload.history ??= [];
              if (item.status?.code < 300) {
                item.payload.history.push({
                  state,
                  code: 200,
                  message: 'Notification sent.',
                  timestamp: new Date(),
                });
              }
              else {
                item.payload.history.push({
                  ...item.status,
                  state: OrderState.INVALID,
                  timestamp: new Date(),
                });
              }
              return item.payload;
            }
          ),
          total_count: notified.length,
          subject
        },
        context
      ).then(
        response => {
          if (response.operation_status?.code >= 300) {
            throw response.operation_status;
          }
          response.items?.forEach(
            item => {
              const order = orders[item.payload?.id ?? item.status?.id];
              order.payload = item.payload;
              // not !(smaller) includes check for undefined!
              if (!(order.status?.code > item.status?.code)) {
                order.status = item.status;
              }
            }
          );
          return response;
        }
      );
    }

    const results = Object.values(orders);
    await Promise.all(results.map(
      async item => {
        if (item.status?.code >= 300 && 'INVALID' in this.emitters) {
          await this.orderingTopic.emit(this.emitters['INVALID'], item);
        }
        else if (item.payload?.order_state in this.emitters) {
          await this.orderingTopic.emit(this.emitters[item.payload.order_state], item.payload);
        }
      }
    ));
    
    return {
      items: results,
      total_count: results.length,
      operation_status: results.some(item => item.status?.code >= 300)
        ? this.operationStatusCodes.MULTI_STATUS
        : this.operationStatusCodes.SUCCESS
    } as OrderListResponse;
  }

  public override superCreate(
    request: OrderList,
    context?: CallContext
  ) {
    request?.items?.forEach(
      item => {
        if (!item.order_state || item.order_state === OrderState.UNRECOGNIZED) {
          item.order_state = OrderState.PENDING;
        }
      }
    );
    return super.superCreate(request, context);
  }

  @resolves_subject()
  @injects_meta_data()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: DefaultACSClientContextFactory,
    resource: DefaultResourceFactory('execution.evaluateOrders'),
    database: 'arangoDB',
    useCache: true,
  })
  public async evaluate(
    request: OrderList,
    context?: CallContext
  ): Promise<OrderListResponse> {
    try {
      const aggregation = await this.aggregate(
        {
          items: request.items.map(
            payload => ({ payload })
          )
        },
        request.subject,
        context,
      );
      const settings = await this.aggregateSettings(
        aggregation
      );
      this.evaluateProducts(aggregation, settings);
      const orders = await this.resolveOrderListResponse(
        aggregation,
        request.subject,
        context
      );
      return orders;
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  @resolves_subject()
  @injects_meta_data()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.submitOrders'),
    database: 'arangoDB',
    useCache: true,
  })
  public async submit(
    request: OrderList,
    context?: CallContext
  ): Promise<OrderSubmitListResponse> {
    try {
      const response_map: OrderMap = {};
      const aggregation = await this.aggregate(
        {
          items: request.items.map(item => ({
            payload: item,
          })),
        },
        request.subject,
        context,
      );
      const settings = await this.aggregateSettings(
        aggregation
      );
      this.evaluateProducts(aggregation, settings);
      const response: OrderSubmitListResponse  = await this.resolveOrderListResponse(
        aggregation,
        request.subject,
        context,
      ).then(
        response => ({
          orders: response.items.map(
            item => {
              response_map[item.payload?.id ?? item.status?.id] = item;
              item.payload.order_state = OrderState.PENDING;
              return item;
            }
          ),
          operation_status: response.operation_status
        })
      );

      if (response.operation_status?.code >= 300) {
        this.logger?.error('On Order Submit', response);
        return response;
      }
      
      try {
        if (this.fulfillment_service) {
          this.logger?.debug('Evaluate fulfillment on submit...');
          const fulfillment_map: Record<string, FulfillmentResponse> = {};
          await this._evaluateFulfillment(
            {
              items: response.orders?.filter(
                item => {
                  const setting = settings.get(item.payload?.id);
                  return item.status?.code < 300
                    && !setting?.shop_fulfillment_evaluate_disabled
                }
              ).map(item => ({
                order_id: item.payload.id,
              })),
              subject: this.tech_user ?? request.subject,
            },
            context,
            response_map,
            aggregation,
          ).then(
            r => {
              r.items?.forEach(
                fulfillment => {
                  const id = fulfillment.payload?.references?.find(
                    r => r.instance_type === this.urns.order
                  )?.instance_id ?? fulfillment.status?.id;
                  const order = response_map[id];
                  if (order && fulfillment.status?.code >= 300) {
                    order.status = createStatusCode(
                      id,
                      'Fulfillment',
                      this.statusCodes.SUB_SERVICE_ERROR,
                      id,
                      fulfillment.status?.message,
                    );
                  }
                  fulfillment_map[id] = fulfillment;
                }
              );

              if (r.operation_status?.code >= 300) {
                throw r.operation_status;
              }
            }
          ).catch(
            error => {
              if (error.message) {
                error = {
                  ...error,
                  message: 'On Fulfillment Evaluate: ' + error.message,
                };
              }
              throw error;
            }
          ).finally(
            () => response.fulfillments = Object.values(fulfillment_map)
          );
          
          this.logger?.debug('Create fulfillment on submit...');
          await this._createFulfillment(
            {
              items: response.orders?.filter(
                item => {
                  const setting = settings.get(item.payload?.id);
                  return item.status?.code < 300
                    && !setting?.shop_fulfillment_create_disabled;
                }
              ).map(item => ({
                order_id: item.payload.id,
              })),
              subject: this.tech_user ?? request.subject,
            },
            context,
            response_map,
            aggregation,
          ).then(
            r => {
              r.items?.forEach(
                fulfillment => {
                  const id = fulfillment.payload?.references?.find(
                    r => r.instance_type === this.urns.order
                  )?.instance_id ?? fulfillment.status?.id;
                  const order = response_map[id];
                  if (order && fulfillment.status?.code >= 300) {
                    order.status = createStatusCode(
                      id,
                      'Fulfillment',
                      this.statusCodes.SUB_SERVICE_ERROR,
                      id,
                      fulfillment.status?.message,
                    );
                  }
                  fulfillment_map[id] = fulfillment;
                }
              );

              if (r.operation_status?.code >= 300) {
                throw r.operation_status;
              }
              return r.items;
            }
          ).catch(
            error => {
              if (error.message) {
                error = {
                  ...error,
                  message: 'On Fulfillment Create: ' + error.message
                };
              }
              throw error;
            }
          ).finally(
            () => response.fulfillments = Object.values(fulfillment_map)
          );
        }

        if (this.invoice_service) {
          this.logger?.debug('Create invoices on submit...');
          response.invoices = [];
          await this._createInvoice(
            {
              items: response.orders?.filter(
                item => {
                  const setting = settings.get(item.payload?.id);
                  return item.status?.code < 300
                    && !setting?.shop_invoice_create_disabled
                    && setting?.shop_invoice_render_disabled
                    && setting?.shop_invoice_send_disabled;
                }
              ).map(
                order => ({
                  sections: [
                    {
                      order_id: order.payload?.id,
                      fulfillment_mode: FulfillmentInvoiceMode.INCLUDE
                    }
                  ]
                })
              ),
              subject: this.tech_user ?? request.subject,
            },
            context,
            response_map,
            response.fulfillments,
            aggregation,
          ).then(
            r => {
              if (r.items) {
                response.invoices.push(...r.items);
                r.items.forEach(
                  item => {
                    const id = item.payload?.references?.find(
                      r => r.instance_type === this.urns.order
                    )?.instance_id;
                    const order = response_map[id];
                    if (order && item.status?.code >= 300) {
                      order.status = createStatusCode(
                        id,
                        'Invoicing',
                        this.statusCodes.SUB_SERVICE_ERROR,
                        id,
                        item.status?.message,
                      );
                    }
                  }
                );
              }

              if (r.operation_status?.code >= 300) {
                throw r.operation_status;
              }
              return r.items;
            }
          ).catch(
            error => {
              if (error.message) {
                error = {
                  ...error,
                  message: 'On Invoice Create: ' + error.message,
                }
              }
              throw error;
            }
          );

          this.logger?.debug('Render invoices on submit...');
          await this._renderInvoice(
            {
              items: response.orders?.filter(
                item => {
                  const setting = settings.get(item.payload?.id);
                  return item.status?.code < 300
                    && (
                      !setting?.shop_invoice_render_disabled
                      || !setting?.shop_invoice_send_disabled
                    );
                }
              ).map(
                order => ({
                  sections: [
                    {
                      order_id: order.payload?.id,
                      fulfillment_mode: FulfillmentInvoiceMode.INCLUDE
                    }
                  ]
                })
              ),
              subject: this.tech_user ?? request.subject,
            },
            context,
            response_map,
            response.fulfillments,
            aggregation,
          ).then(
            r => {
              if (r.items) {
                response.invoices.push(...r.items);
                r.items.forEach(
                  item => {
                    const id = item.payload?.references?.find(
                      r => r.instance_type === this.urns.order
                    )?.instance_id;
                    const order = response_map[id];
                    if (order && item.status?.code >= 300) {
                      order.status = createStatusCode(
                        id,
                        'Invoicing',
                        this.statusCodes.SUB_SERVICE_ERROR,
                        id,
                        item.status?.message,
                      );
                    }
                  }
                );
              }

              if (r.operation_status?.code >= 300) {
                throw r.operation_status;
              }
              return r.items;
            }
          ).catch(
            error => {
              if (error.message) {
                error = {
                  ...error,
                  message: 'On Invoice Render: ' + error.message
                }
              }
              throw error;
            }
          );

          this.logger?.debug('Send invoices on submit...');
          const invoices = response.invoices?.filter(
            item => {
              const setting = settings.get(item.payload?.references?.find(
                r => r.instance_type === this.urns.order
              )?.instance_id);
              return item.status?.code < 300
                && item.payload?.references?.find(
                  r => r.instance_type === this.urns.order
                )?.instance_id
                && !setting?.shop_invoice_send_disabled;
            }
          ).map(
            invoice => ({
              id: invoice.payload.id,
              document_ids: invoice.payload.documents?.map(d => d.id)
            })
          );
          if (invoices?.length) {
            await this.invoice_service.send(
              {
                items: invoices,
                subject: this.tech_user ?? request.subject,
              },
              context,
            ).then(
              r => {
                r.status?.forEach(
                  status => {
                    const invoice = response.invoices.find(
                      invoice => invoice.payload?.id === status.id
                    );
                    if (invoice) {
                      invoice.status = status;
                    }
                  }
                );

                if (r.operation_status?.code >= 300) {
                  throw r.operation_status;
                }
              }
            ).catch(
              error => {
                if (error.message) {
                  error = {
                    ...error,
                    message: 'On Invoice Send: ' + error.message,
                  }
                }
                throw error;
              }
            );
          }
        }

        await this.claimProducts(
          aggregation,
          this.tech_user ?? request.subject,
          context,
        );
        await this.updateState(
          response_map,
          OrderState.SUBMITTED,
          request.subject,
          context,
          aggregation,
          settings,
          true,
        ).then(
          updates => {
            response.orders = updates.items;
            response.operation_status = updates.operation_status;
          }
        );
      }
      catch (error: any) {
        response.operation_status = this.catchOperationError(error)?.operation_status;
      }
      finally {
        this.logger?.debug('Cleanup fulfillments of failed orders...');
        const failed_ids = response.invoices?.filter(
          invoice => invoice.status?.code >= 300
        ).flatMap(
          invoice => invoice.payload?.references?.map(
            r => r.instance_id
          )
        ) ?? [];

        if (this.fulfillment_service) {
          const ids = (
            response.operation_status?.code < 300
              ? response.fulfillments?.filter(
                fulfillment => fulfillment.payload?.references?.some(
                  reference => failed_ids.includes(reference?.instance_id)
                )
              ) ?? []
              : response.fulfillments
          )?.map(
            fulfillment => fulfillment.payload?.id ?? fulfillment.status?.id 
          );

          if (ids?.length) {
            await this.fulfillment_service?.delete(
              {
                ids,
                subject: this.tech_user ?? request.subject,
              },
              context,
            ).then(
              r => {
                if (r.operation_status?.code >= 300) {
                  throw r.operation_status;
                  // r.operation_status.message = 'On Fulfillment Clean Up: ' + r.operation_status.message;
                  // response.operation_status = r.operation_status;
                }
              },
              error => {
                if (error.message) {
                  error.message = 'On Fulfillment Clean Up: ' + error.message
                }
                throw error;
              }
            );
          }
        }
      }

      response.orders = request.items?.map(item => response_map[item.id]);
      return response;
    }
    catch (e: any) {
      return this.catchOperationError(e);
    }
  }

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.cancelOrders'),
    database: 'arangoDB',
    useCache: true,
  })
  public async cancel(
    request: OrderIdList,
    context?: CallContext
  ): Promise<OrderListResponse> {
    try {
      const orders = await this.getOrderMap(
        request.ids,
        request.subject,
        context,
      );
      return await this.updateState(
        orders,
        OrderState.CANCELLED,
        request.subject,
        context,
      );
    }
    catch (e: any) {
      return this.catchOperationError<OrderListResponse>(e);
    }
  }

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.withdrawOrder'),
    database: 'arangoDB',
    useCache: true,
  })
  public async withdraw(
    request: OrderIdList,
    context?: CallContext,
  ): Promise<OrderListResponse> {
    try {
      const orders = await this.getOrderMap(
        request.ids,
        request.subject,
        context,
      );
      return await this.updateState(
        orders,
        OrderState.WITHDRAWN,
        request.subject,
        context,
      );
    }
    catch (e: any) {
      return this.catchOperationError<OrderListResponse>(e);
    }
  }

  public async notify(
    request: OrderIdList,
    contect?: CallContext,
  ): Promise<StatusListResponse> {
    throw new Error('Not Implemented!');
  };

  private async getFulfillmentSolution(
    request: FulfillmentRequestList,
    context?: CallContext,
    orders?: OrderMap,
    aggregation?: AggregatedOrderListResponse,
  ): Promise<FulfillmentSolutionListResponse> {
    if (!request.items?.length) {
      return {
        items: [],
        operation_status: this.operationStatusCodes.SUCCESS
      }
    }

    const response_map = request.items?.reduce(
      (a, b) => {
        a[b.order_id] = {
          reference: {
            instance_type: this.urns.order,
            instance_id: b.order_id,
          }
        };
        return a;
      },
      {} as Record<string, FulfillmentSolutionResponse>
    ) ?? {};

    orders ??= await this.getOrderMap(
      request.items?.map(item => item.order_id),
      request.subject,
      context
    );

    aggregation ??= await this.aggregate(
      {
        items: Object.values(orders)
      },
      this.tech_user ?? request.subject,
      context
    );

    const items = request.items?.filter(
      item => {
        const response = response_map[item.order_id];
        const order = orders[item.order_id];

        if (!order) {
          response.status = createStatusCode(
            item.order_id,
            this.entityName,
            this.statusCodes.ITEM_NOT_FOUND,
            item.order_id,
          );
          return false;
        }

        if (order.status?.code >= 300) {
          response.status = order.status;
          return false;
        }

        return true;
      }
    ).map(
      item => {
        const response = response_map[item.order_id];
        const order = orders?.[item.order_id];
        const items = order.payload?.items?.flatMap(
          item => this.flatMapProductToFulfillmentItem(
            aggregation,
            item.product_id,
            item.variant_id,
            item.quantity,
          )
        );

        if (items?.length === 0) {
          response.status = createStatusCode(
            item.order_id,
            this.entityName,
            this.statusCodes.NO_PHYSICAL_ITEM,
            item.order_id,
          );
        }

        const query: FulfillmentSolutionQuery = {
          reference: {
            instance_type: this.urns.order,
            instance_id: order.payload.id,
          },
          recipient: order.payload?.shipping_address,
          items,
          preferences: order.payload?.packaging_preferences,
          shop_id: order.payload?.shop_id,
          customer_id: order.payload?.customer_id,
        };
        return query;
      }
    ).filter(
      query => query.items?.length
    );

    const query: FulfillmentSolutionQueryList = {
      items,
      total_count: items?.length,
      subject: request.subject
    };
    const solutions = await this.fulfillment_product_service?.find(
      query,
      context
    );

    solutions?.items?.forEach(
      item => {
        const id = item.reference?.instance_id ?? item.status?.id;
        if (id) {
          response_map[id] = item;
        }
      }
    );

    return {
      items: Object.values(response_map),
      total_count: request.total_count,
      operation_status: solutions?.operation_status,
    };
  }

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.READ,
    operation: Operation.whatIsAllowed,
    context: DefaultACSClientContextFactory,
    resource: [{ resource: 'order' }],
    database: 'arangoDB',
    useCache: true,
  })
  public async queryFulfillmentSolution(
    request: FulfillmentRequestList,
    context?: CallContext,
  ): Promise<FulfillmentSolutionListResponse> {
    try {
      return await this.getFulfillmentSolution(request, context);
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  private async toFulfillmentResponsePrototypes(
    request: FulfillmentRequestList,
    context?: CallContext,
    orders?: OrderMap,
    aggregation?: AggregatedOrderListResponse,
  ): Promise<FulfillmentResponse[]> {
    orders ??= await this.getOrderMap(
      request.items?.map(item => item.order_id),
      request.subject,
      context
    ) ?? {};

    const solutions = await this.getFulfillmentSolution(
      request,
      context,
      orders,
      aggregation,
    ).then(
      response => {
        if (response.operation_status?.code < 300) {
          return response.items?.reduce(
            (a, b) => {
              a[b.reference?.instance_id ?? b.status?.id] = b;
              return a;
            },
            {} as FulfillmentSolutionMap
          );
        }
        else {
          throw response.operation_status;
        }
      }
    );

    return request.items?.map(
      item => {
        const order = orders[item.order_id!];
        const solution = solutions?.[item.order_id!];
        const status = solution?.status ?? createStatusCode(
          item.order_id,
          'Order',
          this.statusCodes.SOLUTION_NOT_FOUND,
          item.order_id,
        );

        delete item.sender_address?.address?.meta;
        delete order.payload?.billing_address?.address?.meta;
        delete order.payload?.shipping_address?.address?.meta;

        const fulfillment: FulfillmentResponse = {
          payload:
            status?.code < 300 ?
              {
                shop_id: order.payload.shop_id,
                customer_id: order.payload.customer_id,
                user_id: order.payload.user_id,
                references: [{
                  instance_type: this.urns.order,
                  instance_id: item.order_id,
                }],
                packaging: {
                  parcels: solution.solutions[0].parcels,
                  notify: order.payload?.notification_email,
                  export_type: item.export_type,
                  export_description: item.export_description,
                  invoice_number: item.invoice_number,
                  sender: item.sender_address,
                  recipient: order.payload?.shipping_address,
                } as Packaging,
                total_amounts: solution.solutions[0].amounts,
                meta: {
                  created_by: request.subject?.id,
                  modified_by: request.subject?.id,
                  owners: order.payload.meta.owners,
                },
              } : undefined,
          status: {
            ...status,
            id: item.order_id,
          },
        };

        return fulfillment;
      }
    ) ?? [];
  }

  private async _evaluateFulfillment(
    request: FulfillmentRequestList,
    context?: CallContext,
    orders?: OrderMap,
    aggregation?: AggregatedOrderListResponse,
  ): Promise<FulfillmentListResponse> {
    try {
      if (!request.items?.length) {
        return {
          items: [],
          operation_status: this.operationStatusCodes.SUCCESS
        }
      }

      orders ??= await this.getOrderMap(
        request.items?.map(item => item.order_id),
        request.subject,
        context
      ) ?? {};

      const prototypes = await this.toFulfillmentResponsePrototypes(
        request,
        context,
        orders,
        aggregation,
      );

      const invalids = prototypes.filter(
        item => item.status?.code >= 300
      );

      const valids = prototypes.filter(
        item => item.status?.code < 300
      );
      
      const evaluated = valids.length ? await this.fulfillment_service.evaluate(
        {
          items: valids.map(item => item.payload),
          total_count: valids.length,
          subject: request.subject,
        },
        context
      ).then(
        response => {
          if (response.operation_status?.code >= 300) {
            throw response.operation_status;
          }
          response.items = response.items?.filter(
            item => {
              if (item.status?.code < 300) {
                return true;
              }
              else {
                invalids.push(item);
                return false;
              }
            }
          );
          return response;
        }
      ) : undefined;

      return {
        items: [
          ...(evaluated?.items ?? []),
          ...invalids
        ],
        total_count: valids.length + invalids.length,
        operation_status: invalids.length
          ? createOperationStatusCode(
            this.operationStatusCodes.MULTI_STATUS,
            'fulfillment',
          )
          : evaluated?.operation_status,
      };
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  private async _createFulfillment(
    request: FulfillmentRequestList,
    context?: CallContext,
    orders?: OrderMap,
    aggregation?: AggregatedOrderListResponse,
  ): Promise<FulfillmentListResponse> {
    try {
      if (!request.items?.length) {
        return {
          items: [],
          operation_status: this.operationStatusCodes.SUCCESS
        }
      }

      orders ??= await this.getOrderMap(
        request.items?.map(item => item.order_id),
        request.subject,
        context
      ) ?? {};

      const prototypes = await this.toFulfillmentResponsePrototypes(
        request,
        context,
        orders,
        aggregation,
      );

      const invalids = prototypes.filter(
        item => item.status?.code >= 300
      );

      const valids = prototypes.filter(
        item => item.status?.code < 300
      );

      const created = valids.length ? await this.fulfillment_service.create(
        {
          items: valids.map(item => item.payload),
          total_count: valids.length,
          subject: this.tech_user ?? request.subject,
        },
        context
      ).then(
        response => {
          if (response?.operation_status?.code >= 300) {
            throw response.operation_status;
          }
          response.items = response.items?.filter(
            item => {
              if (item.status?.code < 300) {
                return true;
              }
              else {
                invalids.push(item);
                return false;
              }
            }
          );
          return response;
        }
      ) : undefined;

      return {
        items: [
          ...(created?.items ?? []),
          ...invalids
        ],
        total_count: valids.length + invalids.length,
        operation_status: invalids.length
          ? createOperationStatusCode(
            this.operationStatusCodes.MULTI_STATUS,
            'fulfillment',
          )
          : created?.operation_status,
      };
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  @resolves_subject()
  @injects_meta_data()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: DefaultACSClientContextFactory,
    resource: DefaultResourceFactory('execution.evaluateFulfillment'),
    database: 'arangoDB',
    useCache: true,
  })
  public async evaluateFulfillment(
    request: OrderList,
    context?: CallContext
  ): Promise<FulfillmentListResponse> {
    if (!request.items?.length) {
      return {
        operation_status: this.operationStatusCodes.SUCCESS
      }
    }

    const fulfillment_request: FulfillmentRequestList = {
      ...request,
      items: request.items?.map(
        item => ({
          order_id: item.id,
        })
      )
    };
    return this._evaluateFulfillment(
      fulfillment_request,
      context,
    ).then(
      resp => ({
        ...resp,
        status: resp.items?.map(item => item.status)
      })
    );
  }

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.createFulfillment'),
    database: 'arangoDB',
    useCache: true,
  })
  public async createFulfillment(
    request: FulfillmentRequestList,
    context?: CallContext
  ): Promise<FulfillmentListResponse> {
    return this._createFulfillment(request, context);
  }

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.triggerFulfillment'),
    database: 'arangoDB',
    useCache: true,
  })
  public async triggerFulfillment(
    request: FulfillmentRequestList,
    context?: CallContext
  ): Promise<StatusListResponse> {
    try {
      const prototypes = await this.toFulfillmentResponsePrototypes(
        request,
        context
      );
      const valids = prototypes.filter(
        proto => proto.status?.code < 300
      ).map(
        proto => proto.payload!
      );
      const fulfillmentList = await DefaultMetaDataInjector(
        this,
        {
          items: valids,
          total_count: valids.length,
          subject: request.subject
        }
      );

      this.logger?.debug('Emit Fulfillment request', { fulfillmentList });
      await this.orderingTopic.emit(this.emitters['CREATE_FULFILLMENT'] ?? CREATE_FULFILLMENT, fulfillmentList);
      this.logger?.info('Fulfillment request emitted successfully', { fulfillmentList });

      return {
        status: prototypes?.map(item => item.status),
        operation_status: this.operationStatusCodes.SUCCESS,
      };
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  private async toInvoiceResponsePrototypes(
    request: OrderingInvoiceRequestList,
    context?: CallContext,
    order_map?: OrderMap,
    fulfillments?: FulfillmentResponse[],
    aggregation?: AggregatedOrderListResponse,
  ): Promise<InvoiceResponse[]> {
    order_map ??= await this.getOrderMap(
      request.items?.flatMap(
        item => item.sections?.map(
          section => section.order_id
        )
      ),
      request.subject,
      context,
    );

    aggregation ??= await this.aggregate(
      { items: Object.values(order_map) },
      request.subject,
      context,
    );

    const fulfillment_map = await this.getFulfillmentMap(
      request.items?.flatMap(
        item => item.sections?.map(
          section => section.order_id
        )
      ),
      request.subject,
      context,
      fulfillments,
    );

    return request.items?.map(
      invoice => {
        try {
          const master = order_map[invoice.sections?.[0]?.order_id];
          if (master?.status?.code >= 300) {
            return {
              status: master?.status ?? createStatusCode(
                invoice.sections?.[0]?.order_id,
                this.entityName,
                this.statusCodes.ITEM_NOT_FOUND,
                invoice.sections?.[0]?.order_id,
              )
            };
          }

          for (const section of invoice.sections!) {
            const order = order_map[section.order_id];

            if (order?.status?.code >= 300) {
              return {
                payload: undefined,
                status: order?.status ?? createStatusCode(
                  section.order_id,
                  this.entityName,
                  this.statusCodes.ITEM_NOT_FOUND,
                  section.order_id,
                )
              };
            }
            else if (
              order.payload?.customer_id !== master?.payload?.customer_id ||
              order.payload?.shop_id !== master?.payload?.shop_id
            ) {
              return {
                status: createStatusCode(
                  section.order_id,
                  typeof(order.payload),
                  this.statusCodes.IN_HOMOGEN_INVOICE,
                  section.order_id,
                ),
              };
            }
          }

          const sections = invoice.sections?.map(
            section => {
              const order = order_map[section.order_id];
              const product_items = (
                section.selected_items?.length
                  ? order.payload.items.filter(
                    item => section.selected_items.includes(item.id)
                  ) ?? []
                  : order.payload?.items ?? []
              ).map(
                (item, i): Position => ({
                  id: randomUUID().replaceAll('-', ''),
                  unit_price: item.unit_price,
                  quantity: item.quantity,
                  amount: item.amount ?? throwStatusCode(
                    item.id,
                    'Product',
                    this.statusCodes.NO_AMOUNT,
                    item.id
                  ),
                  product_item: {
                    product_id: item.product_id,
                    variant_id: item.variant_id,
                  },
                })
              );
              const fulfillment_items: Position[] = (
                section.fulfillment_mode === FulfillmentInvoiceMode.INCLUDE ? (
                  section.selected_fulfillments?.flatMap(
                    selection => fulfillment_map[section.order_id]?.find(
                      fulfillment => fulfillment.payload.id === selection.fulfillment_id
                    )?.payload.packaging.parcels.filter(
                      parcel => !selection?.selected_parcels?.length
                        || selection.selected_parcels.includes(parcel.id)
                    )
                  ) ?? fulfillment_map[section.order_id]?.flatMap(
                    fulfillment => fulfillment.payload.packaging.parcels
                  ) ?? []
                ) : []
              ).map(
                (a, i): Position => ({
                  id: randomUUID().replaceAll('-', ''),
                  unit_price: a.price,
                  quantity: 1,
                  amount: a.amount ?? throwStatusCode(
                    a.id,
                    'FulfillmentProduct',
                    this.statusCodes.NO_AMOUNT,
                    a.id
                  ),
                  fulfillment_item: {
                    product_id: a?.product_id,
                    variant_id: a?.variant_id,
                  },
                })
              );

              const positions = [
                ...product_items,
                ...fulfillment_items,
              ];
              return {
                id: section.order_id,
                amounts: calcTotalAmounts(
                  positions.map(p => p.amount),
                  aggregation.currencies,
                ),
                customer_remark: order.payload?.customer_remark,
                positions,
              } as Section;
            }
          );
          return {
            payload: {
              invoice_number: invoice.invoice_number,
              user_id: master.payload.user_id,
              customer_id: master.payload.customer_id,
              shop_id: master.payload.shop_id,
              references: invoice.sections?.flatMap(
                section => [
                  [{
                    instance_type: this.urns.order,
                    instance_id: section.order_id,
                  }],
                  section.selected_fulfillments?.map(
                    f => ({
                      instance_type: this.urns.fulfillment,
                      instance_id: f.fulfillment_id,
                    })
                  ) ?? fulfillment_map[section.order_id]?.map(
                    f => ({
                      instance_type: this.urns.fulfillment,
                      instance_id: f.payload?.id,
                    })
                  ),
                ]
              )?.flat().filter(Boolean),
              customer_remark: master.payload.customer_remark,
              customer_order_number: master.payload.customer_order_nr,
              customer_vat_id: master.payload.customer_vat_id,
              recipient: master.payload.shipping_address ?? master.payload.billing_address,
              billing_address: master.payload.billing_address ?? master.payload.shipping_address,
              total_amounts: calcTotalAmounts(
                sections.flatMap(s => s.amounts),
                aggregation.currencies,
              ),
              sections,
              timestamp: new Date(),
              meta: {
                created_by: request.subject?.id,
                modified_by: request.subject?.id,
                owners: master.payload.meta.owners,
              }
            },
            status: createStatusCode(
              master.payload.id,
              'Invoice',
              this.statusCodes.SUCCESS,
              master.payload.id,
            ),
          };
        }
        catch (error: any) {
          return this.catchStatusError(error)
        }
      }
    ) ?? [];
  }

  private async doInvoice(
    action: (request: InvoiceList, context?: CallContext) => Promise<InvoiceListResponse>,
    request: OrderingInvoiceRequestList,
    context?: CallContext,
    order_map?: OrderMap,
    fulfillments?: FulfillmentResponse[],
    aggregation?: AggregatedOrderListResponse,
  ): Promise<InvoiceListResponse> {
    try {
      if (!request.items?.length) {
        return {
          operation_status: this.operationStatusCodes.SUCCESS
        }
      }

      const prototypes = await this.toInvoiceResponsePrototypes(
        request,
        context,
        order_map,
        fulfillments,
        aggregation,
      );
      const invalid = prototypes.some(
        proto => proto.status?.code >= 300
      );

      if (invalid) {
        return {
          items: prototypes,
          total_count: prototypes.length,
          operation_status: this.operationStatusCodes.INVALID_INVOICES,
        };
      }

      const response = await action(
        {
          items: prototypes.map(
            v => v.payload
          ),
          total_count: prototypes.length,
          subject: this.tech_user ?? request.subject,
        },
        context
      );

      return response;
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  };

  private async _createInvoice(
    request: OrderingInvoiceRequestList,
    context?: CallContext,
    order_map?: OrderMap,
    fulfillments?: FulfillmentResponse[],
    aggregation?: AggregatedOrderListResponse,
  ): Promise<InvoiceListResponse> {
    return this.doInvoice(
      this.invoice_service.create,
      request,
      context,
      order_map,
      fulfillments,
      aggregation,
    );
  };

  private async _renderInvoice(
    request: OrderingInvoiceRequestList,
    context?: CallContext,
    order_map?: OrderMap,
    fulfillments?: FulfillmentResponse[],
    aggregation?: AggregatedOrderListResponse,
  ): Promise<InvoiceListResponse> {
    return this.doInvoice(
      this.invoice_service.render,
      request,
      context,
      order_map,
      fulfillments,
      aggregation,
    );
  };

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.createInvoice'),
    database: 'arangoDB',
    useCache: true,
  })
  public async createInvoice(
    request: OrderingInvoiceRequestList,
    context?: CallContext,
  ): Promise<InvoiceListResponse> {
    return await this._createInvoice(request, context);
  };

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.renderInvoice'),
    database: 'arangoDB',
    useCache: true,
  })
  public async renderInvoice(
    request: OrderingInvoiceRequestList,
    context?: CallContext,
  ): Promise<InvoiceListResponse> {
    return await this._renderInvoice(request, context);
  };

  @resolves_subject()
  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: [{ resource: 'invoice' }],
    database: 'arangoDB',
    useCache: true,
  })
  public async triggerInvoice(
    request: OrderingInvoiceRequestList,
    context?: CallContext,
  ): Promise<StatusListResponse> {
    try {
      if (!request.items?.length) {
        return {
          operation_status: this.operationStatusCodes.SUCCESS
        }
      }

      const prototypes = await this.toInvoiceResponsePrototypes(
        request,
        context,
      );
      const valids = prototypes.filter(
        proto => proto.status?.code < 300
      ).map(
        proto => proto.payload
      );
      const invoiceList = await DefaultMetaDataInjector(
        this,
        {
          items: valids,
          total_count: valids.length,
          subject: request.subject
        }
      );

      this.logger?.debug('Emit Invoice Request', { invoiceList });
      await this.orderingTopic.emit(this.emitters['CREATE_INVOICE'] ?? CREATE_INVOICE, invoiceList);
      this.logger?.info('Fulfillment request emitted successfully', { invoiceList });

      return {
        status: prototypes?.map(item => item.status),
        operation_status: this.operationStatusCodes.SUCCESS,
      };
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  };

  protected async fetchFile(url: string, subject?: Subject): Promise<Buffer> {
    if (url?.startsWith('file://')) {
      return fs.readFileSync(url.slice(7));
    }
    else if (url?.startsWith('http')) {
      return fetch(
        url,
        subject?.token ? {
          headers: {
            Authorization: `Bearer ${subject.token}`
          }
        } : undefined
      ).then(
        resp => resp.text()
      ).then(
        text => Buffer.from(text)
      )
    }
    else {
      throw createStatusCode(
        undefined,
        'Template',
        this.statusCodes.PROTOCOL_NOT_SUPPORTED,
        undefined,
        url,
      );
    }
  }

  protected async fetchLocalization(
    template: Template,
    locales: string[],
    subject?: Subject,
  ) {
    const locale = locales?.find(
      a => template.localizations?.some(
        b => b.locales?.includes(a)
      )
    ) ?? 'en';
    const L = template.localizations?.find(
      a => a.locales?.includes(locale)
    );
    const url = L?.l10n?.url;
    const l10n = url ? await this.fetchFile(url, subject).then(
      text => {
        if (L.l10n.content_type === 'application/json') {
          return JSON.parse(text.toString());
        }
        else if (L.l10n.content_type === 'text/csv') {
          return CSV(text, {
            columns: true,
            skip_empty_lines: true,
            objname: 'key',
            escape: '\\',
            trim: true,
            delimiter: ',',
            ignore_last_delimiters: true,
          });
        }
        else {
          throw createStatusCode(
            template.id,
            'Template',
            this.statusCodes.CONTENT_NOT_SUPPORTED,
            template.id,
            L.l10n.content_type,
          );
        }
      }
    ).then(
      l10n => Object.assign(l10n, { _locale: locale })
    ) : undefined;
  
    return l10n;
  }

  protected async emitRenderRequest(
    item: Order,
    aggregation: AggregatedOrderListResponse,
    render_id: string,
    use_cases: (TemplateUseCase | string)[],
    default_templates?: Template[],
    subject?: Subject,
  ) {
    const shop = aggregation.shops.get(item.shop_id);
    const customer = aggregation.customers.get(item.customer_id);
    const setting = this.resolveSettings(
      aggregation.settings.get(
        customer.setting_id
      ),
      aggregation.settings.get(
        shop.setting_id
      ),
    );
    const locales = [
      ...(setting?.customer_locales ?? []),
      ...(setting?.shop_locales ?? []),
    ];
    const templates = aggregation.templates?.getMany(
      shop.template_ids
    )?.filter(
      template => use_cases?.includes(template.use_case)
    ).sort(
      (a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0)
    ) ?? [];
    default_templates = default_templates?.filter(
      template => use_cases?.includes(template.use_case)
    ).sort(
      (a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0)
    ) ?? []

    if (templates.length === 0) {
      if (default_templates?.length > 0) {
        templates.push(...default_templates);
      }
      else {
        throw createOperationStatusCode(
          this.operationStatusCodes.NO_TEMPLATES
        );
      }
    }
    
    const bodies: RenderRequest_Template[][]  = await Promise.all(
      templates.map(
        async template => await Promise.all(template.bodies?.map(
          async (body, i) => ({
            id: crypto.randomUUID() as string,
            body: body?.url ? await this.fetchFile(
              body.url, subject
            ) : undefined,
            layout: template.layouts?.[i]?.url ? await this.fetchFile(
              template.layouts?.[i]?.url, subject
            ) : undefined
          })
        ) ?? throwStatusCode<RenderRequest_Template[]>(
          item.id,
          "Template",
          this.statusCodes.NO_TEMPLATE_BODY,
          template.id,
        ))
      )
    );
    const l10n = await Promise.all(
      templates.map(
        template => this.fetchLocalization(
          template, locales, subject
        )
      )
    );

    const render_request: RenderRequestList = {
      id: render_id,
      items: templates.map(
        (template, i) => ({
          content_type: 'text/html',
          data: packRenderData(aggregation, item),
          templates: bodies[i],
          style_url: template.styles?.find(s => s.url).url,
          options: l10n[i] ? marshallProtobufAny({
            locale: l10n[i]._locale,
            texts: l10n[i]
          }) : undefined
        })
      ),
    }

    return this.renderingTopic.emit(
      'renderRequest',
      render_request,
    );
  }

  public async handleRenderResponse(
    response: RenderResponseList
  ) {
    try {
      const [entity] = response.id.split('/');
      if (entity !== 'order') return;

      if (response.operation_status?.code >= 300) {
        this.awaits_render_result.reject(response.id, response.operation_status);
      }

      const error = response.items.find(
        item => item.status?.code >= 300
      );
      if (error) {
        this.awaits_render_result.reject(response.id, error);
      }
      else {
        const bodies = response.items.flatMap(
          item => item.payload.bodies.map(
            item => item.body.toString(item.charset as BufferEncoding)
          )
        );
        this.awaits_render_result.resolve(response.id, bodies);
      }
    }
    catch (e: any) {
      this.logger?.error('Error on handleRenderResponse:', e);
    }
  }

  protected async sendNotification(
    order: Order,
    body: string,
    setting: ResolvedSetting,
    title?: string,
    context?: CallContext,
  ) {
    const status = await this.notification_service.send(
      {
        transport: 'email',
        provider: setting.shop_email_provider,
        email: {
          to: [order.billing_address.contact.email],
          cc: [
            ...(setting.customer_email_cc ?? []),
            ...(setting.shop_email_cc ?? []),
          ],
          bcc: [
            ...(setting.customer_email_bcc ?? []),
            ...(setting.shop_email_bcc ?? []),
          ],
        },
        subject: title ?? order.id,
        body,
      },
      context
    );
    return status?.operation_status;
  }

  public async checkCompletion(
    msg: Invoice | Fulfillment
  ) {
    const ids = msg.references.filter(
      ref => ref.instance_type === this.urns.order
    ).map(
      ref => ref.instance_id
    );

    const fulfillments_complete = await this.getFulfillmentMap(
      ids,
      this.tech_user,
    ).then(
      fm => Object.values(fm).flat().every(
        f => f.payload?.fulfillment_state === FulfillmentState.COMPLETE
      )
    );

    const invoices_payed = await this.invoice_service?.read(
      {
        filters: [{
          filters: ids?.map(id => ({
            field: 'references[*].instance_id',
            operation: Filter_Operation.in,
            value: id,
          })),
          operator: FilterOp_Operator.or,
        }],
        subject: this.tech_user,
      },
    ).then(
      response => {
        if (response.operation_status?.code < 300) {
          return response.items;
        }
        else {
          throw response.operation_status;
        }
      }
    ).then(
      invoices => invoices.every(
        i => i.payload?.payment_state === PaymentState.PAYED
      )
    );

    if (fulfillments_complete && invoices_payed) {
      await this.superUpdate({
        items: ids.map(id => ({
          id,
          order_state: OrderState.COMPLETED
        })),
        subject: this.tech_user,
        total_count: ids.length,
      });
    }
  }
}
