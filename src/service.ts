import nconf from 'nconf';
import { Logger } from 'winston';
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
  access_controlled_function,
  access_controlled_service,
  DefaultACSClientContextFactory,
  injects_meta_data,
  Operation,
  DefaultResourceFactory,
  DefaultMetaDataInjector,
} from '@restorecommerce/acs-client';
import {
  ResourcesAPIBase,
  ServiceBase,
} from '@restorecommerce/resource-base-interface';
import { Topic } from '@restorecommerce/kafka-client';
import {
  OrderList,
  OrderResponse,
  DeepPartial,
  FulfillmentRequestList,
  Order,
  OrderState,
  OrderIdList,
  OrderListResponse,
  OrderServiceImplementation,
  OrderingInvoiceRequestList,
  FulfillmentInvoiceMode,
  OrderSubmitListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order.js';
import {
  PhysicalProduct,
  PhysicalVariant,
  Product,
  ProductResponse,
  ProductServiceDefinition,
  VirtualProduct,
  VirtualVariant
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/product.js';
import {
  TaxServiceDefinition, Tax
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/tax.js';
import {
  CustomerServiceDefinition, CustomerResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/customer.js';
import {
  ShopServiceDefinition, ShopResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/shop.js';
import {
  OrganizationResponse, OrganizationServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/organization.js';
import {
  ContactPointServiceDefinition, ContactPointResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/contact_point.js';
import {
  AddressServiceDefinition, AddressResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/address.js';
import {
  CountryServiceDefinition, CountryResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/country.js';
import {
  FulfillmentServiceDefinition,
  Item as FulfillmentItem,
  FulfillmentListResponse,
  FulfillmentResponse,
  FulfillmentList,
  Packaging,
  Parcel,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment.js';
import {
  FulfillmentProductServiceDefinition,
  PackingSolutionQuery,
  PackingSolutionQueryList,
  PackingSolutionListResponse,
  PackingSolutionResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment_product.js';
import {
  FilterOp_Operator,
  Filter_Operation
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/filter.js';
import {
  DeleteRequest,
  Filter_ValueType,
  ReadRequest
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/resource_base.js';
import {
  OperationStatus,
  Status,
  StatusListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/status.js';
import {
  InvoiceListResponse,
  InvoiceResponse,
  Section,
  Position,
  InvoiceServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/invoice.js';
import {
  Amount,
  VAT
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/amount.js';
import { Subject } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth.js';

export type RatioedTax = Tax & {
  tax_ratio?: number;
};

export type OrderMap = { [key: string]: OrderResponse };
export type ProductMap = { [key: string]: ProductResponse };
export type FulfillmentMap = { [key: string]: FulfillmentResponse[] };
export type RatioedTaxMap = { [key: string]: RatioedTax };
export type CustomerMap = { [key: string]: CustomerResponse };
export type ShopMap = { [key: string]: ShopResponse };
export type OrganizationMap = { [key: string]: OrganizationResponse };
export type ContactPointMap = { [key: string]: ContactPointResponse };
export type AddressMap = { [key: string]: AddressResponse };
export type CountryMap = { [key: string]: CountryResponse };
export type PackingSolutionMap = { [key: string]: PackingSolutionResponse };
export type PositionMap = { [key: string]: Position };
export type StatusMap = { [key: string]: Status };
export type OperationStatusMap = { [key: string]: OperationStatus };
export type VATMap = { [key: string]: VAT };
export type ProductNature = PhysicalProduct & VirtualProduct;
export type ProductVariant = PhysicalVariant & VirtualVariant;
export type CRUDClient = Client<ProductServiceDefinition>
| Client<TaxServiceDefinition>
| Client<CustomerServiceDefinition>
| Client<ShopServiceDefinition>
| Client<OrganizationServiceDefinition>
| Client<ContactPointServiceDefinition>
| Client<AddressServiceDefinition>
| Client<CountryServiceDefinition>
| Client<FulfillmentServiceDefinition>
| Client<FulfillmentProductServiceDefinition>
| Client<InvoiceServiceDefinition>;

const CREATE_FULFILLMENT = 'createFulfillment';

@access_controlled_service
export class OrderingService
  extends ServiceBase<OrderListResponse, OrderList>
  implements OrderServiceImplementation
{
  private static async ACSContextFactory(
    self: OrderingService,
    request: OrderList & OrderIdList & FulfillmentRequestList & OrderingInvoiceRequestList,
    context: any,
  ): Promise<ACSClientContext> {
    const ids = request.ids ?? request.items?.map(item => item.id!) ?? [] as string[];
    const resources = await self.getOrdersById(ids, request?.subject!, context);
    return {
      ...context,
      subject: request.subject,
      resources: [
        ...resources.items ?? [],
        ...request.items ?? [],
      ],
    };
  }

  private readonly status_codes: { [key: string]: Status } = {
    OK: {
      id: '',
      code: 200,
      message: 'OK',
    },
    NOT_FOUND: {
      id: '',
      code: 404,
      message: '{entity} {id} not found!',
    },
    NO_LEGAL_ADDRESS: {
      id: '',
      code: 404,
      message: '{entity} {id} has no legal address!',
    },
    NO_SHIPPING_ADDRESS: {
      id: '',
      code: 404,
      message: '{entity} {id} has no shipping address!',
    },
    NOT_SUBMITTED: {
      id: '',
      code: 400,
      message: '{entity} {id} expected to be submitted!',
    },
    NO_ITEM: {
      id: '',
      code: 400,
      message: '{entity} {id} has no item in cart',
    },
    NO_PHYSICAL_ITEM: {
      id: '',
      code: 208,
      message: '{entity} {id} includes no physical item!',
    },
    IN_HOMOGEN_INVOICE: {
      id: '',
      code: 400,
      message: '{entity} {id} must have identical customer_id and shop_id to master {entity}!',
    },
  };

  private readonly operation_status_codes: { [key: string]: OperationStatus } = {
    SUCCESS: {
      code: 200,
      message: 'SUCCESS',
    },
    PARTIAL: {
      code: 208,
      message: 'Patrial execution including errors!',
    },
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
      message: 'No item in cart!',
    },
    ITEM_NOT_FOUND: {
      code: 404,
      message: '{entity} not found!',
    },
  };

  protected readonly emitters: any;
  protected readonly legal_address_type_id: string;
  protected readonly unauthenticated_user: Subject;
  protected readonly fulfillment_tech_user?: Subject;
  protected readonly invoice_tech_user?: Subject;
  protected readonly product_service: Client<ProductServiceDefinition>;
  protected readonly tax_service: Client<TaxServiceDefinition>;
  protected readonly customer_service: Client<CustomerServiceDefinition>;
  protected readonly shop_service: Client<ShopServiceDefinition>;
  protected readonly organization_service: Client<OrganizationServiceDefinition>;
  protected readonly contact_point_service: Client<ContactPointServiceDefinition>;
  protected readonly address_service: Client<AddressServiceDefinition>;
  protected readonly country_service: Client<CountryServiceDefinition>;
  protected readonly fulfillment_service?: Client<FulfillmentServiceDefinition>;
  protected readonly fulfillment_product_service?: Client<FulfillmentProductServiceDefinition>;
  protected readonly invoice_service?: Client<InvoiceServiceDefinition>;
  protected readonly creates_fulfillments_on_submit?: boolean;
  protected readonly creates_invoices_on_submit?: boolean;
  protected readonly cleanup_fulfillments_post_submit?: boolean;
  protected readonly cleanup_invoices_post_submit?: boolean;
  protected readonly urn_instance_type: string;
  protected readonly urn_disable_fulfillment: string;
  protected readonly urn_disable_invoice: string;

  get entityName() {
    return this.name;
  }

  get collectionName() {
    return this.resourceapi.resourceName;
  }

  get instanceType() {
    return this.urn_instance_type;
  }

  constructor(
    protected readonly topic: Topic,
    protected readonly db: database.DatabaseProvider,
    protected readonly cfg: nconf.Provider,
    logger: Logger,
  ) {
    super(
      cfg.get('database:main:entities:0') ?? 'order',
      topic,
      logger,
      new ResourcesAPIBase(
        db,
        cfg.get('database:main:collections:0') ?? 'orders',
        cfg.get('fieldHandlers'),
        undefined,
        undefined,
        logger,
      ),
      !!cfg.get('events:enableEvents')
    );

    this.status_codes = {
      ...this.status_codes,
      ...cfg.get('statusCodes'),
    };

    this.operation_status_codes = {
      ...this.operation_status_codes,
      ...cfg.get('operationStatusCodes'),
    };

    this.emitters = cfg.get('events:emitters');
    this.urn_instance_type = cfg.get('urns:instanceType');
    this.urn_disable_fulfillment = cfg.get('urns:disableFulfillment');
    this.urn_disable_invoice = cfg.get('urns:disableInvoice');
    this.legal_address_type_id = cfg.get('preDefinedIds:legalAddressTypeId') ?? 'legal_address';
    this.unauthenticated_user = cfg.get('authentication:users:unauthenticated_user');

    this.product_service = createClient(
      {
        ...cfg.get('client:product'),
        logger
      } as GrpcClientConfig,
      ProductServiceDefinition,
      createChannel(cfg.get('client:product:address'))
    );

    this.tax_service = createClient(
      {
        ...cfg.get('client:tax'),
        logger
      } as GrpcClientConfig,
      TaxServiceDefinition,
      createChannel(cfg.get('client:tax:address'))
    );

    this.customer_service = createClient(
      {
        ...cfg.get('client:customer'),
        logger
      } as GrpcClientConfig,
      CustomerServiceDefinition,
      createChannel(cfg.get('client:customer:address'))
    );

    this.shop_service = createClient(
      {
        ...cfg.get('client:shop'),
        logger
      } as GrpcClientConfig,
      ShopServiceDefinition,
      createChannel(cfg.get('client:shop:address'))
    );

    this.organization_service = createClient(
      {
        ...cfg.get('client:organization'),
        logger
      } as GrpcClientConfig,
      OrganizationServiceDefinition,
      createChannel(cfg.get('client:organization:address'))
    );

    this.contact_point_service = createClient(
      {
        ...cfg.get('client:contact_point'),
        logger
      } as GrpcClientConfig,
      ContactPointServiceDefinition,
      createChannel(cfg.get('client:contact_point:address'))
    );

    this.address_service = createClient(
      {
        ...cfg.get('client:address'),
        logger
      } as GrpcClientConfig,
      AddressServiceDefinition,
      createChannel(cfg.get('client:address:address'))
    );

    this.country_service = createClient(
      {
        ...cfg.get('client:country'),
        logger
      } as GrpcClientConfig,
      CountryServiceDefinition,
      createChannel(cfg.get('client:country:address'))
    );

    // optional Fulfillment
    const fulfillment_cfg = cfg.get('client:fulfillment');
    if (fulfillment_cfg.disabled) {
      // ignore!
    }
    else if (fulfillment_cfg) {
      this.creates_fulfillments_on_submit = fulfillment_cfg.createOnSubmit;
      this.cleanup_fulfillments_post_submit = fulfillment_cfg.cleanupPostSubmit;
      this.fulfillment_tech_user = fulfillment_cfg.users?.tech_user;
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
      this.logger.warn('fulfillment config is missing!');
    }

    const fulfillment_product_cfg = cfg.get('client:fulfillment_product');
    if (fulfillment_product_cfg.disabled) {
      // ignore!
    }
    else if (fulfillment_product_cfg) {
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
      this.logger.warn('fulfillment_product config is missing!');
    }

    const invoicing_cfg = cfg.get('client:invoice');
    if (invoicing_cfg.disabled) {
      // ignore!
    }
    else if (invoicing_cfg) {
      this.creates_invoices_on_submit = invoicing_cfg.createOnSubmit;
      this.cleanup_invoices_post_submit = invoicing_cfg.cleanupPostSubmit;
      this.invoice_tech_user = invoicing_cfg.users?.tech_user;
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
      this.logger.warn('invoice config is missing!');
    }
  }

  private createStatusCode(
    id?: string,
    entity?: string,
    status?: Status,
    entity_id?: string,
    error?: string,
  ): Status {
    return {
      id,
      code: status?.code ?? 500,
      message: status?.message?.replace(
        '{error}', error ?? 'undefined'
      ).replace(
        '{entity}', entity ?? 'undefined'
      ).replace(
        '{id}', entity_id ?? 'undefined'
      ) ?? 'Unknown status',
    };
  }

  private createOperationStatusCode(
    entity: string,
    status: OperationStatus,
  ): OperationStatus {
    return {
      code: status?.code ?? 500,
      message: status?.message?.replace(
        '{entity}', entity
      ) ?? 'Unknown status',
    };
  }

  private catchOperationError(e: any) {
    const error = {
      items: [] as any[],
      total_count: 0,
      operation_status: {
        code: e?.code ?? 500,
        message: e?.message ?? e?.details ?? (e ? JSON.stringify(e) : 'Unknown Error!'),
      }
    };
    this.logger.error(error);
    return error;
  }

  private getOrdersById(
    ids: (string | undefined)[] | undefined,
    subject?: Subject,
    context?: any
  ): Promise<OrderListResponse> {
    const order_ids = [...new Set(ids)];

    if (order_ids.length > 1000) {
      throw this.createOperationStatusCode(
        this.name,
        this.operation_status_codes.LIMIT_EXHAUSTED,
      );
    }

    const call = ReadRequest.fromPartial(
      {
        filters: [{
          filters: [{
            field: 'id',
            operation: Filter_Operation.in,
            value: JSON.stringify(order_ids),
            type: Filter_ValueType.ARRAY,
            filters: [],
          }]
        }],
        limit: order_ids.length,
        subject,
      }
    );
    return super.read(call, context);
  }

  private getOrderMap(
    ids: (string | undefined)[] | undefined,
    subject?: Subject,
    context?: any,
  ): Promise<OrderMap> {
    return this.getOrdersById(
      ids,
      subject,
      context
    ).then(
      response => {
        if (response.operation_status?.code === 200) {
          return response?.items?.reduce(
            (a, b) => {
              a[b.payload?.id!] = b as OrderResponse;
              return a;
            },
            {} as OrderMap
          ) ?? {};
        }
        else {
          throw response.operation_status;
        }
      }
    );
  }

  private async mapBundles(products: ProductMap) {
    const product_ids = [...new Set(Object.values(products).filter(
      (product) => !!product.payload?.bundle
    ).flatMap(
      (product) => product.payload?.bundle?.products?.map(
        (item) => item.product_id
      )
    ).filter(
      id => !!products[id!]
    )).values()];

    if (product_ids.length) {
      await this.product_service.read({
        filters: [{
          filters: [{
            field: 'id',
            operation: Filter_Operation.in,
            value: JSON.stringify(product_ids),
            type: Filter_ValueType.ARRAY,
          }]
        }],
        limit: product_ids.length,
      }).then(
        response => {
          if (response.operation_status?.code === 200) {
            response.items?.forEach(
              item => products[item.payload?.id!] = item
            );
          }
          else {
            throw response.operation_status;
          }
        }
      );

      await this.mapBundles(products);
    }
  }

  private flatMapProductToFulfillmentItem(
    products: ProductMap,
    product_id: string,
    variant_id?: string,
    quantity = 1
  ): FulfillmentItem[] {
    const main = products[product_id]?.payload;
    const variant = main?.product?.physical?.variants?.find(v => v.id === variant_id);
    if (variant) {
      return [{
        product_id: main!.id,
        variant_id,
        quantity,
        package: variant.package,
      }];
    }
    else if (main!.bundle?.pre_packaged) {
      return [{
        product_id: main!.id,
        variant_id,
        quantity,
        package: main!.bundle.pre_packaged,
      }];
    }
    else {
      return main!.bundle?.products?.flatMap(
        item => this.flatMapProductToFulfillmentItem(
          products,
          item.product_id!,
          item.variant_id,
          item.quantity,
        )
      ) ?? [];
    }
  };

  private async getProductMap(
    orders: (Order | undefined)[] | undefined,
    subject?: Subject,
    context?: any,
  ): Promise<ProductMap> {
    const product_ids = [...new Set<string>(orders?.flatMap(
      (o) => o?.items?.map(
        (item) => item.product_id!
      ) ?? []
    ).filter(
      (id) => !!id
    )).values()];

    if (!product_ids.length) {
      throw this.createOperationStatusCode(
        'product',
        this.operation_status_codes.NO_ITEM,
      );
    }
    else if (product_ids.length > 1000) {
      throw this.createOperationStatusCode(
        'product',
        this.operation_status_codes.LIMIT_EXHAUSTED,
      );
    }

    const product_id_json = JSON.stringify(product_ids);
    const products = await this.product_service.read(
      {
        filters: [
          {
            filters: [{
              field: 'id',
              operation: Filter_Operation.in,
              value: product_id_json,
              type: Filter_ValueType.ARRAY,
            }],
          },
        ],
        limit: product_ids.length,
        subject,
      },
      context,
    ).then(
      (response) => {
        if (response.operation_status?.code !== 200) {
          throw response.operation_status;
        }
        else if (!response.items?.length) {
          throw this.createOperationStatusCode(
            'products',
            this.operation_status_codes.ITEM_NOT_FOUND,
          );
        }
        else {
          return response.items!.reduce(
            (a, b) => {
              a[b.payload?.id!] = b;
              return a;
            }, {} as ProductMap
          );
        }
      }
    );

    if (products) {
      await this.mapBundles(products);
    }
    return products;
  }

  private getRatioedTaxMap(
    products: ProductMap,
    subject?: Subject,
    context?: any
  ): Promise<RatioedTaxMap> {
    const getTaxIdsRecursive = (
      product: ProductResponse
    ): string[] => {
      return [
        ...product.payload!.product?.tax_ids ?? [],
        ...product.payload!.product?.physical?.variants?.flatMap(
          variant => variant.tax_ids ?? []
        ) ?? [],
        ...product.payload!.product?.virtual?.variants?.flatMap(
          variant => variant.tax_ids ?? []
        ) ?? [],
        ...product.payload!.bundle?.products?.flatMap(
          (p) => getTaxIdsRecursive(products[p.product_id!]!)
        ) ?? []
      ];
    };

    const tax_ids = JSON.stringify([
      ...new Set<string>(
        Object.values(
          products
        ).flatMap(
          (product) => getTaxIdsRecursive(product)
        ).filter(
          (id) => !!id
        )
      ).values()
    ]);

    return this.tax_service.read(
      {
        filters: [{
          filters: [
            {
              field: 'id',
              operation: Filter_Operation.in,
              value: tax_ids,
              type: Filter_ValueType.ARRAY,
            }
          ]
        }],
        subject,
      },
      context
    ).then(
      response => {
        if (response.operation_status?.code !== 200) {
          throw response.operation_status;
        }
        else if (!response.items?.length) {
          throw this.createOperationStatusCode(
            'taxes',
            this.operation_status_codes.ITEM_NOT_FOUND,
          );
        }
        else {
          return response.items!.reduce(
            (a, b) => {
              a[b.payload?.id!] = b.payload!;
              return a;
            },
            {} as RatioedTaxMap
          ) ?? {};
        }
      }
    );
  }

  private async getFulfillmentMap(
    order_ids: (string | undefined)[] | undefined,
    subject?: Subject,
    context?: any,
  ): Promise<FulfillmentMap> {
    if (!!this.fulfillment_service) return {};
    order_ids = [...new Set<string | undefined>(order_ids ?? [])];

    if (order_ids.length > 1000) {
      throw this.createOperationStatusCode(
        'fulfillment',
        this.operation_status_codes.LIMIT_EXHAUSTED,
      );
    }

    return await this.fulfillment_service!.read(
      {
        filters: [{
          filters: [
            {
              field: 'reference.instance_type',
              operation: Filter_Operation.eq,
              value: this.instanceType,
            },
            {
              field: 'reference.instance_id',
              operation: Filter_Operation.in,
              value: JSON.stringify(order_ids),
              type: Filter_ValueType.ARRAY
            }
          ]
        }],
        limit: order_ids.length,
        subject,
      },
      context,
    ).then(
      response => {
        if (response.operation_status?.code === 200) {
          return response.items?.reduce(
            (a, b) => {
              if (b.payload?.id! in a) {
                a[b.payload?.id!].push(b);
              }
              else {
                a[b.payload?.id!] = [b];
              }
              return a;
            }, {} as FulfillmentMap
          ) ?? {};
        }
        else {
          throw response.operation_status;
        }
      }
    );
  }

  private async get<T>(
    ids: (string | undefined)[],
    service: CRUDClient,
    subject?: Subject,
    context?: any,
  ): Promise<T> {
    ids = [...new Set<string | undefined>(ids)];
    const entity = typeof ({} as T);

    if (ids.length > 1000) {
      throw this.createOperationStatusCode(
        entity,
        this.operation_status_codes.LIMIT_EXHAUSTED,
      );
    }

    return await service.read(
      {
        filters: [{
          filters: [
            {
              field: 'id',
              operation: Filter_Operation.in,
              value: JSON.stringify(ids),
              type: Filter_ValueType.ARRAY,
            }
          ]
        }],
        limit: ids.length,
        subject,
      },
      context,
    ).then(
      (response: any) => {
        if (response.operation_status?.code !== 200) {
          throw response.operation_status;
        }
        else if (!response.items?.length) {
          throw this.createOperationStatusCode(
            entity,
            this.operation_status_codes.ITEM_NOT_FOUND,
          );
        }
        else {
          return response.items?.reduce(
            (a: any, b: any) => {
              a[b.payload?.id] = b;
              return a;
            }, {} as T
          );
        }
      }
    );
  }

  private async getById<T>(
    id: string | undefined,
    map: { [id: string]: T },
    request_id?: string,
  ): Promise<T> {
    if (id && id in map) {
      return map[id];
    }
    else {
      throw this.createStatusCode(
        request_id ?? 'undefined',
        ({} as new() => T)?.name,
        this.status_codes.NOT_FOUND,
        id ?? 'undefined',
      );
    }
  }

  private async getByIds<T>(
    ids: (string | undefined)[] | undefined,
    map: { [id: string]: T },
    request_id?: string,
  ): Promise<T[]> {
    return Promise.all(ids?.map(
      id => this.getById(
        id,
        map,
        request_id,
      )
    ) ?? []);
  }

  private async aggregateOrders(
    order_list: OrderList,
    subject?: Subject,
    context?: any
  ): Promise<OrderListResponse> {
    if (!order_list?.items?.length) {
      return {
        operation_status: this.createOperationStatusCode(
          'order',
          this.operation_status_codes.NO_ITEM,
        )
      };
    }

    const product_map = await this.getProductMap(
      order_list.items,
      subject,
      context
    );
    const tax_map = await this.getRatioedTaxMap(
      product_map,
      subject,
      context
    );
    const customer_map = await this.get<CustomerMap>(
      order_list.items?.map(item => item.customer_id) ?? [],
      this.customer_service,
      subject,
      context,
    );
    const shop_map = await this.get<ShopMap>(
      order_list.items?.map(item => item.shop_id) ?? [],
      this.shop_service,
      subject,
      context,
    );
    const organization_map = await this.get<OrganizationMap>(
      Object.values(
        shop_map
      ).map(
        item => item.payload?.organization_id
      ),
      this.organization_service,
      subject,
      context,
    );
    const contact_point_map = await this.get<ContactPointMap>(
      Object.values(
        organization_map
      ).flatMap(
        item => item.payload?.contact_point_ids
      ),
      this.contact_point_service,
      subject,
      context,
    );
    const address_map = await this.get<AddressMap>(
      Object.values(
        contact_point_map
      ).map(
        item => item.payload?.physical_address_id
      ),
      this.address_service,
      subject,
      context,
    );
    const country_map = await this.get<CountryMap>(
      [
        ...Object.values(
          tax_map
        ).map(
          t => t.country_id
        ),
        ...Object.values(
          address_map
        ).map(
          item => item.payload?.country_id
        )
      ],
      this.country_service,
      subject,
      context,
    );

    const getTaxesRecursive = async (
      main: Product,
      price_ratio = 1.0
    ): Promise<RatioedTax[]> => {
      if (main.bundle) {
        return await Promise.all(
          main?.bundle?.products?.flatMap(
            p => getTaxesRecursive(
              product_map[p?.product_id!]?.payload!,
              (p.price_ratio ?? 0) * price_ratio
            )
          ) ?? []
        ).then(
          promise => promise.flatMap(p => p)
        );
      }
      else {
        return await Promise.all([
          ...main.product?.tax_ids?.map(
            async (id) => ({
              ...(await this.getById(id, tax_map)),
              tax_ratio: price_ratio
            } as RatioedTax)
          ) ?? [],
          ...main.product?.physical?.variants!.flatMap(
            variant => variant.tax_ids?.map(
              async (id) => ({
                ...(await this.getById(id, tax_map)),
                tax_ratio: price_ratio
              } as RatioedTax)
            ) ?? []
          ) ?? [],
          ...main.product?.virtual?.variants!.flatMap(
            variant => variant.tax_ids?.map(
              async (id) => ({
                ...(await this.getById(id, tax_map)),
                tax_ratio: price_ratio
              } as RatioedTax)
            ) ?? []
          ) ?? [],
        ]);
      }
    };

    const mergeProductVariantRecursive = (
      nature: ProductNature,
      variant_id: string | undefined,
    ): ProductVariant | undefined => {
      const variant = nature?.variants?.find(v => v.id === variant_id);
      if (variant?.parent_variant_id) {
        const template = mergeProductVariantRecursive(
          nature, variant.parent_variant_id
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

    const promises = order_list.items?.map(async (order) => {
      try {
        const customer = await this.getById(
          order?.customer_id,
          customer_map,
          order.id,
        );
        const shop = await this.getById(
          order?.shop_id,
          shop_map,
          order.id,
        );
        const country = await this.getById(
          shop.payload?.organization_id,
          organization_map,
          order.id,
        ).then(
          orga => this.getByIds(
            orga.payload!.contact_point_ids!,
            contact_point_map,
            order.id,
          )
        ).then(
          cps => cps.find(
            cp => (
              cp.payload?.contact_point_type_ids?.indexOf(
                this.legal_address_type_id
              ) ?? -1
            ) >= 0
          )
        ).then(
          cp => {
            if (!cp) {
              throw this.createStatusCode(
                order.id,
                'Shop',
                this.status_codes.NO_LEGAL_ADDRESS,
                order.shop_id,
              );
            }
            else {
              return this.getById(
                cp.payload?.physical_address_id,
                address_map,
                order.id,
              );
            }
          }
        ).then(
          address => this.getById(
            address.payload?.country_id,
            country_map,
            order.id,
          )
        ).then(
          country => country.payload
        );

        if (customer.payload?.private?.user_id) {
          order.user_id = customer.payload.private.user_id;
        }

        if (order.items?.length) {
          await Promise.all(order.items?.map(
            async (item) => {
              if (!order.shipping_address) {
                throw this.createStatusCode(
                  order.id,
                  'Order',
                  this.status_codes.NO_SHIPPING_ADDRESS,
                  order?.id,
                );
              }

              const product = await this.getById(
                item.product_id,
                product_map,
                order.id,
              );
              const billing_address = await this.getById(
                order.billing_address?.address?.country_id,
                country_map,
                order.id,
              );
              const nature = (product.payload!.product?.physical ?? product.payload!.product?.virtual) as ProductNature;
              const variant = mergeProductVariantRecursive(nature, item.variant_id);
              const taxes = await getTaxesRecursive(product.payload!);
              const unit_price = product.payload!.bundle ? product.payload!.bundle?.price : variant?.price;
              const gross = (unit_price?.sale ? unit_price?.sale_price ?? 0 : unit_price?.regular_price ?? 0) * (item.quantity ?? 0);
              const vats = taxes.filter(
                t => (
                  t.country_id === country?.id &&
                  !!customer?.payload!.private?.user_id &&
                  country?.economic_areas?.some(
                    ea => billing_address?.payload?.economic_areas?.includes(ea)
                  ) &&
                  (variant?.tax_ids?.length && variant.tax_ids?.includes(t.id!))
                )
              ).map(
                t => ({
                  tax_id: t.id,
                  vat: gross * t.rate! * t.tax_ratio!
                }) as VAT
              );
              const net = vats.reduce((a, b) => b.vat! + a, gross);
              item.unit_price = unit_price;
              item.amount = {
                gross,
                net,
                vats,
              };
            }
          ) ?? []);
        }
        else {
          throw this.createStatusCode(
            order?.id,
            'Order',
            this.status_codes.NO_ITEM,
            order?.id,
          );
        }

        order.total_amounts = Object.values(order.items?.reduce(
          (amounts, item) => {
            const amount = amounts[item.amount?.currency_id!];
            if (amount) {
              amount.gross! += item.amount?.gross!;
              amount.net! += item.amount?.net!;
              amount.vats!.push(...item.amount?.vats!);
            }
            else {
              amounts[item.amount?.currency_id!] = { ...item.amount };
            }
            return amounts;
          },
          {} as { [key: string]: Amount }
        ));

        order.total_amounts.forEach(
          amount => {
            amount.vats = Object.values(
              amount.vats?.reduce(
                (vats, vat) => {
                  if (vat.tax_id! in vats) {
                    vats[vat.tax_id!].vat = (vats[vat.tax_id!]?.vat ?? 0) + vat.vat!;
                  }
                  else {
                    vats[vat.tax_id!] = { ...vat };
                  }
                  return vats;
                },
                {} as { [key: string]: VAT }
              ) ?? {}
            );
          }
        );

        return {
          payload: order,
          status: this.createStatusCode(
            order?.id,
            'Order',
            this.status_codes.OK,
            order?.id,
          ),
        } as OrderResponse;
      }
      catch (e: any) {
        if (order) {
          order.order_state = OrderState.INVALID;
        };
        return {
          payload: order,
          status: {
            id: order?.id,
            code: e?.code ?? 500,
            message: e?.message ?? e?.details ?? (e ? JSON.stringify(e) : 'Unknown Error!')
          }
        } as OrderResponse;
      }
    }) as OrderResponse[];

    const items = await Promise.all(promises);
    const operation_status = items.some(
      a => a.status?.code !== 200
    ) ? this.createOperationStatusCode(
        'order',
        this.operation_status_codes.PARTIAL
      ) : this.createOperationStatusCode(
        'order',
        this.operation_status_codes.SUCCESS
      );

    return {
      items,
      total_count: items.length ?? 0,
      operation_status,
    };
  }

  public async updateState(
    ids: string[],
    state: OrderState,
    subject?: Subject,
    context?: any
  ): Promise<DeepPartial<OrderListResponse>> {
    try {
      const responseMap = await this.getOrderMap(
        ids,
        subject,
        context
      );

      const items = Object.values(responseMap).filter(
        item => item.status?.code === 200 && item.payload
      ).map(
        item => {
          item.payload!.order_state = state;
          return item.payload!;
        }
      );

      const response = await super.update(
        {
          items,
          total_count: items.length,
          subject
        },
        context
      );

      if (response.operation_status?.code === 200) {
        response.items?.forEach(
          (item: OrderResponse) => {
            responseMap[item.payload?.id ?? item.status?.id!] = item;
            if (item.status?.code === 200 && item?.payload?.order_state! in this.emitters) {
              switch (item.payload?.order_state) {
                case OrderState.INVALID, OrderState.FAILED:
                  this.topic.emit(this.emitters[item.payload.order_state], item);
                default:
                  this.topic.emit(this.emitters[item.payload?.order_state!], item.payload!);
                  break;
              }
            }
          }
        );
      }
      else {
        throw response.operation_status;
      }

      return {
        items: Object.values(responseMap),
        total_count: ids.length,
        operation_status: response.operation_status
      } as OrderListResponse;
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  @access_controlled_function({
    action: AuthZAction.READ,
    operation: Operation.whatIsAllowed,
    context: DefaultACSClientContextFactory,
    resource: [{ resource: 'order' }],
    database: 'arangoDB',
    useCache: true,
  })
  public override read(
    request: ReadRequest,
    context?: any
  ) {
    return super.read(request, context);
  }

  @injects_meta_data()
  @access_controlled_function({
    action: AuthZAction.CREATE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('order'),
    database: 'arangoDB',
    useCache: true,
  })
  public override create(
    request: OrderList,
    context?: any
  ) {
    request?.items?.forEach(
      item => {
        if (!item.order_state || item.order_state === OrderState.UNRECOGNIZED) {
          item.order_state = OrderState.CREATED;
        }
      }
    );
    return super.create(request, context);
  }

  @access_controlled_function({
    action: AuthZAction.MODIFY,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('order'),
    database: 'arangoDB',
    useCache: true,
  })
  public override update(
    request: OrderList,
    context?: any
  ) {
    return super.update(request, context);
  }

  @injects_meta_data()
  @access_controlled_function({
    action: AuthZAction.MODIFY,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('order'),
    database: 'arangoDB',
    useCache: true,
  })
  public override upsert(
    request: OrderList,
    context?: any
  ) {
    request?.items?.forEach(
      item => {
        if (!item.order_state || item.order_state === OrderState.UNRECOGNIZED) {
          item.order_state = OrderState.CREATED;
        }
      }
    );
    return super.upsert(request, context);
  }

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
    context?: any
  ): Promise<OrderListResponse> {
    try {
      return await this.aggregateOrders(
        request,
        request.subject,
        context
      );
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

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
    context?: any
  ): Promise<OrderSubmitListResponse> {
    try {
      const unauthenticated = request.subject?.unauthenticated
        || !request.subject?.id?.length
        || request.subject?.id === this.unauthenticated_user?.id;

      if(unauthenticated) {
        await super.read(
          {
            filters: [
              {
                filters: [
                  {
                    field: 'id',
                    operation: Filter_Operation.in,
                    value: JSON.stringify(request.items?.map(item => item.id)),
                    type: Filter_ValueType.ARRAY,
                  }
                ],
                operator: FilterOp_Operator.and,
              }
            ]
          },
          context,
        ).then(
          response => {
            if (response.items?.length) {
              throw this.createOperationStatusCode(
                'order',
                this.operation_status_codes.CONFLICT
              );
            }
          }
        );
      }

      const responseMap = request.items?.reduce(
        (a, b) => {
          a[b.id!] = {};
          return a;
        },
        {} as { [key: string]: OrderResponse }
      ) ?? {};

      const { items, operation_status } = await this.aggregateOrders(
        request,
        request.subject,
        context,
      ).then(
        response => ({
          items: response.items?.filter(
            (item: OrderResponse) => {
              if (item.status?.id! in responseMap) {
                responseMap[item.status?.id!] = item;
              }
              return item.status?.code === 200;
            }
          ).map(
            item => {
              item.payload!.order_state = OrderState.SUBMITTED;
              return item.payload as Order;
            }
          ),
          operation_status: response.operation_status
        })
      );

      if (!items?.length) {
        return {
          orders: Object.values(responseMap),
          operation_status,
        };
      }

      const orders = await super.upsert(
        {
          items,
          total_count: items.length,
          subject: request.subject,
        },
        context,
      ) as OrderListResponse;

      orders.items?.forEach(
        item => {
          responseMap[item.payload?.id ?? item.status?.id!] = item;
        }
      );

      const response: OrderSubmitListResponse = {
        orders: orders.items,
        operation_status: orders.operation_status,
      };

      if (this.creates_fulfillments_on_submit) {
        response.fulfillments = await this.createFulfillment(
          {
            items: orders.items?.filter(
              order => order.status?.code === 200
                || order.payload?.packaging_preferences?.options?.find(
                  att => att.id === this.urn_disable_fulfillment
                )?.value === 'true'
            ).map(
              order => ({
                order_id: order.payload?.id,
              })
            ),
            subject: request.subject,
          },
          context,
        ).then(
          response => {
            if (response.operation_status?.code! < 300) {
              return response.items;
            }
            else {
              throw response.operation_status;
            }
          }
        );

        response.fulfillments!.forEach(
          fulfillment => {
            fulfillment.payload?.references?.forEach(
              reference => {
                const order = responseMap[reference.instance_id!];
                if (fulfillment.status?.code !== 200 && order) {
                  order.payload = {
                    ...order.payload,
                    order_state: OrderState.INVALID
                  };
                  order.status = {
                    ...fulfillment.status,
                    id: order.payload?.id ?? order.status?.id,
                  };
                }
              }
            );
          }
        );
      }

      if (this.creates_invoices_on_submit) {
        response.invoices = await this.createInvoice(
          {
            items: orders.items?.filter(
              order => order.status?.code === 200
                || order.payload?.packaging_preferences?.options?.find(
                  att => att.id === this.urn_disable_invoice
                )?.value === 'true'
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
            subject: request.subject,
          },
          context,
        ).then(
          response => {
            if (response.operation_status?.code! < 300) {
              return response.items;
            }
            else {
              throw response.operation_status;
            }
          }
        );

        response.invoices?.forEach(
          invoice => {
            invoice.payload?.references?.forEach(
              reference => {
                const order = responseMap[reference.instance_id!];
                if (invoice.status?.code !== 200 && order) {
                  order.payload = {
                    ...order.payload,
                    order_state: OrderState.INVALID
                  };
                  order.status = {
                    ...invoice.status,
                    id: order.payload?.id ?? order.status?.id,
                  };
                }
              }
            );
          }
        );
      }

      const failed_order_ids = orders.items?.filter(
        order => order.status?.code !== 200
      ).map(
        order => order.payload?.id ?? order.status?.id!
      ) ?? [];

      if (this.cleanup_fulfillments_post_submit) {
        const failed_fulfillment_ids = response.fulfillments?.filter(
          fulfillment => fulfillment.payload?.references?.find(
            reference => reference.instance_id! in failed_order_ids
          )
        ).map(
          fulfillment => fulfillment.payload?.id!
        );

        if (failed_fulfillment_ids?.length) {
          await this.fulfillment_service?.delete(
            {
              ids: failed_fulfillment_ids,
              subject: this.fulfillment_tech_user,
            },
            context,
          );
        }
      }

      if (this.cleanup_invoices_post_submit) {
        const failed_invoice_ids = response.invoices?.filter(
          invoice => invoice.payload?.references?.find(
            reference => reference.instance_id! in failed_order_ids
          )
        ).map(
          invoice => invoice.payload?.id!
        );

        if (failed_invoice_ids?.length) {
          await this.invoice_service?.delete(
            {
              ids: failed_invoice_ids,
              subject: this.invoice_tech_user,
            },
            context,
          );
        }
      }

      if (unauthenticated && failed_order_ids.length) {
        await super.delete(
          {
            ids: failed_order_ids
          },
          context,
        );
      }

      Object.values(responseMap).forEach(
        item => {
          if (
            item.payload?.order_state! in this.emitters
          ) {
            switch (item.payload?.order_state) {
              case OrderState.INVALID, OrderState.FAILED:
                this.topic.emit(this.emitters[item.payload.order_state], item);
              default:
                this.topic.emit(this.emitters[item.payload?.order_state!], item.payload!);
                break;
            }
          }
        }
      );

      return response;
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.withdrawOrder'),
    database: 'arangoDB',
    useCache: true,
  })
  public withdraw(
    request: OrderIdList,
    context?: any
  ): Promise<OrderListResponse> {
    return this.updateState(
      request.ids ?? [],
      OrderState.WITHDRAWN,
      request.subject,
      context,
    );
  }

  @access_controlled_function({
    action: AuthZAction.EXECUTE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('execution.cancelOrders'),
    database: 'arangoDB',
    useCache: true,
  })
  public cancel(
    request: OrderIdList,
    context?: any
  ): Promise<OrderListResponse> {
    return this.updateState(
      request.ids ?? [],
      OrderState.CANCELLED,
      request.subject,
      context,
    );
  }

  @access_controlled_function({
    action: AuthZAction.DELETE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: DefaultResourceFactory('order'),
    database: 'arangoDB',
    useCache: true,
  })
  public override delete(
    request: DeleteRequest,
    context: any,
  ) {
    return super.delete(request, context);
  }

  private async getPackingSolution(
    request: FulfillmentRequestList,
    context?: any,
    orders?: OrderMap,
    products?: ProductMap,
  ): Promise<PackingSolutionListResponse> {
    const responseMap = request.items?.reduce(
      (a, b) => {
        a[b.order_id!] = {
          reference: {
            instance_type: this.instanceType,
            instance_id: b.order_id,
          },
          solutions: undefined,
          status: undefined,
        };
        return a;
      },
      {} as { [key: string]: PackingSolutionResponse }
    ) ?? {};

    orders = orders ?? await this.getOrderMap(
      request.items?.map(item => item.order_id!),
      request.subject,
      context
    ) ?? {};

    products = products ?? await this.getProductMap(
      Object.values(orders).map(item => item.payload),
      request.subject,
      context,
    ) ?? {};

    const items = request.items?.filter(
      item => {
        const response = responseMap[item.order_id!];
        const order = orders?.[item.order_id!];

        if (!order) {
          response.status = this.createStatusCode(
            item.order_id,
            this.entityName,
            this.status_codes.NOT_FOUND,
            item.order_id,
          );
          return false;
        }

        if (order.status?.code! !== 200) {
          response.status = order.status;
          return false;
        }

        return true;
      }
    ).map(
      item => {
        const response = responseMap[item.order_id!];
        const order = orders?.[item.order_id!];
        const items = order?.payload?.items?.flatMap(
          item => this.flatMapProductToFulfillmentItem(
            products!,
            item.product_id!,
            item.variant_id,
            item.quantity
          )
        );

        if (items?.length === 0) {
          response.status = this.createStatusCode(
            item.order_id,
            this.entityName,
            this.status_codes.NO_PHYSICAL_ITEM,
            item.order_id,
          );
        }

        return {
          sender: item.sender_address,
          receiver: order?.payload?.shipping_address,
          items,
          preferences: order?.payload?.packaging_preferences,
          order_id: order?.payload?.id,
        } as PackingSolutionQuery;
      }
    ).filter(
      item => item.items?.length
    );

    const query = {
      items,
      total_count: items?.length,
      subject: request.subject
    } as PackingSolutionQueryList;
    const solutions = await this.fulfillment_product_service?.find(
      query,
      context
    );

    solutions?.items?.forEach(
      item => {
        responseMap[item.reference?.instance_id ?? item.status?.id!] = item;
      }
    );

    return {
      items: Object.values(responseMap),
      total_count: request.total_count,
      operation_status: solutions?.operation_status,
    };
  }

  @access_controlled_function({
    action: AuthZAction.READ,
    operation: Operation.whatIsAllowed,
    context: DefaultACSClientContextFactory,
    resource: [{ resource: 'order' }],
    database: 'arangoDB',
    useCache: true,
  })
  public async queryPackingSolution(
    request: FulfillmentRequestList,
    context?: any,
  ): Promise<PackingSolutionListResponse> {
    try {
      return await this.getPackingSolution(request, context);
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  private async toFulfillmentResponsePrototypes(
    request: FulfillmentRequestList,
    context?: any,
  ): Promise<FulfillmentResponse[]> {
    const orders = await this.getOrderMap(
      request.items?.map(
        item => item.order_id
      ),
      request.subject,
      context
    );

    Object.values(orders).forEach(
      order => {
        if (order.payload?.order_state !== OrderState.SUBMITTED) {
          order.status = {
            id: order.payload?.id,
            code: 400,
            message: `${this.name} state ${order.payload?.order_state} expected to be ${OrderState.SUBMITTED}`,
          } as Status;
        }
      }
    );

    const solutions = await this.getPackingSolution(
      request,
      context,
      orders,
    ).then(
      response => {
        if (response.operation_status?.code === 200) {
          return response.items?.reduce(
            (a, b) => {
              a[b.reference?.instance_id ?? b.status?.id!] = b;
              return a;
            },
            {} as PackingSolutionMap
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
        const status = [
          solution?.status,
          order?.status,
        ].find(status => status?.code === 200) ?? {
          id: item.order_id,
          code: 404,
          message: `Order ${item.order_id} not found!`,
        } as Status;

        const fulfillment: FulfillmentResponse = {
          payload:
            status?.code === 200 ?
              {
                references: [{
                  instance_type: this.instanceType,
                  instance_id: item.order_id,
                }],
                packaging: {
                  parcels: solution?.solutions?.[0]?.parcels,
                  notify: order.payload?.notification_email,
                  export_type: item.export_type,
                  export_description: item.export_description,
                  invoice_number: item.invoice_number,
                  sender: item.sender_address,
                  recipient: order.payload?.shipping_address,
                } as Packaging,
                total_amounts: solution?.solutions?.[0]?.amounts,
              } : undefined,
          status,
        };

        return fulfillment;
      }
    ) ?? [];
  }

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
    context?: any
  ): Promise<FulfillmentListResponse> {
    try {
      const prototypes = await this.toFulfillmentResponsePrototypes(
        request,
        context
      );

      const invalids = prototypes.filter(
        proto => proto.status?.code !== 200
      );

      const valids = await DefaultMetaDataInjector(
        this,
        {
          items: prototypes.filter(
            proto => proto.status?.code === 200
          ).map(
            proto => proto.payload!
          ),
          subject: request.subject,
        }
      );

      const response = await this.fulfillment_service!.create(
        {
          items: valids.items,
          total_count: valids.items.length ?? 0,
          subject: this.fulfillment_tech_user ?? request.subject,
        },
        context
      );

      return {
        items: [
          ...response.items!,
          ...invalids
        ],
        total_count: response.items?.length! + invalids.length,
        operation_status: invalids.length
          ? this.createOperationStatusCode(
            'fulfillment',
            this.operation_status_codes.PARTIAL
          )
          : response.operation_status,
      };
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

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
    context?: any
  ): Promise<FulfillmentListResponse> {
    try {
      const responseMap = request.items?.reduce(
        (a, b) => {
          a[b.order_id!] = {};
          return a;
        },
        {} as { [key: string]: FulfillmentResponse }
      ) ?? {};

      const items = await this.toFulfillmentResponsePrototypes(
        request,
        context
      ).then(
        prototypes => {
          return prototypes.filter(
            item => {
              if (item.status?.id! in responseMap) {
                responseMap[item.status?.id!].status = item.status as Status;
              }
              return item.status?.code === 200;
            }
          ).map(
            item => item.payload
          );
        }
      );

      const fulfillmentList = DefaultMetaDataInjector(
        this,
        {
          items,
          total_count: items.length,
          subject: request.subject
        } as FulfillmentList
      );

      this.logger.debug('Emit Fulfillment request', { fulfillmentList });
      await this.topic.emit(this.emitters['CREATE_FULFILLMENT'] ?? CREATE_FULFILLMENT, fulfillmentList);
      this.logger.info('Fulfillment request emitted successfully', { fulfillmentList });

      return {
        items: Object.values(responseMap),
        total_count: request.total_count,
        operation_status: {
          code: 200,
          message: 'Fulfillment request emitted successfully',
        },
      };
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  }

  private async toInvoiceResponsePrototypes(
    request: OrderingInvoiceRequestList,
    context?: any,
  ): Promise<InvoiceResponse[]> {
    const order_map = await this.getOrderMap(
      request.items?.flatMap(
        item => item.sections?.map(
          section => section.order_id
        )
      ),
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
    );

    return request.items?.map(
      item => {
        const master = order_map[item.sections?.[0]?.order_id!];
        if (master?.status?.code !== 200) {
          return {
            payload: undefined,
            status: master?.status ?? this.createStatusCode(
              item.sections?.[0]?.order_id,
              this.entityName,
              this.status_codes.NOT_FOUND,
              item.sections?.[0]?.order_id,
            )
          };
        }

        for (let section of item.sections!) {
          const order = order_map[section.order_id!];

          if (order?.status?.code !== 200) {
            return {
              payload: undefined,
              status: order?.status ?? this.createStatusCode(
                section.order_id,
                this.entityName,
                this.status_codes.NOT_FOUND,
                section.order_id,
              )
            };
          }
          else if (
            order.payload?.customer_id !== master?.payload?.customer_id ||
            order.payload?.shop_id !== master?.payload?.shop_id
          ) {
            return {
              payload: undefined,
              status: this.createStatusCode(
                section.order_id,
                typeof(order.payload),
                this.status_codes.IN_HOMOGEN_INVOICE,
                section.order_id,
              ),
            };
          }
        }

        return {
          payload: {
            invoice_number: item.invoice_number,
            user_id: master.payload?.user_id,
            customer_id: master.payload?.customer_id,
            shop_id: master.payload?.shop_id,
            references: item.sections?.map(
              section => ({
                instance_type: this.instanceType,
                instance_id: section.order_id,
              })
            ),
            customer_remark: master.payload?.customer_remark,
            sender: master.payload?.billing_address,
            recipient: master.payload?.billing_address,
            total_amounts: master.payload?.total_amounts,
            sections: item.sections?.map(
              section => {
                const order = order_map[section.order_id!];
                const product_items = (
                  section.selected_items?.length
                    ? order.payload?.items?.filter(
                      item => item.id! in section.selected_items!
                    ) ?? []
                    : order.payload?.items ?? []
                ).map(
                  (item, i): Position => ({
                    id: (i + 1).toString().padStart(3, '0'),
                    unit_price: item.unit_price,
                    quantity: item.quantity,
                    amount: item.amount,
                    product_item: {
                      product_id: item.product_id,
                      variant_id: item.variant_id,
                    },
                    attributes: [],
                  })
                );

                const fulfillment_items: Parcel[] = Object.values((
                  section.fulfillment_mode === FulfillmentInvoiceMode.INCLUDE && (
                    section.selected_fulfillments?.flatMap(
                      selection => fulfillment_map[section?.order_id!]?.find(
                        fulfillment => fulfillment.payload?.id === selection?.fulfillment_id
                      )?.payload?.packaging?.parcels?.filter(
                        parcel =>
                          selection?.selected_parcels?.length === 0 ||
                          parcel.id! in selection.selected_parcels!
                      )
                    ) ?? fulfillment_map[section.order_id!]?.flatMap(
                      fulfillment => fulfillment.payload?.packaging?.parcels
                    )
                  ) || []
                ).reduce(
                  (a, b, i) => {
                    const id = `${b?.product_id}___${b?.variant_id}`;
                    const c = a[id];
                    if (c) {
                      c.quantity! += 1;
                      c.amount!.gross! += b?.amount?.gross!;
                      c.amount!.net! += b?.amount?.net!;
                      c.amount!.vats!.push(...b?.amount?.vats!);
                    }
                    else {
                      a[id] = {
                        id: (i + product_items.length + 1).toString().padStart(3, '0'),
                        unit_price: b?.price,
                        quantity: 1,
                        amount: b?.amount,
                        fulfillment_item: {
                          product_id: b?.product_id,
                          variant_id: b?.variant_id,
                        },
                        attributes: [],
                      };
                    }
                    return a;
                  },
                  {} as PositionMap
                ));

                fulfillment_items.forEach(
                  item => {
                    item!.amount!.vats = Object.values(
                      item.amount?.vats?.reduce(
                        (a, b) => {
                          const c = a[b.tax_id!];
                          if (c) {
                            c.vat! += b.vat!;
                          }
                          else {
                            a[b.tax_id!] = { ...b };
                          }
                          return a;
                        },
                        {} as VATMap
                      ) ?? {}
                    );
                  }
                );

                return {
                  id: section.order_id,
                  amounts: order.payload?.total_amounts,
                  customer_remark: order.payload?.customer_remark,
                  positions: [
                    ...product_items,
                    ...fulfillment_items,
                  ],
                } as Section;
              }
            )
          },
          status: this.createStatusCode(
            master.payload?.id,
            'Invoice',
            this.status_codes.OK,
            master.payload?.id,
          ),
        };
      }
    ) ?? [];
  }

  @access_controlled_function({
    action: AuthZAction.CREATE,
    operation: Operation.isAllowed,
    context: OrderingService?.ACSContextFactory,
    resource: [{ resource: 'invoice' }],
    database: 'arangoDB',
    useCache: true,
  })
  public async createInvoice(
    request: OrderingInvoiceRequestList,
    context?: any,
  ): Promise<InvoiceListResponse> {
    try {
      const prototypes = await this.toInvoiceResponsePrototypes(
        request,
        context,
      );
      const invalids = prototypes.filter(
        proto => proto.status?.code !== 200
      );
      const valids = prototypes.filter(
        proto => proto.status?.code === 200
      ).map(
        proto => proto.payload!
      );

      const response = await this.invoice_service!.render(
        {
          items: valids,
          total_count: valids.length,
          subject: request.subject,
        },
        context
      );

      return {
        items: [
          ...response.items!,
          ...invalids
        ],
        total_count: response.items?.length! + invalids.length,
        operation_status: invalids.length
          ? this.createOperationStatusCode(
            'Invoice',
            this.operation_status_codes.PARTIAL,
          )
          : response.operation_status,
      };
    }
    catch (e) {
      return this.catchOperationError(e);
    }
  };

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
    context?: any,
  ): Promise<StatusListResponse> {
    throw 'Not yet implemented!';
  };
}
