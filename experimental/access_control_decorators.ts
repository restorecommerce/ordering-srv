import { Logger } from 'winston';
import { Provider } from 'nconf';
import {
  Client,
  createClient,
  createChannel,
  GrpcClientConfig
} from '@restorecommerce/grpc-client';
import { ServiceConfig } from '@restorecommerce/service-config';
import {
  AuthZAction,
  accessRequest,
  ACSClientContext,
  DecisionResponse,
  Operation,
  PolicySetRQResponse,
  Resource,
} from '@restorecommerce/acs-client';
import {
  UserServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated-server/io/restorecommerce/user';
/* eslint-disable prefer-arrow-functions/prefer-arrow-functions */

export function access_controlled_service<T extends { new (...args: any): {} }>(baseClass: T) {
  return class extends baseClass {
    public readonly user_service: Client<UserServiceDefinition>;

    constructor(...args: any) {
      super(...args);

      const cfg = args.find((arg: any) => (arg instanceof Provider)) as ServiceConfig;
      const logger = args.find((arg: any) => (arg instanceof Logger)) as Logger;

      this.user_service = createClient(
        {
          ...cfg.get('client:user'),
          logger
        } as GrpcClientConfig,
        UserServiceDefinition,
        createChannel(cfg.get('client:user:address'))
      );
    }
  };
}

export type ACSClientContextFactory = (self: any, ...args: any) => ACSClientContext;
export type ResourceFactory = (self: any, ...args: any) => Resource[];

export function access_controlled_function(
  action: AuthZAction,
  operation: Operation,
  context: ACSClientContext | ACSClientContextFactory | undefined = undefined,
  resource: Resource[] | ResourceFactory | undefined = undefined,
  useCache = true
) {
  return function (
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<any>,
  ) {
    const method = descriptor.value!;
    
    descriptor.value = function () {

      if (typeof(context) === 'function') {
        context = context(this, ...arguments);
      }

      if (typeof(resource) === 'function') {
        resource = resource(this, ...arguments);
      }


      //throw new Error("Access Controlled!");
      return method.apply(this, arguments);
    };
  }
}

function access_controled<T>(
  callback: Callback<T>
) {
  return function (target: any, propertyName: string, descriptor: TypedPropertyDescriptor<(...args: any) => any>) {
    const method = descriptor.value!;
    descriptor.value = function () {
      //console.log(target, propertyName, this, arguments);
      callback(this as T);
      return method.apply(this, arguments);
    };
  }
}


function decorator<T>(callback: Callback<T>) {
  return function (target: any, propertyName: string, descriptor: TypedPropertyDescriptor<(...args: any) => any>) {
    const method = descriptor.value!;
    descriptor.value = function () {
      //console.log(target, propertyName, this, arguments);
      callback(this as T);
      return method.apply(this, arguments);
    };
  }
}


@init
class MyClass {
  public static thing = 'Hi';

  static aCallback(self: MyClass) {
    console.log(self.title);
  }
  
  constructor(
    private title: string,
    private int: number,
  ) {}

  @decorator(MyClass.aCallback)
  print(text: string, subtext: string) {
    console.log(text, subtext);
  }

}

new MyClass('Title', 5).print('some text', 'subtext');

export type ResourceExtractor<T> = (arg:T) => Resource;



/**
 * Perform an access request using inputs from a GQL request
 *
 * @param subject Subject information
 * @param resources resources
 * @param action The action to perform
 * @param entity The entity type to check access against
 */
export async function checkAccessRequest(
  context: ACSClientContext,
  resource: Resource[],
  action: AuthZAction,
  operation: Operation,
  useCache = true
): Promise<DecisionResponse | PolicySetRQResponse> {
  const subject = context.subject;
  if (subject && subject.token) {
    const idsClient = await getUserServiceClient();
    if (idsClient) {
      const dbSubject = await idsClient.findByToken({ token: subject.token });
      if (dbSubject && dbSubject.payload && dbSubject.payload.id) {
        subject.id = dbSubject.payload.id;
      }
    }
  }

  return accessRequest(
    subject,
    resource,
    action,
    context,
    operation,
    'arangoDB',
    useCache
  ).catch(
    (err: any) => ({
      decision: Response_Decision.DENY,
      operation_status: {
        code: err.code || 500,
        message: err.details || err.message,
      }
    })
  );
}