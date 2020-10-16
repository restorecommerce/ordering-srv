export interface Fulfillment {
  Shipment?: Shipment;
  OrderId?: String;
  meta?: any;
  fulFillmentService?: string;
}

interface Shipment {
  ShipmentDetails: ShipmentDetails[];
  Receiver: Receiver;
  Shipper: Shipper;
  ExportDocument?: ExportDocument;
  customerReference?: string;
  returnShipmentAccountNumber?: string;
  returnShipmentReference?: string;
  Notification: Notification;
}

interface ExportDocument {
  invoiceNumber: string;
  exportType: string;
  exportTypeDescription: string;
  termsOfTrade: string;
  placeOfCommital: string;
  additionalFee: number;
  ExportDocPosition: ExportDocPosition;
}

interface ExportDocPosition {
  description: string;
  countryCodeOrigin: string;
  customsTariffNumber: string;
  amount: number;
  netWeightInKG: number;
  customsValue: number;
}


interface ShipmentDetails {
  ShipmentItem: ShipmentItem;
}

interface Receiver {
  name1: string;
  Address: Address;
  Communication: Communication;
}

interface Name {
  name1: string;
}

interface Shipper {
  Name: Name;
  Address: Address;
  Communication: Communication;
}

interface Address {
  streetName: string;
  streetNumber: string;
  addressAddition?: AddressAddition;
  zip: string;
  city: string;
  Origin: Origin;
}

interface AddressAddition {
  field1: string;
  field2: string;
}

interface Origin {
  country: string;
  countryISOCode: string;
}

interface Communication {
  phone: string;
  email: string;
}

interface ShipmentItem {
  weightInKG: number;
  lengthInCM?: number;
  widthInCM?: number;
  heightInCM?: number;
}

interface Notification {
  recipientEmailAddress: string;
}
