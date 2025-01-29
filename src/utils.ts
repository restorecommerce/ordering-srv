import { BigNumber } from 'bignumber.js';
import {
  Client,
} from '@restorecommerce/grpc-client';
import {
  Item as OrderItem,
  Order,
  OrderList,
  OrderResponse,
  OrderListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order.js';
import {
  Product,
  Bundle,
  IndividualProduct,
  PhysicalProduct,
  PhysicalVariant,
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
  CurrencyServiceDefinition, CurrencyResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/currency.js';
import {
  AddressServiceDefinition, AddressResponse,
  BillingAddress,
  ShippingAddress
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/address.js';
import {
  CountryServiceDefinition, CountryResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/country.js';
import {
  Setting, SettingResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/setting.js';
import {
  FulfillmentServiceDefinition,
  FulfillmentResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment.js';
import {
  FulfillmentProductServiceDefinition,
  FulfillmentSolutionResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment_product.js';
import {
  Resource,
  ResourceResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/resource_base.js';
import {
  OperationStatus,
  Status,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/status.js';
import {
  Position,
  InvoiceServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/invoice.js';
import {
  VAT
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/amount.js';
import {
  Shop,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/shop.js';
import {
  Customer,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/customer.js';
import {
  Organization,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/organization.js';
import {
  ContactPoint,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/contact_point.js';
import {
  Address,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/address.js';
import {
  Country,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/country.js';
import {
  Currency,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/currency.js';
import {
  User,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/user.js';
import {
  Manufacturer,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/manufacturer.js';
import {
  ProductCategory,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/product_category.js';
import {
  ProductPrototype,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/product_prototype.js';
import {
  TaxType,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/tax_type.js';
import {
  FulfillmentProduct,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/fulfillment_product.js';
import {
  Locale,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/locale.js';
import {
  Timezone,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/timezone.js';
import {
  Template,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/template.js';
import {
  Payload_Strategy
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/rendering.js';
import {
  Any
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/google/protobuf/any.js';
import {
  type Aggregation,
  resolve,
  Resolver,
  ArrayResolver,
  ResourceMap,
} from './experimental/index.js';

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

export type Entity = Resource & ResourceResponse;
export type ObjectMap<T extends Entity> = Record<string, T>;
export type OrderMap = ObjectMap<OrderResponse>;
export type PositionMap = Record<string, Position>;
export type VATMap = Record<string, VAT>;
export type StatusMap = Record<string, Status>;
export type OperationStatusMap = Record<string, OperationStatus>;
export type FulfillmentMap = Record<string, FulfillmentResponse[]>;
export type FulfillmentSolutionMap = Record<string, FulfillmentSolutionResponse>;
export type ProductNature = PhysicalProduct & VirtualProduct & ServiceProduct;
export type ProductVariant = PhysicalVariant & VirtualVariant & ServiceVariant;

export type PositionProduct = ProductVariant & Bundle;
export type AggregatedItem = OrderItem & {
  product: PositionProduct;
};

export type AggregationTemplate = {
  shops?: ResourceMap<Shop>;
  customers?: ResourceMap<Customer>;
  organizations?: ResourceMap<Organization>;
  contact_points?: ResourceMap<ContactPoint>;
  addresses?: ResourceMap<Address>;
  countries?: ResourceMap<Country>;
  users?: ResourceMap<User>;
  products?: ResourceMap<Product>;
  taxes?: ResourceMap<Tax>;
  tax_types?: ResourceMap<TaxType>;
  manufacturers?: ResourceMap<Manufacturer>;
  categories?: ResourceMap<ProductCategory>;
  prototypes?: ResourceMap<ProductPrototype>;
  fulfillments_products?: ResourceMap<FulfillmentProduct>;
  locales?: ResourceMap<Locale>;
  timezones?: ResourceMap<Timezone>;
  currencies?: ResourceMap<Currency>;
  templates?: ResourceMap<Template>;
  settings?: ResourceMap<Setting>;
};

export type AggregatedOrderListResponse = Aggregation<OrderListResponse, AggregationTemplate>;

export const toObjectMap = <T extends Entity>(items: T[]): ObjectMap<T> => items.reduce(
  (a, b) => {
    a[b.id ?? b.payload?.id] = b;
    return a;
  },
  {} as ObjectMap<T>
) ?? {};

export const toObjectListMap = <T extends Entity>(items: T[]): Record<string, T[]> => items.reduce(
  (a, b) => {
    if ((b.id ?? b.payload?.id) in a) {
      a[b.id ?? b.payload?.id].push(b);
    }
    else {
      a[b.id ?? b.payload?.id] = [b];
    }
    return a;
  },
  {} as Record<string, T[]>
) ?? {};

export const DefaultUrns = {
  instanceType: 'urn:restorecommerce:acs:model:order:Order',
  ownerIndicatoryEntity: 'urn:restorecommerce:acs:names:ownerIndicatoryEntity',
  ownerInstance: 'urn:restorecommerce:acs:names:ownerInstance',
  organization: 'urn:restorecommerce:acs:model:organization.Organization',
  user: 'urn:restorecommerce:acs:model:user.User',

  shop_order_send_confirm_enabled:  'urn:restorecommerce:shop:setting:order:submit:notification:enabled',       // Sends notification on order submit if enabled (default: true)
  shop_order_send_cancel_enabled:   'urn:restorecommerce:shop:setting:order:cancel:notification:enabled',       // Sends notification on order cancel if enabled (default: true)
  shop_order_send_withdrawn_enabled:'urn:restorecommerce:shop:setting:order:withdrawn:notification:enabled', // Sends notification on order withdrawn if enabled (default: true)

  shop_fulfillment_evaluate_enabled:'urn:restorecommerce:shop:setting:order:submit:fulfillment:evaluate:enabled',
  shop_fulfillment_create_enabled:  'urn:restorecommerce:shop:setting:order:submit:fulfillment:create:enabled', // Creates fulfillment on order submit if enabled (default: true)
  shop_invoice_create_enabled:      'urn:restorecommerce:shop:setting:order:submit:invoice:create:enabled',     // Creates invoice on order submit if enabled (default: true)
  shop_invoice_render_enabled:      'urn:restorecommerce:shop:setting:order:submit:invoice:render:enabled',     // Renders invoice on order submit if enabled, overrides create! (default: true)
  shop_invoice_send_enabled:        'urn:restorecommerce:shop:setting:order:submit:invoice:send:enabled',       // Sends invoice on order submit if enabled, overrides render! (default: true)
  shop_order_error_cleanup_enabled: 'urn:restorecommerce:shop:setting:order:error:cleanup:enabled',             // Clean up orders on any error of fulfillment or invoice (default: false)
  shop_email_render_options:        'urn:restorecommerce:shop:setting:order:email:render:options',              // [json]: override email rendering options - default: cfg -> null
  shop_email_render_strategy:       'urn:restorecommerce:shop:setting:order:email:render:strategy',             // [enum]: override email rendering strategy - default: cfg -> INLINE
  shop_email_provider:              'urn:restorecommerce:shop:setting:order:email:provider',                    // [string]: override to supported email provider - default: cfg -> null
  shop_email_cc:                    'urn:restorecommerce:shop:setting:order:email:cc',                          // [string]: add recipients in CC (comma separated) - default: cfg -> null
  shop_email_bcc:                   'urn:restorecommerce:shop:setting:order:email:bcc',                         // [string]: add recipients in BC (comma separated) - default: cfg -> null
  customer_locales:                 'urn:restorecommerce:customer:setting:locales',                             // [string]: list of locales in descending preference (comma separated) - default: cfg -> 'en'
  customer_email_cc:                'urn:restorecommerce:customer:setting:order:email:cc',                      // [string]: add recipients in CC (comma separated) - default: cfg -> null
  customer_email_bcc:               'urn:restorecommerce:customer:setting:order:email:bcc',                     // [string]: add recipients in BC (comma separated) - default: cfg -> null
};
export type KnownUrns = typeof DefaultUrns;

export const DefaultSetting = {
  shop_order_send_confirm_enabled: true,
  shop_order_send_cancel_enabled: true,
  shop_order_send_withdrawn_enabled: true,
  shop_fulfillment_evaluate_enabled: true,
  shop_fulfillment_create_enabled: true,
  shop_fulfillment_trigger_enabled: false,
  shop_invoice_create_enabled: true,
  shop_invoice_render_enabled: true,
  shop_invoice_send_enabled: false,
  shop_invoice_trigger_enabled: false,
  shop_order_error_cleanup_enabled: true,
  shop_email_render_options: undefined as any,
  shop_email_render_strategy: Payload_Strategy.INLINE,
  shop_email_provider: undefined as string,
  shop_email_cc: undefined as string[],
  shop_email_bcc: undefined as string[],
  shop_locales: ['en'] as string[],
  customer_locales: ['en'] as string[],
  customer_email_cc: undefined as string[],
  customer_email_bcc: undefined as string[],
};
export type ResolvedSetting = typeof DefaultSetting;
export type ResolvedSettingMap = Map<string, ResolvedSetting>;

const parseList = (value: string) => value?.match(/^\[.*\]$/) ? JSON.parse(value) : value?.split(/\s*,\s*/)
const parseTrue = (value: string) => value?.toString().toLowerCase() === 'true';
const SettingParser: { [key: string]: (value: string) => any } = {
  shop_order_send_confirm_enabled: parseTrue,
  shop_order_send_cancel_enabled: parseTrue,
  shop_order_send_withdrawn_enabled: parseTrue,
  shop_fulfillment_evaluate_enabled: parseTrue,
  shop_fulfillment_create_enabled: parseTrue,
  shop_invoice_create_enabled: parseTrue,
  shop_invoice_render_enabled: parseTrue,
  shop_invoice_send_enabled: parseTrue,
  shop_order_error_cleanup: parseTrue,
  shop_email_render_options: JSON.parse,
  shop_locales: parseList,
  shop_email_cc: parseList,
  shop_email_bcc: parseList,
  customer_locales: parseList,
  customer_email_cc: parseList,
  customer_email_bcc: parseList,
};

export const parseSetting = (key: string, value: string) => {
  const parser = SettingParser[key];
  if (parser) {
    return parser(value);
  }
  else {
    return value;
  }
}

const mergeProductVariantRecursive = (
  nature: ProductNature,
  variant_id: string
): ProductVariant => {
  const variant = nature?.templates?.find(
    v => v.id === variant_id
  ) ?? nature?.variants?.find(
    v => v.id === variant_id
  );
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

const mergeProductVariant = (
  product: IndividualProduct,
  variant_id: string
): IndividualProduct => {
  const key = Object.keys(product).find(
    key => ['physical', 'virtual', 'service'].includes(key)
  ) as 'physical' | 'virtual' | 'service';
  const nature = product[key];
  const variant = mergeProductVariantRecursive(nature, variant_id);
  return {
    ...product,
    [key]: {
      variants: [variant]
    }
  }
};

export const resolveCustomerAddress = (
  order: Order,
  aggregation: AggregatedOrderListResponse,
  contact_point_type_id: string,
): BillingAddress | ShippingAddress => {
  const customer = aggregation.customers?.get(
    order.customer_id
  );
  const contact_point = aggregation.contact_points?.getMany(
    [].concat(
      aggregation.organizations?.get(
        customer?.commercial?.organization_id
        ?? customer?.public_sector?.organization_id
      )?.contact_point_ids,
      customer?.private?.contact_point_ids
    ).filter(c => c)
  )?.find(
    cp => cp.contact_point_type_ids?.includes(contact_point_type_id)
  );
  const address = aggregation.addresses?.get(
    contact_point?.physical_address_id
  );
  return {
    address,
    contact: {
      email: contact_point.email,
      name: contact_point.name,
      phone: contact_point.telephone,
    }
  };
}

export const resolveOrder = (
  aggregation: AggregatedOrderListResponse,
  order: Order,
) => {
  const country_resolver = Resolver('country_id', aggregation.countries);
  const currency_resolver = Resolver(
    'currency_id',
    aggregation.currencies,
    {
      countries: ArrayResolver('country_ids', aggregation.countries),
    }
  );
  const address_resolver = Resolver(
    'address_id',
    aggregation.addresses,
    {
      country: country_resolver,
    }
  );
  const contact_points_resolver = ArrayResolver(
    'contact_point_ids',
    aggregation.contact_points,
    {
      physical_address: Resolver(
        'physical_address_id',
        aggregation.addresses,
        {
          country: country_resolver,
        }
      ),
      locale: Resolver('locale_id', aggregation.locales),
      timezone: Resolver('timezone_id', aggregation.timezones),
    }
  );
  const organization_resolver = Resolver(
    'organization_id',
    aggregation.organizations,
    {
      contact_points: contact_points_resolver
    }
  );
  const user_resolver = Resolver('user_id', aggregation.users, {
    locale: Resolver('locale_id', aggregation.locales),
    timezone: Resolver('timezone_id', aggregation.timezones),
  });
  const product_variant_resolver =[{
    price: {
      currency: currency_resolver,
    }
  }]
  const product_nature_resolver = {
    variants: product_variant_resolver,
    templates: product_variant_resolver,
  };
  const individual_product_resolver = {
    category: Resolver('category_id', aggregation.categories),
    manufacturer: Resolver('manufacturer_id', aggregation.manufacturers),
    origin_country: Resolver('origin_country_id', aggregation.countries),
    prototype: Resolver('prototype_id', aggregation.prototypes),
    physical: product_nature_resolver,
    virtual: product_nature_resolver,
    service: product_nature_resolver,
  };
  const product_resolver = Resolver(
    'product_id',
    aggregation.products,
    {
      product: individual_product_resolver,
      bundle: {
        products: [{
          product: Resolver(
            'product_id',
            aggregation.products,
            individual_product_resolver
          )
        }]
      }
    }
  );
  const tax_resolver = Resolver('tax_id', aggregation.taxes, {
    type: Resolver('type_id', aggregation.tax_types),
    country: country_resolver,
  });
  const amount_resolver = {
    currency: currency_resolver,
    vats: [{
      tax: tax_resolver
    }]
  };
  const item_resolver = [{
    product: product_resolver,
    amount: amount_resolver,
    unit_price: {
      currency: currency_resolver,
    }
  }];

  const resolved = resolve(
    order,
    {
      customer: Resolver('customer_id', aggregation.customers, {
        commercial: {
          organization: organization_resolver,
        },
        public_sector: {
          organization: organization_resolver,
        },
        private: {
          contact_points: contact_points_resolver,
          user: user_resolver,
        },
      }),
      shop: Resolver('shop_id', aggregation.shops, {
        organization: organization_resolver
      }),
      user: user_resolver,
      items: item_resolver,
      billing_address: {
        address: address_resolver
      },
      shipping_address: {
        address: address_resolver
      },
    }
  );

  resolved.items?.forEach(
    (item) => {
      if (item?.product?.product) {
        item.product = {
          ...item.product,
          product: mergeProductVariant(
            item.product.product,
            item.variant_id
          ),
        };
        const product = item.product.product;
        const nature = product.physical ?? product.virtual ?? product.service
        item.unit_price = nature.variants?.[0]?.price;
      }
    }
  );
  return resolved;
};

export const marshallProtobufAny = (
  obj: any,
  type_url?: string
): Any => ({
  type_url,
  value: Buffer.from(
    JSON.stringify(
      obj
    )
  )
});

export const unmarshallProtobufAny = (payload: Any): any => JSON.parse(
  payload.value!.toString()
);

export const packRenderData = (
  aggregation: AggregatedOrderListResponse,
  invoice: Order,
) => {
  const resolved = {
    invoice: resolveOrder(
      aggregation,
      invoice
    ),
  };
  const buffer = marshallProtobufAny(resolved);
  return buffer;
};

export const createStatusCode = (
  id?: string,
  entity?: string,
  status?: Status,
  entity_id?: string,
  error?: string,
): Status => ({
  id,
  code: Number.isInteger(status?.code) ? status.code : 500,
  message: status?.message?.replace(
    '{error}', error ?? 'undefined'
  ).replace(
    '{entity}', entity ?? 'undefined'
  ).replace(
    '{id}', entity_id ?? 'undefined'
  ) ?? 'Unknown status',
});

export const throwStatusCode = <T = Status>(
  id?: string,
  entity?: string,
  status?: Status,
  entity_id?: string,
  error?: string,
): T => {
  throw createStatusCode(
    id,
    entity,
    status,
    entity_id,
    error,
  );
};

export const createOperationStatusCode = (
  status?: OperationStatus,
  entity?: string,
  id?: string,
): OperationStatus => ({
  code: status?.code ?? 500,
  message: status?.message?.replace(
    '{entity}', entity ?? 'undefined'
  ).replace(
    '{id}', id ?? 'undefined'
  ) ?? 'Unknown status',
});