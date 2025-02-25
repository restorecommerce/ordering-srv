import {
  Response,
  Response_Decision,
  ReverseQuery,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/access_control.js';
import {
  OrderList,
  OrderState,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/order.js';
import { 
  ProductListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/product.js';
import {
  OrganizationListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/organization.js';
import {
  ContactPointListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/contact_point.js';
import {
  AddressListResponse,
  BillingAddress,
  ShippingAddress
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/address.js';
import {
  CountryListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/country.js';
import {
  TaxListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/tax.js';
import {
  TaxTypeListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/tax_type.js';
import {
  FulfillmentSolutionListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/fulfillment_product.js';
import {
  UserResponse,
  UserType
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/user.js';
import {
  UserListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js';
import {
  ShopListResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/shop.js';
import {
  CustomerListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/customer.js';
import {
  FulfillmentListResponse,
  FulfillmentResponse,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/fulfillment.js';
import {
  OperationStatus,
  Status,
  StatusListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/status.js';
import {
  InvoiceListResponse,
  PaymentState
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/invoice.js';
import {
  Effect
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/rule.js';
import {
  Subject
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/auth.js';
import {
  HierarchicalScope
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/auth.js';
import {
  CurrencyListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/currency.js';
import {
  ManufacturerListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/manufacturer.js';
import {
  getRedisInstance,
  logger
} from './utils.js';

type Address = ShippingAddress & BillingAddress;

const mainMeta = {
  modifiedBy: 'SYSTEM',
  acls: [],
  created: new Date(),
  modified: new Date(),
  owners: [
    {
      id: 'urn:restorecommerce:acs:names:ownerIndicatoryEntity',
      value: 'urn:restorecommerce:acs:model:organization.Organization',
      attributes: [
        {
          id: 'urn:restorecommerce:acs:names:ownerInstance',
          value: 'main',
          attributes: []
        }
      ]
    },
  ]
};

const subjects: { [key: string]: Subject } = {
  root_tech_user: {
    id: "root-tech-user",
    token: "1a4c6789-6435-487a-9308-64d06384acf9"
  },
  superadmin: {
    id: 'superadmin',
    scope: 'main',
    token: 'superadmin',
  },
  admin: {
    id: 'admin',
    scope: 'sub',
    token: 'admin',
  },
};

const status: Status = {
  code: 200,
  message: 'OK',
};

const operationStatus: OperationStatus = {
  code: 200,
  message: 'OK',
};

const residentialAddresses: Address[] = [{
  address: {
    id: 'address_1',
    residentialAddress: {
      title: 'Mr.',
      givenName: 'Jack',
      familyName: 'Black',
    },
    street: 'Some Where',
    buildingNumber: '66',
    countryId: 'germany',
  },
  contact: {
    email: 'user@test.spec',
    name: 'Jack Black',
    phone: '00000000000'
  },
  comments: 'Drop it at the backdoor',
}];

const businessAddresses: Address[] = [{
  address: {
    id: 'address_2',
    businessAddress: {
      name: 'Restorecommerce GmbH',
    },
    street: 'Somewhere',
    buildingNumber: '66',
    countryId: 'germany'
  },
  contact: {
    email: 'info@restorecommerce.io'
  }
}];

const addresses: AddressListResponse = {
  items: [
    ...residentialAddresses,
    ...businessAddresses,
  ].map(item => ({
    payload: item.address,
    status
  })),
  totalCount: residentialAddresses.length + businessAddresses.length,
  operationStatus,
}

const customers: CustomerListResponse = {
  items: [
    {
      payload: {
        id: 'customer_1',
        private: {
          userId: 'user_1',
          contactPointIds: [
            'contactPoint_1'
          ],
        },
      },
      status: {
        id: 'customer_1',
        code: 200,
        message: 'OK',
      }
    }
  ],
  totalCount: 1,
  operationStatus
};

const currencies: CurrencyListResponse = {
  items: [{
    payload: {
      id: 'EUR',
      countryIds: ['germany'],
      name: 'EUR',
      precision: 2,
      symbol: '€',
      meta: mainMeta,
    },
    status,
  }],
  operationStatus,
};

const countries: CountryListResponse = {
  items: [{
    payload: {
      id: 'germany',
      countryCode: 'DE',
      name: 'Deutschland',
      geographicalName: 'Germany',
      economicAreas: ['EU'],
    },
    status
  }],
  operationStatus,
};

const tax_types: TaxTypeListResponse = {
  items: [
    {
      payload: {
        id: 'taxType_1',
        type: 'MwSt.',
        description: 'Standard Mehrwert Steuer',
      },
      status: {
        id: 'taxType_1',
        code: 200,
        message: 'OK',
      }
    }
  ],
  totalCount: 1,
  operationStatus
};

const taxes: TaxListResponse = {
  items: [{
    payload: {
      id: 'tax_1',
      countryId: 'germany',
      rate: 0.19,
      typeId: tax_types.items![0].payload!.id,
      abbreviation: 'MwSt.',
    },
    status
  }],
  operationStatus,
};

const manufacturers: ManufacturerListResponse = {
  items: [{
    payload: {
      id: 'manufacturer_1',
      name: 'Manufacturer 1',
    }
  }]
};

const products: ProductListResponse = {
  items: [{
    payload: {
      id: 'physicalProduct_1',
      active: true,
      shopIds: ['shop_1'],
      tags: [],
      associations: [],
      product: {
        name: 'Physical Product 1',
        description: 'This is a physical product',
        manufacturerId: 'manufacturer_1',
        taxIds: [
          taxes.items![0].payload!.id!,
        ],
        physical: {
          variants: [
            {
              id: '1',
              name: 'Physical Product 1 Blue',
              description: 'This is a physical product in blue',
              price: {
                currencyId: 'EUR',
                regularPrice: 9.99,
                salePrice: 8.99,
                sale: false,
              },
              images: [],
              files: [],
              stockKeepingUnit: '123456789',
              stockLevel: 300,
              package: {
                sizeInCm: {
                  height: 10,
                  length: 20,
                  width: 15,
                },
                weightInKg: 0.58,
                rotatable: true,
              },
              properties: [
                {
                  id: 'urn:product:property:color:main:name',
                  value: 'blue',
                  unitCode: 'text',
                },
                {
                  id: 'urn:product:property:color:main:value',
                  value: '#0000FF',
                  unitCode: '#RGB',
                }
              ],
            },
            {
              id: '2',
              name: 'Physical Product 1 Red',
              description: 'This is a physical product in red',
              images: [],
              files: [],
              properties: [
                {
                  id: 'urn:product:property:color:main:name',
                  value: 'red',
                  unitCode: 'text',
                },
                {
                  id: 'urn:product:property:color:main:value',
                  value: '#FF0000',
                  unitCode: '#RGB',
                }
              ],
              parentVariantId: '1',
            }
          ]
        }
      },
    },
    status
  },{
    payload: {
      id: 'physicalProduct_2',
      active: true,
      shopIds: ['shop_1'],
      tags: [],
      associations: [],
      product: {
        name: 'Physical Product 2',
        description: 'This is a physical product',
        manufacturerId: 'manufacturer_1',
        taxIds: [
          taxes.items![0].payload?.id as string,
        ],
        physical: {
          variants: [
            {
              id: '1',
              name: 'Physical Product 1 Blue',
              description: 'This is a physical product in blue',
              price: {
                currencyId: 'EUR',
                regularPrice: 19.99,
                salePrice: 18.99,
                sale: false,
              },
              images: [],
              files: [],
              stockKeepingUnit: '123456789',
              stockLevel: 300,
              package: {
                sizeInCm: {
                  height: 10,
                  length: 20,
                  width: 15,
                },
                weightInKg: 0.58,
                rotatable: true,
              },
              properties: [
                {
                  id: 'urn:product:property:color:main:name',
                  value: 'blue',
                  unitCode: 'text',
                },
                {
                  id: 'urn:product:property:color:main:value',
                  value: '#0000FF',
                  unitCode: '#RGB',
                }
              ],
            },
            {
              id: '2',
              name: 'Physical Product 1 Red',
              description: 'This is a physical product in red',
              images: [],
              files: [],
              properties: [
                {
                  id: 'urn:product:property:color:main:name',
                  value: 'red',
                  unitCode: 'text',
                },
                {
                  id: 'urn:product:property:color:main:value',
                  value: '#FF0000',
                  unitCode: '#RGB',
                }
              ],
              parentVariantId: '1',
            }
          ]
        }
      },
    },
    status,
  }],
  operationStatus,
};

const contactPoints: ContactPointListResponse = {
  items: [{
    payload: {
      id: 'contactPoint_1',
      contactPointTypeIds: [
        'legal', 'billing', 'shipping',
      ],
      name: 'Contact Point 1',
      description: 'A mocked Contact Point for testing',
      email: 'info@shop.com',
      localeId: 'localization_1',
      physicalAddressId: 'address_1',
      telephone: '0123456789',
      timezoneId: 'timezone_1',
      website: 'www.shop.com',
    },
    status,
  }],
  operationStatus,
};

const organizations: OrganizationListResponse = {
  items: [{
    payload: {
      id: 'organization_1',
      contactPointIds: [
        contactPoints.items![0].payload!.id!,
      ],
      paymentMethodIds: [],
    },
    status,
  }],
  operationStatus
};

const shops: ShopListResponse = {
  items: [{
    payload: {
      id: 'shop_1',
      name: 'Shop1',
      description: 'a mocked shop for unit tests',
      domains: ['www.shop.com'],
      organizationId: organizations.items![0].payload!.id,
      shopNumber: '0000000001',
    },
    status,
  }],
  operationStatus,
};

const validOrders: Record<string, OrderList> = {
  'as superadmin': {
    items: [
      {
        id: 'validOrder_1',
        items: [
          {
            productId: products.items![0]!.payload!.id,
            variantId: products.items![0]!.payload!.product?.physical?.variants?.[0]?.id,
            quantity: 4,
          },
          {
            productId: products.items![1]!.payload!.id,
            variantId: products.items![1]!.payload!.product?.physical?.variants?.[0]?.id,
            quantity: 2,
          }
        ],
        notificationEmail: 'user@test.spec',
        userId: 'user_1',
        customerId: 'customer_1',
        shopId: 'shop_1',
        billingAddress: residentialAddresses[0],
        shippingAddress: residentialAddresses[0],
      }
    ],
    totalCount: 1,
    subject: subjects.superadmin,
  },
  'as admin': {
    items: [
      {
        id: 'validOrder_2',
        items: [
          {
            productId: products.items![0]?.payload?.id,
            variantId: products.items![0]?.payload?.product?.physical?.variants?.[0]?.id,
            quantity: 4,
          },
          {
            productId: products.items![1]?.payload?.id,
            variantId: products.items![1]?.payload?.product?.physical?.variants?.[0]?.id,
            quantity: 2,
          }
        ],
        userId: 'user_1',
        customerId: 'customer_1',
        shopId: 'shop_1',
        orderState: OrderState.PENDING,
        totalAmounts: [],
        notificationEmail: 'user@test.spec',
        billingAddress: residentialAddresses[0],
        shippingAddress: residentialAddresses[0],
      }
    ],
    totalCount: 1,
    subject: subjects.admin,
  },
};

const invalidOrders: { [key: string]: OrderList } = {
  'as superadmin': {
    items: [
      {
        id: 'invalidOrder_1',
        items: [
          {
            productId: products.items![0]?.payload?.id,
            variantId: products.items![0]?.payload?.product?.physical?.variants?.[0]?.id,
            quantity: 4,
          },
          {
            productId: products.items![1]?.payload?.id,
            variantId: products.items![1]?.payload?.product?.physical?.variants?.[0]?.id,
            quantity: 2,
          }
        ],
        userId: 'userId_1',
        customerId: 'invalid_customer_1',
        shopId: 'invalid_shop_1',
        notificationEmail: 'user@test.spec',
        totalAmounts: [],
        billingAddress: residentialAddresses[0],
        shippingAddress: residentialAddresses[0],
        orderState: OrderState.PENDING,
      },
      {
        id: 'invalidOrder_2',
        items: [],
        userId: 'userId_1',
        customerId: 'invalid_customer_1',
        shopId: 'invalid_shop_1',
        notificationEmail: 'user@test.spec',
        totalAmounts: [],
        orderState: OrderState.PENDING,
      }
    ],
    totalCount: 2,
    subject: subjects.superadmin,
  },
  'as admin': {
    items: [
      {
        id: 'invalidOrder_2',
        items: [
          {
            productId: products.items![0]?.payload?.id,
            variantId: products.items![0]?.payload?.product?.physical?.variants?.[0]?.id,
            quantity: 4,
          }
        ],
        userId: 'userId_1',
        customerId: 'invalid_customer_1',
        shopId: 'invalid_shop_1',
        notificationEmail: 'user@test.spec',
        totalAmounts: [],
        billingAddress: residentialAddresses[0],
        shippingAddress: residentialAddresses[0],
        orderState: OrderState.PENDING,
      }
    ],
    totalCount: 1,
    subject: {
      ...subjects.admin,
      scope: 'main',
    },
  },
};

const users: { [key: string]: UserResponse } = {
  root_tech_user: {
    payload: {
      id: 'root-tech-user',
      role_associations: [
        {
          id: 'root-tech-user-1-super-administrator-r-id',
          role: 'superadministrator-r-id',
          attributes: [],
        },
      ],
      active: true,
      user_type: UserType.TECHNICAL_USER,
      tokens: [
        {
          token: '1a4c6789-6435-487a-9308-64d06384acf9',
        }
      ],
    },
    status,
  },
  superadmin: {
    payload: {
      id: 'superadmin',
      name: 'manuel.mustersuperadmin',
      first_name: 'Manuel',
      last_name: 'Mustersuperadmin',
      email: 'manuel.mustersuperadmin@restorecommerce.io',
      password: 'A$1rcadminpw',
      default_scope: 'r-ug',
      role_associations: [
        {
          id: 'superadmin-1-administrator-r-id',
          role: 'superadministrator-r-id',
          attributes: [],
        },
      ],
      locale_id: 'de-de',
      timezone_id: 'europe-berlin',
      active: true,
      user_type: UserType.ORG_USER,
      tokens: [
        {
          token: 'superadmin',
        }
      ],
      meta: mainMeta,
    },
    status,
  },
  admin: {
    payload: {
      id: 'admin',
      name: 'manuel.musteradmin',
      first_name: 'Manuel',
      last_name: 'Musteradmin',
      email: 'manuel.musteradmin@restorecommerce.io',
      password: 'A$1rcadminpw',
      default_scope: 'sub',
      role_associations: [
        {
          id: 'admin-1-administrator-r-id',
          role: 'administrator-r-id',
          attributes: [
            {
              id: 'urn:restorecommerce:acs:names:roleScopingEntity',
              value: 'urn:restorecommerce:acs:model:organization.Organization',
              attributes: [
                {
                  id: 'urn:restorecommerce:acs:names:roleScopingInstance',
                  value: 'sub',
                }
              ],
            }
          ],
        },
      ],
      locale_id: 'de-de',
      timezone_id: 'europe-berlin',
      active: true,
      user_type: UserType.ORG_USER,
      tokens: [
        {
          token: 'admin',
        }
      ],
      meta: mainMeta,
    },
    status,
  },
  user_1: {
    payload: {
      id: 'user_1'
    },
    status: {
      id: 'user_1',
      code: 200,
      message: 'OK',
    }
  }
};

const hierarchicalScopes: { [key: string]: HierarchicalScope[] } = {
  root_tech_user: [
    {
      id: 'main',
      role: 'superadministrator-r-id',
      children: [
        {
          id: 'sub',
        }
      ]
    }
  ],
  superadmin: [
    {
      id: 'main',
      role: 'superadministrator-r-id',
      children: [
        {
          id: 'sub',
        }
      ]
    }
  ],
  admin: [
    {
      id: 'sub',
      role: 'administrator-r-id',
    }
  ]
};

const whatIsAllowed: ReverseQuery = {
  policySets: [
    {
      id: 'policy_set',
      combiningAlgorithm: 'urn:oasis:names:tc:xacml:3.0:rule-combining-algorithm:permit-overrides',
      effect: Effect.DENY,
      policies: [
        {
          id: 'policy_superadmin_permit_all',
          combiningAlgorithm: 'urn:oasis:names:tc:xacml:3.0:rule-combining-algorithm:permit-overrides',
          effect: Effect.DENY,
          target: {
            subjects: [
              {
                id: 'urn:restorecommerce:acs:names:role',
                value: 'superadministrator-r-id',
              },
            ],
          },
          rules: [{
            effect: Effect.PERMIT,
            target: {
              subjects: [
                {
                  id: 'urn:restorecommerce:acs:names:role',
                  value: 'superadministrator-r-id',
                },
              ],
            },
          }],
          hasRules: true,
        },{
          id: 'policy_admin_permit_all_by_scope',
          combiningAlgorithm: 'urn:oasis:names:tc:xacml:3.0:rule-combining-algorithm:permit-overrides',
          effect: Effect.DENY,
          target: {
            subjects: [
              {
                id: 'urn:restorecommerce:acs:names:role',
                value: 'administrator-r-id',
              },
            ],
          },
          rules: [{
            id: 'admin_can_do_all_by_scope',
            effect: Effect.PERMIT,
            target: {
              subjects: [
                {
                  id: 'urn:restorecommerce:acs:names:role',
                  value: 'administrator-r-id',
                },
                {
                  id: 'urn:restorecommerce:acs:names:roleScopingEntity',
                  value: 'urn:restorecommerce:acs:model:organization.Organization',
                },
              ],
            },
          }],
          hasRules: true
        },
      ]
    },
  ],
  operationStatus,
};

export const samples = {
  residentialAddresses,
  businessAddresses,
  orders: {
    valid: validOrders,
    invalid: invalidOrders,
  },
  shippingDetails: {
    senderAddress: businessAddresses,
  },
};

const solutions: FulfillmentSolutionListResponse = {
  items: [
    {
      reference: {
        instanceType: 'urn:restorecommerce:acs:model:order:Order',
        instanceId: 'validOrder_1',
      },
      solutions: [
        {
          amounts: [
            {
              currencyId: 'EUR',
              gross: 2.0,
              net: 2.38,
              vats: [
                {
                  taxId: 'tax_1',
                  vat: 0.38,
                }
              ]
            },
          ],
          parcels: [
            {
              id: '1',
              items: [
                  {
                  productId: 'physicalProduct_1',
                  variantId: '1',
                  package: {
                    sizeInCm: {
                      height: 10,
                      length: 20,
                      width: 15,
                    },
                    weightInKg: 0.58,
                    rotatable: true,
                  },
                  quantity: 4,
                },
              ],
              amount: {
                currencyId: 'EUR',
                gross: 2.0,
                net: 2.38,
                vats: [
                  {
                    taxId: 'tax_1',
                    vat: 0.38,
                  }
                ]
              }
            }
          ]
        }
      ],
      status: {
        id: 'validOrder_1',
        code: 200,
        message: 'OK',
      }
    },
    {
      reference: {
        instanceType: 'urn:restorecommerce:acs:model:order:Order',
        instanceId: 'validOrder_2',
      },
      solutions: [
        {
          amounts: [
            {
              currencyId: 'EUR',
              gross: 2.0,
              net: 2.38,
              vats: [
                {
                  taxId: 'tax_1',
                  vat: 0.38,
                }
              ]
            },
          ],
          parcels: [
            {
              id: '1',
              items: [
                {
                  productId: 'physicalProduct_1',
                  variantId: '1',
                  package: {
                    sizeInCm: {
                      height: 10,
                      length: 20,
                      width: 15,
                    },
                    weightInKg: 0.58,
                    rotatable: true,
                  },
                  quantity: 4,
                },
              ],
              amount: {
                currencyId: 'EUR',
                gross: 2.0,
                net: 2.38,
                vats: [
                  {
                    taxId: 'tax_1',
                    vat: 0.38,
                  }
                ]
              }
            }
          ]
        }
      ],
      status
    }
  ],
  totalCount: 1,
  operationStatus
};

export const rules = {
  'acs-srv': {
    isAllowed: (
      call: any,
      callback: (error: any, response: Response) => void,
    ) => callback(null, {
      decision: Response_Decision.PERMIT,
    }),
    whatIsAllowed: (
      call: any,
      callback: (error: any, response: ReverseQuery) => void,
    ) => callback(null, whatIsAllowed),
  },
  user: {
    read: (
      call: any,
      callback: (error: any, response: UserListResponse) => void,
    ) => callback(null, {
      items: Object.values(users),
      totalCount: Object.values(users).length,
      operationStatus,
    }),
    findByToken: (
      call: any,
      callback: (error: any, response: UserResponse) => void,
    ) => {
      getRedisInstance().then(
        async client => {
          const subject = users[call.request.token];
          await client.set(
            `cache:${ subject.payload?.id }:subject`,
            JSON.stringify(subject.payload),
          );
          await client.set(
            `cache:${ subject.payload?.id }:hrScopes`,
            JSON.stringify(hierarchicalScopes[call.request.token]),
          );
          return subject;
        },
      ).then(
        subject => callback(null, subject),
        error => logger.error(error),
      );
    }
  },
  shop: {
    read: (
      call: any,
      callback: (error: any, response: ShopListResponse) => void,
    ) => callback(null, shops),
  },
  organization: {
    read: (
      call: any,
      callback: (error: any, response: OrganizationListResponse) => void,
    ) => callback(null, organizations),
  },
  customer: {
    read: (
      call: any,
      callback: (error: any, response: CustomerListResponse) => void,
    ) => callback(null, customers),
  },
  contact_point: {
    read: (
      call: any,
      callback: (error: any, response: ContactPointListResponse) => void,
    ) => callback(null, contactPoints),
  },
  address: {
    read: (
      call: any,
      callback: (error: any, response: AddressListResponse) => void,
    ) => callback(null, addresses)
  },
  country: {
    read: (
      call: any,
      callback: (error: any, response: CountryListResponse) => void,
    ) => callback(null, countries),
  },
  product: {
    read: (
      call: any,
      callback: (error: any, response: ProductListResponse) => void,
    ) => callback(null, products),
  },
  currency: {
    read: (
      call: any,
      callback: (error: any, response: CurrencyListResponse) => void,
    )=> callback(null, currencies),
  },
  tax: {
    read: (
      call: any,
      callback: (error: any, response: TaxListResponse) => void,
    )=> callback(null, taxes),
  },
  tax_type: {
    read: (
      call: any,
      callback: (error: any, response: TaxTypeListResponse) => void,
    ) => callback(null, tax_types),
  },
  manufacturer: {
    read: (
      call: any,
      callback: (error: any, response: ManufacturerListResponse) => void,
    )=> callback(null, manufacturers),
  },
  fulfillment_product: {
    find: (
      call: any,
      callback: (error: any, response: FulfillmentSolutionListResponse) => void,
    ) => callback(null, solutions),
  },
  fulfillment: {
    create: (
      call: any,
      callback: (error: any, response: FulfillmentListResponse) => void,
    ) => callback(null, {
      items: solutions.items!.map(
        item => {
          const solution = item.solutions![0];
          return {
            payload: {
              references: [item.reference!],
              packaging: {
                parcels: solution!.parcels,
              },
              totalAmounts: solution!.amounts,
            },
            status: {
              code: 200,
            }
          };
        }
      ),
      totalCount: solutions.items!.length,
      operationStatus
    }),
    evaluate: (
      call: any,
      callback: (error: any, response: FulfillmentListResponse) => void,
    ) => callback(null, {
      items: solutions.items!.map(
        item => {
          const solution = item.solutions![0];
          return {
            payload: {
              references: [item.reference!],
              packaging: {
                parcels: solution!.parcels,
              },
              totalAmounts: solution!.amounts,
            },
            status: {
              code: 200,
            }
          };
        }
      ),
      totalCount: solutions.items!.length,
      operationStatus
    }),
  },
  invoice: {
    create: (
      call: any,
      callback: (error: any, response: InvoiceListResponse) => void,
    ) => callback(null, {
      items: [{
        payload: {
          id: 'invoice_1',
          documents: [],
          paymentHints: [],
          references: [
            {
              instanceType: 'urn:restorecommerce:io:Order',
              instanceId: 'order_1',
            },
          ],
          sections: [],
          totalAmounts: [],
          customerId: 'customer_1',
          shopId: 'shop_1',
          userId: 'user_1',
          invoiceNumber: '00000001',
          paymentState: PaymentState.UNPAYED,
        },
        status: {
          id: 'invoice_1',
          code: 200,
          message: 'OK',
        }
      }],
      totalCount: 1,
      operationStatus,
    }),
    render: (
      call: any,
      callback: (error: any, response: InvoiceListResponse) => void,
    ) => callback(null, {
      items: [{
        payload: {
          id: 'invoice_1',
          documents: [],
          paymentHints: [],
          references: [
            {
              instanceType: 'urn:restorecommerce:io:Order',
              instanceId: 'order_1',
            },
          ],
          sections: [],
          totalAmounts: [],
          customerId: 'customer_1',
          shopId: 'shop_1',
          userId: 'user_1',
          invoiceNumber: '00000001',
          paymentState: PaymentState.UNPAYED,
        },
        status: {
          id: 'invoice_1',
          code: 200,
          message: 'OK',
        }
      }],
      totalCount: 1,
      operationStatus,
    }),
    send: (
      call: any,
      callback: (error: any, response: StatusListResponse) => void,
    ) => callback(null, {
      status: [{
        id: 'invoice_1',
        code: 200,
        message: 'OK',
      }],
      operationStatus,
    })
  },
};