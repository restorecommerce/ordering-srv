import { 
  OrderList,
  OrderState,
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/order';
import { 
  ProductListResponse, ProductResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/product';
import {
  OrganizationListResponse, OrganizationResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/organization';
import {
  ContactPointListResponse, ContactPointResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/contact_point';
import {
  AddressListResponse, BillingAddress, ShippingAddress
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/address';
import {
  CountryListResponse,
  CountryResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/country';
import {
  TaxListResponse, TaxResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/tax';
import {
  TaxTypeListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/tax_type';
import {
  PackingSolutionListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/fulfillment_product';
import {
  ShopListResponse, ShopResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/shop';
import {
  CustomerListResponse
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/customer';
import {
  FulfillmentListResponse,
  State as FulfillmentState
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/fulfillment';
import { OperationStatus } from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/status';
import { InvoiceListResponse, PaymentState } from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/invoice';
import { DeepPartial } from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/resource_base';

type Address = ShippingAddress & BillingAddress;

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

const countries: CountryResponse[] = [{
  payload: {
    id: 'germany',
    countryCode: 'DE',
    name: 'Deutschland',
    geographicalName: 'Germany',
    economicAreas: [],
  },
  status: {
    id: 'germany',
    code: 200,
    message: 'OK',
  }
}];

const taxes: TaxResponse[] = [
  {
    payload: {
      id: 'tax_1',
      countryId: 'germany',
      rate: 0.19,
      typeId: 'taxType_1',
      variant: 'MwSt.'
    },
    status: {
      id: 'tax_1',
      code: 200,
      message: 'OK'
    }
  }
]

const products: ProductResponse[] = [
  {
    payload: {
      id: 'physicalProduct_1',
      active: true,
      shopId: 'shop_1',
      tags: [],
      associations: [],
      product: {
        name: 'Physical Product 1',
        description: 'This is a physical product',
        manufacturerId: 'manufacturer_1',
        taxIds: [
          taxes[0].payload?.id as string,
        ],
        physical: {
          variants: [
            {
              id: '1',
              name: 'Physical Product 1 Blue',
              description: 'This is a physical product in blue',
              price: {
                currencyId: 'currency_1',
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
    status: {
      id: 'physicalProduct_1',
      code: 200,
      message: 'OK',
    }
  },
];

const contactPoints = [
  {
    payload: {
      id: 'contactPoint_1',
      contactPointTypeIds: [
        'legal_address'
      ],
      name: 'Contact Point 1',
      description: 'A mocked Contact Point for testing',
      email: 'info@shop.com',
      localeId: 'localization_1',
      physicalAddressId: businessAddresses[0].address?.id,
      telephone: '0123456789',
      timezoneId: 'timezone_1',
      website: 'www.shop.com',
    },
    status: {
      id: 'contactPoint_1',
      code: 200,
      message: 'OK',
    }
  }
] as ContactPointResponse[];

const organizations = [
  {
    payload: {
      id: 'organization_1',
      contactPointIds: [
        contactPoints[0].payload?.id,
      ],
      paymentMethodIds: [],
    },
    status: {
      id: 'organization_1',
      code: 200,
      message: 'OK',
    },
  }
] as OrganizationResponse[];

const shops = [
  {
    payload: {
      id: 'shop_1',
      name: 'Shop1',
      description: 'a mocked shop for unit tests',
      domain: 'www.shop.com',
      organizationId: organizations[0].payload?.id,
      shopNumber: '0000000001',
    },
    status: {
      id: 'shop_1',
      code: 200,
      message: 'OK',
    }
  }
] as ShopResponse[];

const validOrders: OrderList[] = [
  {
    items: [
      {
        id: 'validOrder_1',
        items: [
          {
            productId: products[0]?.payload?.id,
            variantId: products[0]?.payload?.product?.physical?.variants[0].id,
            quantity: 4,
          }
        ],
        userId: 'user_1',
        customerId: 'customer_1',
        shopId: 'shop_1',
        orderState: OrderState.CREATED,
        totalAmounts: [],
        notificationEmail: 'user@test.spec',
        packagingPreferences: {
          couriers: [{
            id: 'name',
            value: 'DHL',
            attributes: [],
          }],
          options: [],
        },
        billingAddress: residentialAddresses[0],
        shippingAddress: residentialAddresses[0],
        meta: {
          modifiedBy: 'SYSTEM',
          acls: [],
          created: new Date(),
          modified: new Date(),
          owners: [
            {
              id: 'urn:restorecommerce:acs:names:ownerIndicatoryEntity',
              value: 'urn:restorecommerce:acs:model:user.User',
              attributes: []
            },
            {
              id: 'urn:restorecommerce:acs:names:ownerInstance',
              value: 'UserID',
              attributes: []
            }
          ]
        }
      }
    ],
    totalCount: 1,
    subject: {
      id: '',
      scope: '',
      token: '',
      unauthenticated: true
    }
  }
];

const invalidOrders: OrderList[] = [
  {
    items: [
      {
        id: 'invalidOrder_1',
        items: [
          {
            productId: products[0]?.payload?.id,
            variantId: products[0]?.payload?.product?.physical?.variants[0].id,
            quantity: 4,
          }
        ],
        userId: 'userId_1',
        customerId: 'customerId_1',
        shopId: 'invalid_shop_1',
        notificationEmail: 'user@test.spec',
        packagingPreferences: {
          couriers: [{
            id: 'name',
            value: 'DHL',
            attributes: [],
          }],
          options: [],
        },
        totalAmounts: [],
        billingAddress: residentialAddresses[0],
        shippingAddress: residentialAddresses[0],
        orderState: OrderState.CREATED,
        meta: {
          modifiedBy: 'SYSTEM',
          created: new Date(),
          modified: new Date(),
          acls: [],
          owners: [
            {
              id: 'urn:restorecommerce:acs:names:ownerIndicatoryEntity',
              value: 'urn:restorecommerce:acs:model:user.User',
              attributes: []
            },
            {
              id: 'urn:restorecommerce:acs:names:ownerInstance',
              value: 'UserID',
              attributes: []
            }
          ]
        }
      }
    ],
    totalCount: 1,
    subject: {
      id: '',
      scope: '',
      token: '',
      unauthenticated: true
    }
  }
];

export const samples = {
  residentialAddresses,
  businessAddresses,
  orders: {
    valid: validOrders,
    invalid: invalidOrders,
  },
  shipping_details: {
    senderAddress: businessAddresses,
  },
};

export const rules = {
  shop: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<ShopListResponse>) => void,
    ) => callback(null, {
      items: shops,
      totalCount: shops.length,
      operationStatus
    }),
  },
  organization: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<OrganizationListResponse>) => void,
    ) => callback(null, {
      items: organizations,
      totalCount: organizations.length,
      operationStatus,
    })
  },
  customer: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<CustomerListResponse>) => void,
    ) => callback(null, {
      items: [
        {
          payload: {
            id: 'customer_1',
            private: {
              userId: 'user_1',
              contactPointIds: [
                'cantactPoint_1'
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
    }),
  },
  contact_point: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<ContactPointListResponse>) => void,
    ) => callback(null, {
      items: contactPoints,
      totalCount: contactPoints.length,
      operationStatus,
    })
  },
  address: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<AddressListResponse>) => void,
    ) => callback(null, {
      items: [
        ...residentialAddresses,
        ...businessAddresses,
      ].map(item => ({
        payload: item.address,
        status: {
          id: item.address?.id,
          code: 200,
          message: 'OK',
        }
      })),
      totalCount: residentialAddresses.length + businessAddresses.length,
      operationStatus,
    })
  },
  country: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<CountryListResponse>) => void,
    ) => callback(null, {
      items: countries,
      totalCount: countries.length,
      operationStatus,
    }),
  },
  product: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<ProductListResponse>) => void,
    ) => callback(null, {
      items: products,
      totalCount: products.length,
      operationStatus,
    }),
  },
  tax: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<TaxListResponse>) => void,
    )=> callback(null, {
      items: taxes,
      totalCount: 1,
      operationStatus
    }),
  },
  tax_type: {
    read: (
      call: any,
      callback: (error: any, response: DeepPartial<TaxTypeListResponse>) => void,
    ) => callback(null, {
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
    }),
  },
  fulfillment_product: {
    find: (
      call: any,
      callback: (error: any, response: DeepPartial<PackingSolutionListResponse>) => void,
    ) => callback(null, {
      items: [
        {
          reference: {
            instanceType: 'unr:restorecommerce:io:Order',
            instanceId: 'validOrder_1',
          },
          solutions: [
            {
              amounts: [
                {
                  currencyId: 'currency_1',
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
                }
              ]
            }
          ],
          status: {
            id: 'validOrder_1',
            code: 200,
            message: 'OK',
          }
        }
      ],
      totalCount: 1,
      operationStatus
    }),
  },
  fulfillment: {
    create: (
      call: any,
      callback: (error: any, response: DeepPartial<FulfillmentListResponse>) => void,
    ) => callback(null, {
      items: [
        {
          payload: {
            id: 'fulfillment_1',
            state: FulfillmentState.CREATED,
            packaging: {
              parcels: []
            },
            labels: [],
            totalAmounts: [],
            trackings: [],
          },
          status: {
            id: 'fulfillment_1',
            code: 200,
            message: 'OK',
          }
        }
      ],
      totalCount: 1,
      operationStatus
    }),
  },
  invoice: {
    create: (
      call: any,
      callback: (error: any, response: DeepPartial<InvoiceListResponse>) => void,
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
    })
  },
};