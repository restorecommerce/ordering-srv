import { Client } from 'nice-grpc';
import {
  createClient,
  createChannel,
  GrpcClientConfig
} from '@restorecommerce/grpc-client';
import {
  ResourcesAPIBase,
  ServiceBase,
} from '@restorecommerce/resource-base-interface';
import { DatabaseProvider } from '@restorecommerce/chassis-srv';
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
  InvoiceRequestList,
  FulfillmentInvoiceMode,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order';
import {
  PhysicalProduct,
  PhysicalVariant,
  Product,
  ProductResponse,
  ProductServiceDefinition,
  VirtualProduct,
  VirtualVariant
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/product';
import {
  TaxServiceDefinition, Tax
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/tax';
import {
  CustomerServiceDefinition, CustomerResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/customer';
import {
  ShopServiceDefinition, ShopResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/shop';
import {
  OrganizationResponse, OrganizationServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/organization';
import {
  ContactPointServiceDefinition, ContactPointResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/contact_point';
import {
  AddressServiceDefinition, AddressResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/address';
import {
  CountryServiceDefinition, CountryResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/country';

import {
  FulfillmentServiceDefinition,
  Item as FulfillmentItem,
  FulfillmentListResponse,
  FulfillmentResponse,
  FulfillmentList,
  Packaging,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment';
import {
  FulfillmentProductServiceDefinition,
  ProductQuery,
  ProductQueryList,
  PackingSolutionListResponse,
  PackingSolutionResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment_product';
import { FilterOp_Operator, Filter_Operation } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/filter';
import { Filter_ValueType, ReadRequest } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/resource_base';
import {
  OperationStatus,
  Status,
  StatusListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/status';
import {
  InvoiceListResponse,
  InvoiceResponse,
  Section,
  Position,
  InvoiceServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/invoice';
import {
  Amount,
  VAT
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/amount';
import { Subject } from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth';
import { COUNTRY_CODES_EU } from './utils';

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
export type RatioedTax = Tax & {
  tax_ratio?: number;
};

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

export class OrderingService extends ServiceBase<OrderListResponse, OrderList> implements OrderServiceImplementation {
  private readonly status_codes: {
    OK: {
      id: string;
      code: 200;
      message: 'OK';
    };
    NOT_FOUND: {
      id: string;
      code: 404;
      message: '{entity} {id} not found!';
    };
    NOT_SUBMITTED: {
      id: string;
      code: 400;
      message: 'order {id} expected to be submitted!';
    };
    NO_PHYSICAL_ITEM: {
      id: string;
      code: 208;
      message: 'order {id} includes no physical item!';
    };
    IN_HOMOGEN_INVOICE: {
      id: string;
      code: 400;
      message: '{entity} {id} must have identical customer_id and shop_id to master {entity}!';
    };
  };

  private readonly operation_status_codes: {
    SUCCESS: {
      code: 200;
      message: 'SUCCESS';
    };
    PARTIAL: {
      code: 400;
      message: 'Patrial executed with errors!';
    };
    LIMIT_EXHAUSTED: {
      code: 500;
      message: 'Query limit 1000 exhausted!';
    };
  };

  private readonly product_service: Client<ProductServiceDefinition>;
  private readonly tax_service: Client<TaxServiceDefinition>;
  private readonly customer_service: Client<CustomerServiceDefinition>;
  private readonly shop_service: Client<ShopServiceDefinition>;
  private readonly organization_service: Client<OrganizationServiceDefinition>;
  private readonly contact_point_service: Client<ContactPointServiceDefinition>;
  private readonly address_service: Client<AddressServiceDefinition>;
  private readonly country_service: Client<CountryServiceDefinition>;
  private readonly fulfillment_service: Client<FulfillmentServiceDefinition>;
  private readonly fulfillment_product_service: Client<FulfillmentProductServiceDefinition>;
  private readonly invoice_service: Client<InvoiceServiceDefinition>;

  private readonly actions: any;
  public readonly instance_type: string;

  get entity_name() {
    return this.name;
  }

  get collection_name() {
    return this.resourceapi.resourceName;
  }

  constructor(
    readonly topic: Topic,
    readonly db: DatabaseProvider,
    private readonly cfg: any,
    readonly logger: any,
  ) {
    super(
      cfg.get('database:main:entities:0') ?? 'order',
      topic,
      logger,
      new ResourcesAPIBase(
        db,
        cfg.get('database:main:collections:0') ?? 'orders',
        cfg.get('fieldHandlers'),
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

    this.instance_type = cfg.get('urns:instanceType');
    this.actions = cfg.get('actions');

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
    if (fulfillment_cfg) {
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
      this.logger.warn('Ordering-srv: fulfillment config is missing!');
    }

    const fulfillment_product_cfg = cfg.get('client:fulfillment_product');
    if (fulfillment_product_cfg) {
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
      this.logger.warn('Ordering-srv: fulfillment_product config is missing!');
    }

    const invoicing_cfg = cfg.get('client:invoice');
    if (cfg.get('client:invoice')) {
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
      this.logger.warn('Ordering-srv: invoie config is missing!');
    }
  }

  private parseStatusCode(
    entity: string,
    id: string,
    status: Status,
    error?: string,
  ): Status {
    return {
      id,
      code: status?.code ?? 500,
      message: status?.message?.replace(
        '{error}', error
      ).replace(
        '{entity}', entity
      ).replace(
        '{id}', id
      ) ?? 'Unknown status',
    };
  }

  private parseOperationStatusCode(
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

  private handleError(e: any) {
    this.logger.error(e);
    console.error(e);
    return {
      items: [],
      total_count: 0,
      operation_status: {
        code: e?.code ?? 500,
        message: e?.message ?? e?.details ?? e?.toString(),
      }
    };
  }

  private getOrdersById(
    ids: string[],
    subject: Subject,
    context?: any
  ): Promise<DeepPartial<OrderListResponse>> {
    const order_ids = [... new Set(ids)];

    if (order_ids.length > 1000) {
      throw this.parseOperationStatusCode(
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
    return this.read(call, context);
  }

  private getOrderMap(
    ids: string[],
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
          return response.items.reduce(
            (a, b) => {
              a[b.payload.id] = b as OrderResponse;
              return a;
            },
            {} as OrderMap
          );
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
      (product) => product.payload.bundle.products.map(
        (item) => item.product_id
      )
    ).filter(
      id => !products[id]
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
            response.items.forEach(
              item => products[item.payload?.id] = item
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
        product_id: main.id,
        variant_id,
        quantity,
        package: variant.package,
      }];
    }
    else if (main.bundle?.pre_packaged) {
      return [{
        product_id: main.id,
        variant_id,
        quantity,
        package: main.bundle.pre_packaged,
      }];
    }
    else {
      return main.bundle?.products.flatMap(
        item => this.flatMapProductToFulfillmentItem(
          products,
          item.product_id,
          item.variant_id,
          item.quantity,
        )
      );
    }
  };

  private async getProductMap(
    orders: Order[],
    subject?: Subject,
    context?: any
  ): Promise<ProductMap> {
    const product_ids = [...new Set<string>(orders.flatMap(
      (o) => o.items.map(
        (item) => item.product_id
      )
    ).filter(
      (id) => !!id
    )).values()];

    if (product_ids.length > 1000) {
      throw this.parseOperationStatusCode(
        'product',
        this.operation_status_codes.LIMIT_EXHAUSTED,
      );
    }

    const product_id_json = JSON.stringify(product_ids);
    const products = await this.product_service.read(
      {
        filters: [{
          filters: [
            {
              field: 'product.id',
              operation: Filter_Operation.in,
              value: product_id_json,
              type: Filter_ValueType.ARRAY,
            }, {
              field: 'bundle.id',
              operation: Filter_Operation.in,
              value: product_id_json,
              type: Filter_ValueType.ARRAY,
            }
          ],
          operator: FilterOp_Operator.or
        }],
        limit: product_ids.length,
        subject,
      },
      context
    ).then(
      (response) => {
        if (response.operation_status?.code === 200) {
          return response.items.reduce(
            (a, b) => {
              a[b.payload?.id] = b;
              return a;
            }, {} as ProductMap
          );
        }
        else {
          throw response.operation_status;
        }
      }
    );

    await this.mapBundles(products);
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
      return product.payload?.product.tax_ids ??
        product.payload?.bundle?.products.flatMap(
          (p) => getTaxIdsRecursive(products[p.product_id])
        );
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
        if (response.operation_status?.code === 200) {
          return response.items?.reduce(
            (a, b) => {
              a[b.payload?.id] = b.payload;
              return a;
            },
            {} as RatioedTaxMap
          );
        }
        else {
          throw response.operation_status;
        }
      }
    );
  }

  private async getFulfillmentMap(
    order_ids: string[],
    subject?: Subject,
    context?: any,
  ): Promise<FulfillmentMap> {
    if (!!this.fulfillment_service) return {};
    order_ids = [...new Set<string>(order_ids)];

    if (order_ids.length > 1000) {
      throw this.parseOperationStatusCode(
        'fulfillment',
        this.operation_status_codes.LIMIT_EXHAUSTED,
      );
    }

    return await this.fulfillment_service.read(
      {
        filters: [{
          filters: [
            {
              field: 'reference.instance_type',
              operation: Filter_Operation.eq,
              value: this.instance_type,
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
              if (b.payload?.id in a) {
                a[b.payload?.id].push(b);
              }
              else {
                a[b.payload?.id] = [b];
              }
              return a;
            }, {} as FulfillmentMap
          );
        }
        else {
          throw response.operation_status;
        }
      }
    );
  }

  private get<T>(
    ids: string[],
    service: CRUDClient,
    subject?: Subject,
    context?: any,
  ): Promise<T> {
    ids = [...new Set<string>(ids)];
    const entity = typeof ({} as T);

    if (ids.length > 1000) {
      throw this.parseOperationStatusCode(
        entity,
        this.operation_status_codes.LIMIT_EXHAUSTED,
      );
    }

    return service.read(
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
      response => {
        if (response.operation_status?.code === 200) {
          return response.items?.reduce(
            (a, b) => {
              a[b.payload?.id] = b;
              return a;
            }, {} as T
          );
        }
        else {
          throw response.operation_status;
        }
      }
    );
  }

  private async aggregateOrders(order_list: OrderList, subject?: Subject, context?: any): Promise<DeepPartial<OrderListResponse>> {
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
      order_list.items.map(item => item.customer_id),
      this.customer_service,
      subject,
      context,
    );
    const shop_map = await this.get<ShopMap>(
      order_list.items.map(item => item.shop_id),
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

    const getTaxesRecursive = (
      main: Product,
      price_ratio = 1.0
    ): RatioedTax[] => {
      return [].concat(
        main?.product?.tax_ids.map(id => ({
          ...tax_map[id],
          tax_ratio: price_ratio
        })),
        main?.bundle?.products.flatMap(
          p => getTaxesRecursive(product_map[p.product_id]?.payload, p.price_ratio * price_ratio)
        )
      );
    };

    const mergeProductVariantRecursive = (
      nature: ProductNature,
      variant_id: string,
    ): ProductVariant => {
      const variant = nature.variants.find(v => v.id === variant_id);
      if (variant?.template_variant) {
        const template = mergeProductVariantRecursive(
          nature, variant.template_variant
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

    const items = order_list.items.map((order) => {
      try {
        const shop = shop_map[order.shop_id]?.payload;
        const orga = organization_map[shop.organization_id]?.payload;
        const contact_point = orga.contact_point_ids.map(
          id => contact_point_map[id]?.payload
        ).find(
          contact_point => contact_point.contact_point_type_ids.some(
            id => id === this.cfg.get('ids:legal_address_type')
          )
        );
        const address = address_map[contact_point.physical_address_id]?.payload;
        const country = country_map[address.country_id]?.payload;
        order.items.forEach(
          (item) => {
            const product = product_map[item.product_id]?.payload;
            const nature = (product.product?.physical ?? product.product?.virtual) as ProductNature;
            const variant = mergeProductVariantRecursive(nature, item.variant_id);
            const taxes = getTaxesRecursive(product).filter(t => !!t);
            const unit_price = product.bundle ? product.bundle?.price : variant?.price;
            const gross = (unit_price.sale ? unit_price.sale_price : unit_price.regular_price) * item.quantity;
            const vats = taxes.filter(
              t => (
                t.country_id === country.id &&
                !!customer_map[order.customer_id]?.payload.private?.user_id &&
                country.country_code in COUNTRY_CODES_EU &&
                country_map[order.shipping_address.address.country_id]?.payload.country_code in COUNTRY_CODES_EU
              )
            ).map(
              t => ({
                tax_id: t.id,
                vat: gross * t.rate * t.tax_ratio
              }) as VAT
            );
            const net = vats.reduce((a, b) => b.vat + a, 0);
            item.unit_price = unit_price;
            item.amount = {
              gross,
              net,
              vats,
            };
          }
        );

        order.total_amounts = Object.values(order.items.reduce(
          (amounts, item) => {
            const amount = amounts[item.amount.currency_id];
            if (amount) {
              amount.gross += item.amount.gross;
              amount.net += item.amount.net;
              amount.vats.push(...item.amount.vats);
            }
            else {
              amounts[item.amount.currency_id] = { ...item.amount };
            }
            return amounts;
          },
          {} as { [key: string]: Amount }
        ));

        order.total_amounts.forEach(
          amount => {
            amount.vats = Object.values(
              amount.vats.reduce(
                (vats, vat) => {
                  if (vat.tax_id in vats) {
                    vats[vat.tax_id].vat = (vats[vat.tax_id]?.vat ?? 0) + vat.vat;
                  }
                  else {
                    vats[vat.tax_id] = { ...vat };
                  }
                  return vats;
                },
                {} as { [key: string]: VAT }
              )
            );
          }
        );

        return {
          payload: order,
          status: this.parseStatusCode(
            this.name,
            order?.id,
            this.status_codes.OK
          ),
        } as OrderResponse;
      }
      catch (e) {
        return {
          payload: order,
          status: {
            id: order?.id,
            code: e?.code ?? 500,
            message: e?.message ?? e?.details ?? e?.toString() ?? e
          }
        } as OrderResponse;
      }
    }) as OrderResponse[];

    const status = items.reduce(
      (a, b) => a.status?.code > b.status?.code ? a : b
    )?.status;

    return {
      items,
      total_count: items.length,
      operation_status: {
        code: status.code,
        message: status.message,
      },
    } as OrderListResponse;
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
        item => item.status.code === 200
      ).map(
        item => {
          item.payload.order_state = state;
          return item.payload;
        }
      );

      const response = await this.update(
        {
          items,
          total_count: items.length,
          subject
        },
        context
      );

      if (response.operation_status.code === 200) {
        response.items?.forEach(
          item => {
            responseMap[item.payload?.id ?? item.status?.id] = item as OrderResponse;
            if (item.status?.code === 200 && item.payload.order_state in this.actions) {
              this.topic.emit(this.actions[item.payload.order_state], item);
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
      return this.handleError(e);
    }
  }

  public async evaluate(
    request: OrderList,
    context?: any
  ): Promise<DeepPartial<OrderListResponse>> {
    try {
      return await this.aggregateOrders(
        request,
        request.subject,
        context
      );
    }
    catch (e) {
      return this.handleError(e);
    }
  }

  public async submit(
    request: OrderList,
    context?: any
  ): Promise<DeepPartial<OrderListResponse>> {
    try {
      const responseMap = request.items.reduce(
        (a, b) => {
          a[b.id] = {};
          return a;
        },
        {} as { [key: string]: OrderResponse }
      );

      const items = await this.evaluate(
        request,
        context,
      ).then(
        response => {
          if (response.operation_status.code === 200) {
            return response.items.filter(
              item => {
                if (item.status?.id in responseMap) {
                  responseMap[item.status.id].status = item.status as Status;
                }
                return item.status?.code === 200;
              }
            ).map(
              item => {
                item.payload.order_state = OrderState.SUBMITTED;
                return item.payload as Order;
              }
            );
          }
          else {
            throw response.operation_status;
          }
        }
      );

      const orders = await this.upsert(
        {
          items,
          total_count: items.length,
          subject: request.subject,
        },
        context,
      ) as OrderListResponse;

      orders.items.forEach(
        item => {
          responseMap[item.payload?.id ?? item.status?.id] = item;
          if (item.status?.code === 200 &&
            item.payload?.order_state === OrderState.SUBMITTED &&
            this.actions[OrderState.SUBMITTED]
          ) {
            this.topic.emit(this.actions[OrderState.SUBMITTED], item);
          }
        }
      );

      return {
        items: Object.values(responseMap),
        total_count: request.total_count,
        operation_status: orders.operation_status,
      } as OrderListResponse;
    }
    catch (e) {
      return this.handleError(e);
    }
  }

  public async withdraw(
    request: OrderIdList,
    context?: any
  ): Promise<DeepPartial<OrderListResponse>> {
    return await this.updateState(
      request.ids,
      OrderState.WITHDRAWN,
      request.subject,
      context,
    );
  }

  public async cancel(
    request: OrderIdList,
    context?: any
  ): Promise<DeepPartial<OrderListResponse>> {
    return await this.updateState(
      request.ids,
      OrderState.CANCELLED,
      request.subject,
      context,
    );
  }

  private async getPackingSolution(
    request: FulfillmentRequestList,
    context?: any,
    orders?: OrderMap,
    products?: ProductMap,
  ): Promise<PackingSolutionListResponse> {
    const responseMap = request.items.reduce(
      (a, b) => {
        a[b.order_id] = {
          reference: {
            instance_type: this.instance_type,
            instance_id: b.order_id,
          },
          solutions: null,
          status: null,
        };
        return a;
      },
      {} as { [key: string]: PackingSolutionResponse }
    );

    orders = orders ?? await this.getOrderMap(
      request.items.map(item => item.order_id),
      request.subject,
      context
    );

    products = products ?? await this.getProductMap(
      Object.values(orders).map(item => item.payload),
      request.subject,
      context,
    );

    const items = request.items.filter(
      item => {
        const response = responseMap[item.order_id];
        const order = orders[item.order_id];

        if (!order) {
          response.status = {
            id: item.order_id,
            code: 404,
            message: `${this.name} ${item.order_id} not found!`
          } as Status;
          return false;
        }

        if (order.status.code !== 200) {
          response.status = order.status;
          return false;
        }

        return true;
      }
    ).map(
      item => {
        const response = responseMap[item.order_id];
        const order = orders[item.order_id];
        const items = order.payload.items.flatMap(
          item => this.flatMapProductToFulfillmentItem(
            products,
            item.product_id,
            item.variant_id,
            item.quantity
          )
        );

        if (items.length === 0) {
          response.status = {
            id: item.order_id,
            code: 208,
            message: `Skip ${this.name} ${item.order_id} containing no physical item!`,
          } as Status;
        }

        return {
          sender: item.sender_address,
          receiver: order.payload.shipping_address,
          items,
          preferences: order.payload.packaging_preferences,
          order_id: order.payload.id,
        } as ProductQuery;
      }
    ).filter(
      item => item.items.length > 0
    );

    const query = {
      items,
      total_count: items.length,
      subject: request.subject
    } as ProductQueryList;
    const solutions = await this.fulfillment_product_service.find(
      query,
      context
    );

    solutions.items.forEach(
      item => {
        responseMap[item.reference.instance_id ?? item.status.id] = item;
      }
    );

    return {
      items: Object.values(responseMap),
      total_count: request.total_count,
      operation_status: solutions.operation_status,
    };
  }

  public async queryPackingSolution(
    request: FulfillmentRequestList,
    context?: any,
  ): Promise<DeepPartial<PackingSolutionListResponse>> {
    try {
      return await this.getPackingSolution(request, context);
    }
    catch (e) {
      return this.handleError(e);
    }
  }

  private async toFulfillmentResponsePrototypes(
    request: FulfillmentRequestList,
    context?: any,
  ): Promise<DeepPartial<FulfillmentResponse[]>> {
    const orders = await this.getOrderMap(
      request.items.map(
        item => item.order_id
      ),
      request.subject,
      context
    );

    Object.values(orders).forEach(
      order => {
        if (order.payload.order_state !== OrderState.SUBMITTED) {
          order.status = {
            id: order.payload.id,
            code: 400,
            message: `${this.name} state ${order.payload.order_state} expected to be ${OrderState.SUBMITTED}`,
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
        if (response.operation_status.code === 200) {
          return response.items.reduce(
            (a, b) => {
              a[b.reference?.instance_id ?? b.status.id] = b;
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

    return request.items.map(
      item => {
        const order = orders[item.order_id];
        const solution = solutions[item.order_id];
        const status = [
          solution?.status,
          order?.status,
        ].find(status => status?.code === 200) ?? {
          id: item.order_id,
          code: 404,
          message: `Order ${item.order_id} not found!`,
        } as Status;

        return {
          payload:
            status?.code === 200 ?
              {
                packaging: {
                  reference: {
                    instance_type: this.instance_type,
                    instance_id: item.order_id,
                  },
                  parcels: solution.solutions[0].parcels,
                  notify: order.payload.notification_email,
                  export_type: item.export_type,
                  export_description: item.export_description,
                  invoice_number: item.invoice_number,
                  sender: item.sender_address,
                  recipient: order.payload.shipping_address,
                } as Packaging,
                total_amounts: solution.solutions[0].amounts,
              } : null,
          status,
        } as FulfillmentResponse;
      }
    );
  }

  public async createFulfillment(
    request: FulfillmentRequestList,
    context?: any
  ): Promise<DeepPartial<FulfillmentListResponse>> {
    try {
      const prototypes = await this.toFulfillmentResponsePrototypes(
        request,
        context
      );
      const invalids = prototypes.filter(
        proto => proto.status?.code !== 200
      );
      const valids = prototypes.filter(
        proto => proto.status?.code === 200
      ).map(
        proto => proto.payload
      );

      const response = await this.fulfillment_service.create(
        {
          items: valids,
          total_count: valids.length,
          subject: request.subject,
        },
        context
      );

      return {
        items: [
          ...response.items,
          ...invalids
        ],
        total_count: response.items.length + invalids.length,
        operation_status: invalids.length ? {
          code: 400,
          message: 'Partial executed with errors!',
        } : response.operation_status,
      };
    }
    catch (e) {
      return this.handleError(e);
    }
  }

  public async triggerFulfillment(
    request: FulfillmentRequestList,
    context?: any
  ): Promise<DeepPartial<FulfillmentListResponse>> {
    try {
      const responseMap = request.items.reduce(
        (a, b) => {
          a[b.order_id] = {};
          return a;
        },
        {} as { [key: string]: FulfillmentResponse }
      );

      const items = await this.toFulfillmentResponsePrototypes(
        request,
        context
      ).then(
        prototypes => {
          return prototypes.filter(
            item => {
              if (item.status?.id in responseMap) {
                responseMap[item.status.id].status = item.status as Status;
              }
              return item.status.code === 200;
            }
          ).map(
            item => item.payload
          );
        }
      );

      const fulfillmentList = {
        items,
        total_count: items.length,
        subject: request.subject
      } as FulfillmentList;

      this.logger.debug('Emit Fulfillment request', fulfillmentList);
      await this.topic.emit(this.actions['CREATE_FULFILLMENT'] ?? CREATE_FULFILLMENT, fulfillmentList);
      this.logger.info('Fulfillment request emitted successfully', fulfillmentList);

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
      return this.handleError(e);
    }
  }

  private async toInvoiceResponsePrototypes(
    request: InvoiceRequestList,
    context?: any,
  ): Promise<DeepPartial<InvoiceResponse[]>> {
    const order_map = await this.getOrderMap(
      request.items.flatMap(
        item => item.sections.map(
          section => section.order_id
        )
      ),
      request.subject,
      context,
    );

    const fulfillment_map = await this.getFulfillmentMap(
      request.items.flatMap(
        item => item.sections.map(
          section => section.order_id
        )
      ),
      request.subject,
      context,
    );

    return request.items.map(
      item => {
        const master = order_map[item.sections[0]?.order_id];
        if (master?.status?.code !== 200) {
          return {
            payload: null,
            status: {
              id: item.sections[0]?.order_id,
              code: 404,
              message: 'Order not found!',
              ...master?.status,
            }
          };
        }

        for (let section of item.sections) {
          const order = order_map[section.order_id];

          if (order?.status?.code !== 200) {
            return {
              payload: null,
              status: {
                id: section.order_id,
                code: 404,
                message: 'Order not found!',
                ...order?.status,
              }
            };
          }
          else if (
            order.payload?.customer_id !== master?.payload?.customer_id ||
            order.payload?.shop_id !== master?.payload?.shop_id
          ) {
            return {
              payload: null,
              status: this.parseStatusCode(
                this.name,
                order.payload?.id,
                this.status_codes.IN_HOMOGEN_INVOICE
              ),
            };
          }
        }

        return {
          payload: {
            invoice_number: item.invoice_number,
            user_id: master.payload.user_id,
            customer_id: master.payload.customer_id,
            shop_id: master.payload.shop_id,
            references: item.sections.map(
              section => ({
                instance_type: this.instance_type,
                instance_id: section.order_id,
              })
            ),
            customer_remark: master.payload.customer_remark,
            sender: master.payload.billing_address,
            recipient: master.payload.billing_address,
            total_amounts: master.payload.total_amounts,
            sections: item.sections.map(
              section => {
                const order = order_map[section.order_id];
                const product_items = (
                  section.selected_items?.length > 0
                    ? order.payload.items.filter(
                      item => item.id in section.selected_items
                    )
                    : order.payload.items
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

                const fulfillment_items = Object.values((
                  section.fulfillment_mode === FulfillmentInvoiceMode.INCLUDE && (
                    section.selected_fulfillments?.flatMap(
                      selection => fulfillment_map[section.order_id].find(
                        fulfillment => fulfillment.payload.id === selection.fulfillment_id
                      ).payload.packaging.parcels.filter(
                        parcel =>
                          selection.selected_parcels.length === 0 ||
                          parcel.id in selection.selected_parcels
                      )
                    ) ?? fulfillment_map[section.order_id]?.flatMap(
                      fulfillment => fulfillment.payload.packaging.parcels
                    )
                  ) || []
                ).reduce(
                  (a, b, i) => {
                    const id = `${b.product_id}___${b.variant_id}`;
                    const c = a[id];
                    if (c) {
                      c.quantity += 1;
                      c.amount.gross += b.amount.gross;
                      c.amount.net += b.amount.net;
                      c.amount.vats.push(...b.amount.vats);
                    }
                    else {
                      a[id] = {
                        id: (i + product_items.length + 1).toString().padStart(3, '0'),
                        unit_price: b.price,
                        quantity: 1,
                        amount: b.amount,
                        fulfillment_item: {
                          product_id: b.product_id,
                          variant_id: b.variant_id,
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
                    item.amount.vats = Object.values(
                      item.amount.vats.reduce(
                        (a, b) => {
                          const c = a[b.tax_id];
                          if (c) {
                            c.vat += b.vat;
                          }
                          else {
                            a[b.tax_id] = { ...b };
                          }
                          return a;
                        },
                        {} as VATMap
                      )
                    );
                  }
                );

                return {
                  id: section.order_id,
                  amounts: order.payload.total_amounts,
                  customer_remark: order.payload.customer_remark,
                  positions: [
                    ...product_items,
                    ...fulfillment_items,
                  ],
                } as Section;
              }
            )
          },
          status: this.parseStatusCode(
            'invoice',
            master.payload.id,
            this.status_codes.OK,
          ),
        };
      }
    );
  }

  public async createInvoice(
    request: InvoiceRequestList,
    context?: any,
  ): Promise<DeepPartial<InvoiceListResponse>> {
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
        proto => proto.payload
      );

      const response = await this.invoice_service.render(
        {
          items: valids,
          total_count: valids.length,
          subject: request.subject,
        },
        context
      );

      return {
        items: [
          ...response.items,
          ...invalids
        ],
        total_count: response.items.length + invalids.length,
        operation_status: invalids.length
          ? this.parseOperationStatusCode(
            'invoice',
            this.operation_status_codes.PARTIAL,
          )
          : response.operation_status,
      };
    }
    catch (e) {
      return this.handleError(e);
    }
  };

  public async triggerInvoice(
    request: InvoiceRequestList,
    context?: any,
  ): Promise<DeepPartial<StatusListResponse>> {
    return null;
  };
}
