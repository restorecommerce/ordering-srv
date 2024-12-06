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

  shop_fulfillment_create_enabled: 'urn:restorecommerce:shop:setting:order:create:fulfillment:enabled',
  shop_fulfillment_submit_enabled: 'urn:restorecommerce:shop:setting:order:submit:fulfillment:enabled',
  shop_invoice_create_enabled: 'urn:restorecommerce:shop:setting:order:create:invoice:enabled',
  shop_invoice_render_enabled: 'urn:restorecommerce:shop:setting:order:render:invoice:enabled',
  shop_invoice_send_enabled: 'urn:restorecommerce:shop:setting:order:send:invoice:enabled',


  /*
  disableFulfillment: 'urn:restorecommerce:order:preferences:disableFulfillment',
  disableInvoice: 'urn:restorecommerce:order:preferences:disableInvoice',
  entity: 'urn:restorecommerce:acs:names:model:entity',
  model: 'urn:restorecommerce:acs:model',
  role: 'urn:restorecommerce:acs:names:role',
  roleScopingEntity: 'urn:restorecommerce:acs:names:roleScopingEntity',
  roleScopingInstance: 'urn:restorecommerce:acs:names:roleScopingInstance',
  unauthenticated_user: 'urn:restorecommerce:acs:names:unauthenticated-user',
  property: 'urn:restorecommerce:acs:names:model:property',
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
  aclIndicatoryEntity: 'urn:restorecommerce:acs:names:aclIndicatoryEntity',
  aclInstance: 'urn:restorecommerce:acs:names:aclInstance',
  skipACL: 'urn:restorecommerce:acs:names:skipACL',
  maskedProperty: 'urn:restorecommerce:acs:names:obligation:maskedProperty',
  */
};
export type KnownUrns = typeof DefaultUrns;