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
  access_controlled_service,
  injects_meta_data,
  resolves_subject,
} from '@restorecommerce/acs-client';
import {
  ResourcesAPIBase,
  ServiceBase,
} from '@restorecommerce/resource-base-interface';
import { Topic } from '@restorecommerce/kafka-client';
import {
  OrderList,
  OrderResponse,
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
  PhysicalProduct,
  PhysicalVariant,
  Product,
  ProductResponse,
  ProductServiceDefinition,
  ServiceProduct,
  ServiceVariant,
  VirtualProduct,
  VirtualVariant
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/product.js';
import {
  TaxServiceDefinition, Tax
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/tax.js';
import {
  CustomerServiceDefinition, CustomerResponse, CustomerType,
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
  FulfillmentSolutionQuery,
  FulfillmentSolutionQueryList,
  FulfillmentSolutionListResponse,
  FulfillmentSolutionResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment_product.js';
import {
  FilterOp_Operator,
  Filter_Operation
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/filter.js';
import {
  DeleteRequest,
  Filter_ValueType,
  ReadRequest,
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
  VAT
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/amount.js';
import { Subject } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth.js';

export type BigVAT = {
  tax_id: string;
  vat: BigNumber;
};

export type BigAmount = {
  currency_id: string;
  gross: BigNumber;
  net: BigNumber;
  vats: VAT[];
};

export type RatioedTax = Tax & {
  tax_ratio?: number;
};

export const toObjectMap = <T extends object>(items: any[]) => items.reduce(
  (a, b) => {
    a[b.id ?? b.payload?.id] = b;
    return a;
  },
  {} as T
) ?? {};

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
export type FulfillmentSolutionMap = { [key: string]: FulfillmentSolutionResponse };
export type PositionMap = { [key: string]: Position };
export type StatusMap = { [key: string]: Status };
export type OperationStatusMap = { [key: string]: OperationStatus };
export type VATMap = { [key: string]: VAT };
export type ProductNature = PhysicalProduct & VirtualProduct & ServiceProduct;
export type ProductVariant = PhysicalVariant & VirtualVariant & ServiceVariant;
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
    const ids = request.ids ?? request.items?.map(
      (item: Order & FulfillmentRequest & OrderingInvoiceRequest) => item.id ?? item.order_id
    ) ?? [] as string[];
    const resources = await self.getOrdersById(ids, request.subject!, context);
    return {
      ...context,
      subject: request.subject,
      resources: [
        ...resources.items ?? [],
        ...request.items ?? [],
      ],
    };
  }

  private readonly urns = {
    instanceType: 'urn:restorecommerce:acs:model:order:Order',
    disableFulfillment: 'urn:restorecommerce:order:preferences:disableFulfillment',
    disableInvoice: 'urn:restorecommerce:order:preferences:disableInvoice',
    entity: 'urn:restorecommerce:acs:names:model:entity',
    user: 'urn:restorecommerce:acs:model:user.User',
    model: 'urn:restorecommerce:acs:model',
    role: 'urn:restorecommerce:acs:names:role',
    roleScopingEntity: 'urn:restorecommerce:acs:names:roleScopingEntity',
    roleScopingInstance: 'urn:restorecommerce:acs:names:roleScopingInstance',
    unauthenticated_user: 'urn:restorecommerce:acs:names:unauthenticated-user',
    property: 'urn:restorecommerce:acs:names:model:property',
    ownerIndicatoryEntity: 'urn:restorecommerce:acs:names:ownerIndicatoryEntity',
    ownerInstance: 'urn:restorecommerce:acs:names:ownerInstance',
    orgScope: 'urn:restorecommerce:acs:model:organization.Organization',
    subjectID: 'urn:oasis:names:tc:xacml:1.0:subject:subject-id',
    resourceID: 'urn:oasis:names:tc:xacml:1.0:resource:resource-id',
    actionID: 'urn:oasis:names:tc:xacml:1.0:action:action-id',
    action: 'urn:restorecommerce:acs:names:action',
    operation: 'urn:restorecommerce:acs:names:operation',
    execute: 'urn:restorecommerce:acs:names:action:execute',
    permitOverrides: 'urn:oasis:names:tc:xacml:3.0:rule-combining-algorithm:permit-overrides',
    denyOverrides: 'urn:oasis:names:tc:xacml:3.0:rule-combining-algorithm:deny-overrides',
    create: 'urn:restorecommerce:acs:names:action:create',
    read: 'urn:restorecommerce:acs:names:action:read',
    modify: 'urn:restorecommerce:acs:names:action:modify',
    delete: 'urn:restorecommerce:acs:names:action:delete',
    organization: 'urn:restorecommerce:acs:model:organization.Organization',
    aclIndicatoryEntity: 'urn:restorecommerce:acs:names:aclIndicatoryEntity',
    aclInstance: 'urn:restorecommerce:acs:names:aclInstance',
    skipACL: 'urn:restorecommerce:acs:names:skipACL',
    maskedProperty: 'urn:restorecommerce:acs:names:obligation:maskedProperty',
  };

  private readonly status_codes = {
    OK: {
      id: '',
      code: 200,
      message: 'OK',
    },
    ITEM_NOT_FOUND: {
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
      message: '{entity} {id} has no item in query',
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
    SOLUTION_NOT_FOUND: {
      id: '',
      code: 404,
      message: 'Solution for {entity} {id} not found!',
    }
  };

  private readonly operation_status_codes = {
    SUCCESS: {
      code: 200,
      message: 'SUCCESS',
    },
    PARTIAL: {
      code: 207,
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
      message: 'No {entity} in query!',
    },
    ITEM_NOT_FOUND: {
      code: 404,
      message: '{entity} {id} not found!',
    }
  };

  protected readonly emitters: any;
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
  protected readonly contact_point_type_ids = {
    legal: 'legal',
    shipping: 'shipping',
    billing: 'billing',
  };

  get ApiKey(): Subject {
    const apiKey = this.cfg.get('authentication:apiKey');
    return apiKey
      ? {
        id: 'apiKey',
        token: apiKey,
      }
      : undefined;
  }

  get entityName() {
    return this.name;
  }

  get instanceType() {
    return this.urns.instanceType;
  }

  constructor(
    protected readonly topic: Topic,
    protected readonly db: database.DatabaseProvider,
    public readonly cfg: ServiceConfig,
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
        cfg.get('database:main:entities:0') ?? 'order',
      ),
      cfg.get('events:enableEvents')?.toString() === 'true',
    );

    this.urns = {
      ...this.urns,
      ...cfg.get('urns'),
      ...cfg.get('authentication:urns'),
    };

    this.status_codes = {
      ...this.status_codes,
      ...cfg.get('statusCodes'),
    };

    this.operation_status_codes = {
      ...this.operation_status_codes,
      ...cfg.get('operationStatusCodes'),
    };

    this.emitters = cfg.get('events:emitters');
    this.contact_point_type_ids = {
      ...this.contact_point_type_ids,
      ...cfg.get('contactPointTypeIds')
    };

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
    if (fulfillment_cfg.disabled?.toString() === 'true') {
      this.logger.warn('Fulfillment-srv disabled!');
    }
    else if (fulfillment_cfg) {
      this.logger.debug('Fulfillment-srv enabled.', fulfillment_cfg);
      this.creates_fulfillments_on_submit = fulfillment_cfg.createOnSubmit?.toString() === 'true';
      this.cleanup_fulfillments_post_submit = fulfillment_cfg.cleanupPostSubmit?.toString() === 'true';
      this.fulfillment_tech_user = fulfillment_cfg.tech_user;
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
    if (fulfillment_product_cfg.disabled?.toString() === 'true') {
      this.logger.warn('Fulfillment-Product-srv disabled!');
    }
    else if (fulfillment_product_cfg) {
      this.logger.debug('Fulfillment-Product-srv enabled.', fulfillment_product_cfg);
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
    if (invoicing_cfg.disabled?.toString() === 'true') {
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
    status?: OperationStatus,
    entity?: string,
    id?: string,
  ): OperationStatus {
    return {
      code: status?.code ?? 500,
      message: status?.message?.replace(
        '{entity}', entity ?? 'undefined'
      ).replace(
        '{id}', id ?? 'undefined'
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
    this.logger?.error(error);
    return error;
  }

  private async getOrdersById(
    ids: (string | undefined)[] | undefined,
    subject?: Subject,
    context?: any
  ): Promise<OrderListResponse> {
    const order_ids = [...new Set(ids)].filter(
      ids => ids
    );

    if (order_ids.length === 0) {
      throw this.createOperationStatusCode(
        this.operation_status_codes.NO_ITEM,
        this.name,
      );
    }

    if (order_ids.length > 1000) {
      throw this.createOperationStatusCode(
        this.operation_status_codes.LIMIT_EXHAUSTED,
        this.name,
      );
    }

    const call = ReadRequest.fromPartial(
      {
        filters: [{
          filters: [{
            field: '_key',
            operation: Filter_Operation.in,
            value: JSON.stringify(order_ids),
            type: Filter_ValueType.ARRAY,
          }]
        }],
        limit: order_ids.length,
        subject,
      }
    );
    return await super.read(call, context);
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
              a[b.payload.id] = b as OrderResponse;
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
          if (response.operation_status?.code !== 200) {
            throw response.operation_status;
          }
          else if (response.items?.length !== product_ids.length) {
            const found = response.items?.map(item => item.payload?.id);
            const missing = product_ids.filter(
              id => !found.includes(id)
            );
            throw this.createOperationStatusCode(
              this.operation_status_codes.ITEM_NOT_FOUND,
              'products',
              JSON.stringify(missing)
            );
          }
          else {
            response.items?.forEach(
              item => products[item.payload?.id] = item
            );
          }
        }
      );

      await this.mapBundles(products);
    }
  }

  private mergeProductVariantRecursive(
    nature: ProductNature,
    variant_id: string,
  ): ProductVariant {
    const variant = nature?.templates?.find(
      v => v.id === variant_id
    ) ?? nature?.variants?.find(
      v => v.id === variant_id
    );
    if (variant?.parent_variant_id) {
      const template = this.mergeProductVariantRecursive(
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

  private flatMapProductToFulfillmentItem(
    products: ProductMap,
    product_id: string,
    variant_id?: string,
    quantity = 1
  ): FulfillmentItem[] {
    const main = products[product_id]?.payload;
    if (main?.product?.physical) {
      const variant = this.mergeProductVariantRecursive(
        main.product.physical,
        variant_id
      );
      if (!variant) {
        throw this.createStatusCode(
          variant_id,
          'Product Variant',
          this.status_codes.ITEM_NOT_FOUND,
        );
      }

      return [{
        product_id: main.id,
        variant_id,
        quantity,
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
          products,
          item.product_id!,
          item.variant_id,
          item.quantity,
        )
      ) ?? [];
    }
    else if (!main) {
      throw this.createStatusCode(
        product_id,
        'Product',
        this.status_codes.ITEM_NOT_FOUND,
      );
    }
  };

  private async getProductMap(
    orders: Order[],
    subject?: Subject,
    context?: any,
  ): Promise<ProductMap> {
    const product_ids = [...new Set<string>(orders?.flatMap(
      (o) => o?.items?.map(
        (item) => item.product_id!
      ) ?? []
    ).filter(
      (id) => id
    )).values()];

    if (!product_ids.length) {
      throw this.createOperationStatusCode(
        this.operation_status_codes.NO_ITEM,
        'products',
      );
    }
    else if (product_ids.length > 1000) {
      throw this.createOperationStatusCode(
        this.operation_status_codes.LIMIT_EXHAUSTED,
        'products',
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
        else if (response.items?.length < product_ids.length) {
          const found = response.items?.map(item => item.payload?.id);
          const missing = product_ids.filter(
            id => !found.includes(id)
          );
          throw this.createOperationStatusCode(
            this.operation_status_codes.ITEM_NOT_FOUND,
            'products',
            JSON.stringify(missing)
          );
        }
        else {
          return response.items!.reduce(
            (a, b) => {
              a[b.payload.id] = b;
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

    const tax_ids = [
      ...new Set<string>(
        Object.values(
          products
        ).flatMap(
          (product) => getTaxIdsRecursive(product)
        ).filter(
          (id) => !!id
        )
      ).values()
    ];

    return this.tax_service.read(
      {
        filters: [{
          filters: [
            {
              field: 'id',
              operation: Filter_Operation.in,
              value: JSON.stringify(tax_ids),
              type: Filter_ValueType.ARRAY,
            }
          ]
        }],
        limit: tax_ids.length,
        subject,
      },
      context
    ).then(
      response => {
        if (response.operation_status?.code !== 200) {
          throw response.operation_status;
        }
        else if (response.items?.length < tax_ids.length) {
          const found = response.items?.map(item => item.payload?.id);
          const missing = tax_ids.filter(
            id => !found.includes(id)
          );
          throw this.createOperationStatusCode(
            this.operation_status_codes.ITEM_NOT_FOUND,
            'taxes',
            JSON.stringify(missing)
          );
        }
        else {
          return response.items!.reduce(
            (a, b) => {
              a[b.payload.id] = b.payload;
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
    if (this.fulfillment_service) return {};
    order_ids = [...new Set<string | undefined>(order_ids ?? [])];

    if (order_ids.length > 1000) {
      throw this.createOperationStatusCode(
        this.operation_status_codes.LIMIT_EXHAUSTED,
        'fulfillment',
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
              if (b.payload.id in a) {
                a[b.payload.id].push(b);
              }
              else {
                a[b.payload.id] = [b];
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
    entity: string,
    subject?: Subject,
    context?: any,
  ): Promise<T> {
    ids = [...new Set<string | undefined>(ids?.filter(
      id => id
    ))];

    if (ids?.length > 1000) {
      throw this.createOperationStatusCode(
        this.operation_status_codes.LIMIT_EXHAUSTED,
        entity,
      );
    }

    if (!(ids?.length > 0)) {
      return {} as T;
    }

    return await service.read(
      {
        filters: [{
          filters: [
            {
              field: '_key',
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
        else if (response.items?.length < ids.length) {
          const found = response.items?.map((item: any) => item.payload?.id);
          const missing = ids.filter(
            id => !found.includes(id)
          );
          throw this.createOperationStatusCode(
            this.operation_status_codes.ITEM_NOT_FOUND,
            entity,
            JSON.stringify(missing),
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
    entity_name?: string,
  ): Promise<T> {
    if (id && id in map) {
      return map[id];
    }
    else {
      throw this.createStatusCode(
        request_id ?? 'undefined',
        entity_name ?? 'undefined',
        this.status_codes.ITEM_NOT_FOUND,
        id ?? 'undefined',
      );
    }
  }

  private async getByIds<T>(
    ids: (string | undefined)[] | undefined,
    map: { [id: string]: T },
    request_id?: string,
    entity_name?: string,
  ): Promise<T[]> {
    return Promise.all(ids?.map(
      id => this.getById(
        id,
        map,
        request_id,
        entity_name,
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
          this.operation_status_codes.NO_ITEM,
          'order',
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
      'customers',
      subject,
      context,
    );
    const shop_map = await this.get<ShopMap>(
      order_list.items?.map(item => item.shop_id) ?? [],
      this.shop_service,
      'shops',
      subject,
      context,
    );
    const organization_map = await this.get<OrganizationMap>(
      [
        ...Object.values(
          shop_map
        ).map(
          item => item.payload?.organization_id
        ),
        ...Object.values(
          customer_map
        ).map(
          item => item.payload?.commercial?.organization_id
            ?? item.payload?.public_sector?.organization_id
        )
      ],
      this.organization_service,
      'organizations',
      subject,
      context,
    );
    const contact_point_map = await this.get<ContactPointMap>(
      [
        ...Object.values(
          organization_map
        ).flatMap(
          item => item.payload?.contact_point_ids
        ),
        ...Object.values(
          customer_map
        ).flatMap(
          item => item.payload?.private?.contact_point_ids
        ),
      ],
      this.contact_point_service,
      'contact_points',
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
      'addresses',
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
        ),
        ...(
          order_list.items?.map(
            order => order.billing_address?.address?.country_id
          ) ?? []
        ),
        ...(
          order_list.items?.map(
            order => order.shipping_address?.address?.country_id
          ) ?? []
        ),
      ],
      this.country_service,
      'countries',
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
              product_map[p?.product_id]?.payload,
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
              ...(await this.getById(id, tax_map, main.id, 'Tax')),
              tax_ratio: price_ratio
            } as RatioedTax)
          ) ?? [],
          ...main.product?.physical?.variants!.flatMap(
            variant => variant.tax_ids?.map(
              async (id) => ({
                ...(await this.getById(id, tax_map, main.id, 'Tax')),
                tax_ratio: price_ratio
              } as RatioedTax)
            ) ?? []
          ) ?? [],
          ...main.product?.virtual?.variants!.flatMap(
            variant => variant.tax_ids?.map(
              async (id) => ({
                ...(await this.getById(id, tax_map, main.id, 'Tax')),
                tax_ratio: price_ratio
              } as RatioedTax)
            ) ?? []
          ) ?? [],
        ]);
      }
    };

    const promises = order_list.items?.map(async (order) => {
      try {
        const customer = await this.getById(
          order?.customer_id,
          customer_map,
          order.id,
          'Customer',
        );
        const shop = await this.getById(
          order?.shop_id,
          shop_map,
          order.id,
          'Shop',
        );
        const country = await this.getById(
          shop.payload?.organization_id,
          organization_map,
          order.id,
          'Organization',
        ).then(
          orga => this.getByIds(
            orga.payload!.contact_point_ids!,
            contact_point_map,
            order.id,
            'ContactPoint',
          )
        ).then(
          cps => cps.find(
            cp => cp.payload?.contact_point_type_ids?.includes(
              this.contact_point_type_ids.legal
            )
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
                'Address',
              );
            }
          }
        ).then(
          address => this.getById(
            address.payload?.country_id,
            country_map,
            order.id,
            'Country',
          )
        ).then(
          country => country.payload
        );
        const organization = organization_map[
          customer?.payload?.commercial?.organization_id
          ?? customer?.payload?.public_sector?.organization_id
        ];

        if (customer?.payload?.private) {
          order.customer_type ??= CustomerType.PRIVATE;
          order.user_id ??= customer.payload?.private?.user_id;
        }
        else if (customer?.payload?.commercial) {
          order.customer_type ??= CustomerType.COMMERCIAL;
          order.customer_vat_id ??= organization?.payload?.vat_id;
        }
        else if (customer?.payload?.public_sector) {
          order.customer_type ??= CustomerType.PUBLIC_SECTOR;
          order.customer_vat_id ??= organization?.payload?.vat_id;
        }
        order.user_id = subject.id;

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
                'Product',
              );
              const billing_country = await this.getById(
                order.billing_address?.address?.country_id,
                country_map,
                order.id,
                'Country',
              );
              const nature = product.payload!.product?.physical ?? product.payload!.product?.virtual;
              const variant = this.mergeProductVariantRecursive(nature, item.variant_id);
              const taxes = await getTaxesRecursive(product.payload!);
              const unit_price = product.payload!.bundle ? product.payload!.bundle?.price : variant?.price;
              const gross = new BigNumber(unit_price?.sale ? unit_price?.sale_price ?? 0 : unit_price?.regular_price ?? 0).multipliedBy(item.quantity ?? 0);
              const vats = taxes.filter(
                t => (
                  t.country_id === country?.id &&
                  order.customer_type === CustomerType.PRIVATE &&
                  country?.economic_areas?.some(
                    ea => billing_country?.payload?.economic_areas?.includes(ea)
                  ) && (
                    product.payload.product.tax_ids?.includes(t.id!)
                    || variant.tax_ids?.includes(t.id!)
                  )
                )
              ).map(
                (t): VAT => ({
                  tax_id: t.id,
                  vat: gross.multipliedBy(t.rate!).multipliedBy(t.tax_ratio!).decimalPlaces(2).toNumber()
                })
              );
              const net = vats.reduce((a, b) => a.plus(b.vat!), gross);
              item.unit_price = unit_price;
              item.amount = {
                currency_id: unit_price.currency_id,
                gross: gross.decimalPlaces(2).toNumber(),
                net: net.decimalPlaces(2).toNumber(),
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
            const amount = amounts[item.amount?.currency_id];
            if (amount) {
              amount.gross = amount.gross.plus(item.amount.gross!);
              amount.net = amount.net.plus(item.amount?.net);
              amount.vats.push(...(item.amount?.vats ?? []));
            }
            else {
              amounts[item.amount.currency_id] = {
                currency_id: item.amount.currency_id,
                gross: new BigNumber(item.amount.gross),
                net: new BigNumber(item.amount.net),
                vats: [...(item.amount?.vats ?? [])],
              };
            }
            return amounts;
          },
          {} as { [key: string]: BigAmount }
        )).map(
          big => ({
            currency_id: big.currency_id,
            gross: big.gross.decimalPlaces(2).toNumber(),
            net: big.net.decimalPlaces(2).toNumber(),
            vats: big.vats,
          })
        );

        order.total_amounts.forEach(
          amount => {
            amount.vats = Object.values(
              amount.vats?.reduce(
                (vats, vat) => {
                  if (vat.tax_id! in vats) {
                    vats[vat.tax_id!].vat = vats[vat.tax_id!]?.vat.plus(vat.vat) ?? new BigNumber(vat.vat);
                  }
                  else {
                    vats[vat.tax_id!] = {
                      tax_id: vat.tax_id,
                      vat: new BigNumber(vat.vat)
                    };
                  }
                  return vats;
                },
                {} as { [key: string]: BigVAT }
              ) ?? {}
            ).map(
              big => ({
                tax_id: big.tax_id,
                vat: big.vat.decimalPlaces(2).toNumber()
              })
            );
          }
        );

        const has_shop_as_owner = order.meta?.owners?.filter(
          owner => owner.id === this.urns.ownerIndicatoryEntity
            && owner.value === this.urns.organization
        ).some(
          owner => owner.attributes?.some(
            a => a.id === this.urns.ownerInstance
              && a.value === shop.payload.organization_id
          )
        );

        const customer_entity = (
          customer.payload?.private
            ? this.urns.user
            : this.urns.organization
        );
        const customer_instance = (
          customer.payload?.private?.user_id
            ?? customer.payload?.commercial?.organization_id
            ?? customer.payload?.public_sector?.organization_id
        );
        const has_customer_as_owner = order.meta?.owners?.filter(
          owner => owner.id === this.urns.ownerIndicatoryEntity
            && owner.value === customer_entity
        ).some(
          owner => owner.attributes?.some(
            a => a.id === this.urns.ownerInstance
              && a.value === customer_instance
          )
        );

        if (!has_shop_as_owner ) {
          order.meta.owners.push(
            {
              id: this.urns.ownerIndicatoryEntity,
              value: this.urns.organization,
              attributes: [
                {
                  id: this.urns.ownerInstance,
                  value: shop.payload.organization_id
                }
              ]
            }
          );
        }

        if (!has_customer_as_owner ) {
          order.meta.owners.push(
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
        this.operation_status_codes.PARTIAL,
        'order',
      ) : this.createOperationStatusCode(
        this.operation_status_codes.SUCCESS,
        'order',
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
  ): Promise<OrderListResponse> {
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
            responseMap[item.payload?.id ?? item.status?.id] = item;
            if (item.status?.code !== 200 && 'INVALID' in this.emitters) {
              this.topic.emit(this.emitters['INVALID'], item);
            }
            else if (item?.payload?.order_state in this.emitters) {
              this.topic.emit(this.emitters[item.payload?.order_state], item.payload);
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

  @resolves_subject()
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

  @resolves_subject()
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
          item.order_state = OrderState.PENDING;
        }
      }
    );
    return super.create(request, context);
  }

  @resolves_subject()
  @injects_meta_data()
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

  @resolves_subject()
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
    return super.upsert(request, context);
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
    context?: any
  ): Promise<OrderListResponse> {
    try {
      const orders = await this.aggregateOrders(
        request,
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
    context?: any
  ): Promise<OrderSubmitListResponse> {
    try {
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
                },
                {
                  field: 'order_state',
                  operation: Filter_Operation.neq,
                  value: OrderState.PENDING,
                  type: Filter_ValueType.STRING,
                },
              ],
              operator: FilterOp_Operator.and,
            }
          ],
          limit: 1,
        },
        context,
      ).then(
        response => {
          if (response.items?.length) {
            throw this.createOperationStatusCode(
              this.operation_status_codes.CONFLICT,
              'order',
            );
          }
        }
      );

      const response_map = request.items?.reduce(
        (a, b) => {
          a[b.id] = {};
          return a;
        },
        {} as { [key: string]: OrderResponse }
      ) ?? {};

      const orders = await this.aggregateOrders(
        request,
        request.subject,
        context,
      ).then(
        response => ({
          items: response.items?.filter(
            (item: OrderResponse) => {
              if (item.status?.id in response_map) {
                response_map[item.status?.id] = item;
              }
              return item.status?.code === 200;
            }
          ).map(
            item => {
              item.payload.order_state = OrderState.PENDING;
              return item;
            }
          ),
          operation_status: response.operation_status
        })
      );

      if (orders.operation_status?.code !== 200) {
        throw orders.operation_status;
      }

      const response: OrderSubmitListResponse = {};
      if (this.creates_fulfillments_on_submit) {
        this.logger?.debug('Create fulfillment on submit...');
        response.fulfillments = await this._createFulfillment(
          {
            items: orders.items?.map(item => ({
              order_id: item.payload.id,
            })),
            subject: this.fulfillment_tech_user ?? this.ApiKey ?? request.subject,
          },
          context,
          toObjectMap<OrderMap>(orders.items),
        ).then(
          r => {
            r.items?.forEach(
              fulfillment => {
                const id = fulfillment.payload?.references?.[0]?.instance_id ?? fulfillment.status?.id;
                const order = response_map[id];
                if (order && fulfillment.status?.code !== 200) {
                  order.status = fulfillment.status;
                }
              }
            );

            response.operation_status = r.operation_status;
            return r.items;
          }
        );
      }

      if (this.creates_invoices_on_submit) {
        response.invoices = await this.createInvoice(
          {
            items: orders.items?.filter(
              order => order.status?.code === 200
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
          r => {
            r.items?.forEach(
              invoice => {
                invoice.payload?.references?.forEach(
                  reference => {
                    const order = response_map[reference?.instance_id];
                    if (invoice.status?.code !== 200 && order) {
                      order.status = {
                        ...invoice.status,
                        id: order.payload?.id ?? order.status?.id,
                      };
                    }
                  }
                );
              }
            );

            response.operation_status = r.operation_status;
            return r.items;
          }
        );
      }

      const failed_order_ids = orders.items?.filter(
        order => order.status?.code !== 200
      ).map(
        order => order.payload?.id ?? order.status?.id
      ) ?? [];

      if (this.cleanup_fulfillments_post_submit) {
        const failed_fulfillment_ids = response.fulfillments?.filter(
          fulfillment => fulfillment.payload?.references?.some(
            reference => failed_order_ids.includes(reference?.instance_id)
          )
        ).map(
          fulfillment => fulfillment.payload.id
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
            reference => failed_order_ids.includes(reference?.instance_id)
          )
        ).map(
          invoice => invoice.payload.id
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

      if (response.operation_status?.code < 300) {
        const submits = Object.values(response_map).filter(
          order => order.status?.code === 200
        ).map(
          order => {
            order.payload.order_state = OrderState.SUBMITTED;
            return order.payload;
          }
        );

        await super.upsert(
          OrderList.fromPartial({
            items: submits,
            total_count: submits.length,
            subject: request.subject,
          }),
          context,
        ).then(
          r => r.items?.forEach(
            item => response_map[item.payload?.id ?? item.status?.id] = item
          )
        );
      }
      else {
        Object.values(response_map).forEach(
          order => order.status = {
            id: order.payload.id,
            code: response.operation_status.code,
            message: response.operation_status.message,
          }
        );
      }

      Object.values(response_map).forEach(
        item => {
          if (item.status?.code !== 200 && 'INVALID' in this.emitters) {
            this.topic.emit(this.emitters['INVALID'], item);
          }
          else if (item.payload?.order_state in this.emitters) {
            this.topic.emit(this.emitters[item.payload.order_state], item.payload);
          }
        }
      );

      response.orders = request.items.map(item => response_map[item.id]);
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

  @resolves_subject()
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

  @resolves_subject()
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

  private async getFulfillmentSolution(
    request: FulfillmentRequestList,
    context?: any,
    orders?: OrderMap,
    products?: ProductMap,
  ): Promise<FulfillmentSolutionListResponse> {
    const response_map = request.items?.reduce(
      (a, b) => {
        a[b.order_id] = {
          reference: {
            instance_type: this.instanceType,
            instance_id: b.order_id,
          }
        };
        return a;
      },
      {} as { [key: string]: FulfillmentSolutionResponse }
    ) ?? {};

    orders ??= await this.getOrderMap(
      request.items?.map(item => item.order_id),
      request.subject,
      context
    ) ?? {};

    products ??= await this.getProductMap(
      Object.values(orders).map(item => item.payload),
      request.subject,
      context,
    ) ?? {};

    const items = request.items?.filter(
      item => {
        const response = response_map[item.order_id];
        const order = orders?.[item.order_id];

        if (!order) {
          response.status = this.createStatusCode(
            item.order_id,
            this.entityName,
            this.status_codes.ITEM_NOT_FOUND,
            item.order_id,
          );
          return false;
        }

        if (order.status?.code !== 200) {
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
            products,
            item.product_id,
            item.variant_id,
            item.quantity,
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

        const query: FulfillmentSolutionQuery = {
          reference: {
            instance_type: this.instanceType,
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

    const query = {
      items,
      total_count: items?.length,
      subject: request.subject
    } as FulfillmentSolutionQueryList;
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
    context?: any,
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
    context?: any,
    orders?: OrderMap,
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
    ).then(
      response => {
        if (response.operation_status?.code === 200) {
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

    this.logger.debug('Solutions:', solutions);
    return request.items?.map(
      item => {
        const order = orders[item.order_id!];
        const solution = solutions?.[item.order_id!];
        const status = solution?.status ?? this.createStatusCode(
          item.order_id,
          'Order',
          this.status_codes.SOLUTION_NOT_FOUND,
          item.order_id,
        );

        const fulfillment: FulfillmentResponse = {
          payload:
            status?.code === 200 ?
              {
                shop_id: order.payload.shop_id,
                customer_id: order.payload.customer_id,
                user_id: order.payload.user_id,
                references: [{
                  instance_type: this.instanceType,
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
    context?: any,
    orders?: OrderMap,
  ): Promise<FulfillmentListResponse> {
    try {
      orders ??= await this.getOrderMap(
        request.items?.map(item => item.order_id!),
        request.subject,
        context
      ) ?? {};

      const prototypes = await this.toFulfillmentResponsePrototypes(
        request,
        context,
        orders,
      );

      const invalids = prototypes.filter(
        item => item.status?.code !== 200
      );

      const valids = prototypes.filter(
        item => item.status?.code === 200
      ).map(
        item => {
          item.payload.meta ??= {};
          if (!item.payload.meta.owners?.length) {
            const order = orders[item.status.id];
            item.payload.meta.owners = order.payload?.meta?.owners;
          }
          return item;
        }
      );
      
      const evaluated = valids.length ? await this.fulfillment_service.evaluate(
        {
          items: valids.map(item => item.payload),
          total_count: valids.length,
          subject: this.fulfillment_tech_user ?? this.ApiKey ?? request.subject,
        },
        context
      ).then(
        response => {
          if (response.operation_status?.code !== 200) {
            throw response.operation_status;
          }
          response.items = response.items?.filter(
            item => {
              if (item.status?.code === 200) {
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
          ? this.createOperationStatusCode(
            this.operation_status_codes.PARTIAL,
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
    context?: any,
    orders?: OrderMap,
  ): Promise<FulfillmentListResponse> {
    try {
      const evaluated = await this._evaluateFulfillment(
        request,
        context,
        orders,
      );

      if (evaluated?.operation_status?.code >= 300) {
        throw evaluated.operation_status;
      }

      const invalids = evaluated?.items?.filter(
        item => item.status?.code !== 200
      );

      const valids = evaluated?.items?.filter(
        item => item.status?.code === 200
      ).map(
        item => {
          item.payload.meta ??= {};
          if (!item.payload.meta.owners?.length) {
            const order = orders[item.status.id];
            item.payload.meta.owners = order.payload?.meta?.owners;
          }
          return item;
        }
      );

      const created = valids?.length ? await this.fulfillment_service.create(
        {
          items: valids.map(item => item.payload),
          total_count: valids.length,
          subject: this.fulfillment_tech_user ?? this.ApiKey ?? request.subject,
        },
        context
      ).then(
        response => {
          if (response?.operation_status?.code !== 200) {
            throw response.operation_status;
          }
          response.items = response.items?.filter(
            item => {
              if (item.status?.code === 200) {
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
          ? this.createOperationStatusCode(
            this.operation_status_codes.PARTIAL,
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
    context?: any
  ): Promise<FulfillmentListResponse> {
    const order_map = request?.items?.reduce(
      (a, b) => {
        a[b.id] = { 
          payload: b,
          status: this.createStatusCode(
            b.id,
            'order',
            this.status_codes.OK,
            b.id
          ),
        } as OrderResponse;
        return a;
      },
      {} as OrderMap
    ) ?? {};
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
      order_map
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
    context?: any
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
              if (item.status?.id in responseMap) {
                responseMap[item.status?.id].status = item.status as Status;
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
        const master = order_map[item.sections?.[0]?.order_id];
        if (master?.status?.code !== 200) {
          return {
            payload: undefined,
            status: master?.status ?? this.createStatusCode(
              item.sections?.[0]?.order_id,
              this.entityName,
              this.status_codes.ITEM_NOT_FOUND,
              item.sections?.[0]?.order_id,
            )
          };
        }

        for (const section of item.sections!) {
          const order = order_map[section.order_id!];

          if (order?.status?.code !== 200) {
            return {
              payload: undefined,
              status: order?.status ?? this.createStatusCode(
                section.order_id,
                this.entityName,
                this.status_codes.ITEM_NOT_FOUND,
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
                      selection => fulfillment_map[section?.order_id]?.find(
                        fulfillment => fulfillment.payload?.id === selection?.fulfillment_id
                      )?.payload?.packaging?.parcels?.filter(
                        parcel =>
                          selection?.selected_parcels?.length === 0 ||
                          parcel.id in selection.selected_parcels
                      )
                    ) ?? fulfillment_map[section.order_id]?.flatMap(
                      fulfillment => fulfillment.payload?.packaging?.parcels
                    )
                  ) || []
                ).reduce(
                  (a, b, i) => {
                    const id = `${b?.product_id}___${b?.variant_id}`;
                    const c = a[id];
                    if (c) {
                      c.quantity += 1;
                      c.amount.gross += b?.amount?.gross;
                      c.amount.net += b?.amount?.net;
                      c.amount.vats.push(...(b?.amount?.vats ?? []));
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

  @resolves_subject()
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
          subject: this.invoice_tech_user ?? this.ApiKey ?? request.subject,
        },
        context
      );

      return {
        items: [
          ...response.items!,
          ...invalids
        ],
        total_count: response.items?.length + invalids.length,
        operation_status: invalids.length
          ? this.createOperationStatusCode(
            this.operation_status_codes.PARTIAL,
            'Invoice',
          )
          : response.operation_status,
      };
    }
    catch (e) {
      return this.catchOperationError(e);
    }
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
    context?: any,
  ): Promise<StatusListResponse> {
    throw 'Not yet implemented!';
  };
}
