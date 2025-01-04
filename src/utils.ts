import { BigNumber } from 'bignumber.js';
import {
  Client,
} from '@restorecommerce/grpc-client';
import {
  OrderResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/order.js';
import {
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
  AddressServiceDefinition, AddressResponse
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
export type ObjectMap<T extends Entity> = { [key: string]: T };
export type OrderMap = ObjectMap<OrderResponse>;
export type ProductMap = ObjectMap<ProductResponse>;
export type RatioedTaxMap = ObjectMap<RatioedTax>;
export type CustomerMap = ObjectMap<CustomerResponse>;
export type CurrencyMap = ObjectMap<CurrencyResponse>;
export type ShopMap = ObjectMap<ShopResponse>;
export type OrganizationMap = ObjectMap<OrganizationResponse>;
export type ContactPointMap = ObjectMap<ContactPointResponse>;
export type AddressMap = ObjectMap<AddressResponse>;
export type CountryMap = ObjectMap<CountryResponse>;
export type PositionMap = ObjectMap<Position>;
export type StatusMap = ObjectMap<Status>;
export type SettingMap = ObjectMap<SettingResponse>;

export type FulfillmentMap = { [key: string]: FulfillmentResponse[] };
export type FulfillmentSolutionMap = { [key: string]: FulfillmentSolutionResponse };
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
| Client<CurrencyServiceDefinition>
| Client<InvoiceServiceDefinition>;


export const toObjectMap = <T extends Entity>(items: T[]): ObjectMap<T> => items.reduce(
  (a, b) => {
    a[b.id ?? b.payload?.id] = b;
    return a;
  },
  {} as ObjectMap<T>
) ?? {};

export const DefaultUrns = {
  instanceType: 'urn:restorecommerce:acs:model:order:Order',
  ownerIndicatoryEntity: 'urn:restorecommerce:acs:names:ownerIndicatoryEntity',
  ownerInstance: 'urn:restorecommerce:acs:names:ownerInstance',
  organization: 'urn:restorecommerce:acs:model:organization.Organization',
  user: 'urn:restorecommerce:acs:model:user.User',

  shop_fulfillment_create_enabled:  'urn:restorecommerce:shop:setting:order:submit:fulfillment:create:enabled', // Creates fulfillment on order submit if enabled (default: true)
  shop_invoice_create_enabled:      'urn:restorecommerce:shop:setting:order:submit:invoice:create:enabled',     // Creates invoice on order submit if enabled (default: true)
  shop_invoice_render_enabled:      'urn:restorecommerce:shop:setting:order:submit:invoice:render:enabled',     // Renders invoice on order submit if enabled, overrides create! (default: true)
  shop_invoice_send_enabled:        'urn:restorecommerce:shop:setting:order:submit:invoice:send:enabled',       // Sends invoice on order submit if enabled, overrides render! (default: true)
  shop_order_error_cleanup:         'urn:restorecommerce:shop:setting:order:error:cleanup:enabled',             // Clean up orders on any error of fulfillment or invoice (default: false)
};
export type KnownUrns = typeof DefaultUrns;

export const DefaultSetting = {
  shop_fulfillment_create_enabled: true,
  shop_invoice_create_enabled: true,
  shop_invoice_render_enabled: true,
  shop_invoice_send_enabled: true,
  shop_order_error_cleanup: true,
}
export type ResolvedSetting = typeof DefaultSetting;
export type ResolvedSettingMap = Map<string, ResolvedSetting>;

const parseTrue = (value: string) => value?.toString().toLowerCase() === 'true';
const SettingParser: { [key: string]: (value: string) => any } = {
  shop_fulfillment_create_enabled: parseTrue,
  shop_invoice_create_enabled: parseTrue,
  shop_invoice_render_enabled: parseTrue,
  shop_invoice_send_enabled: parseTrue,
  shop_order_error_cleanup: parseTrue
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