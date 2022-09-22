import type { AuthCreateOptions, Authorizable, AuthVerificationResult } from '../../../core/types';
import type { CollectionsWriteDescriptor, CollectionsWriteSchema } from '../types';
import { base64url } from 'multiformats/bases/base64';
import { CID } from 'multiformats/cid';
import { DIDResolver } from '../../../did/did-resolver';
import { generateCid } from '../../../utils/cid';
import { getDagCid } from '../../../utils/data';
import { Message } from '../../../core/message';
import { MessageStore } from '../../../store/message-store';
import { removeUndefinedProperties } from '../../../utils/object';
import { sign, verifyAuth } from '../../../core/auth';
import { validate } from '../../../validation/validator';

type CollectionsWriteOptions = AuthCreateOptions & {
  target: string;
  recipient: string;
  protocol?: string;
  contextId?: string;
  schema?: string;
  recordId: string;
  parentId?: string;
  nonce: string;
  data: Uint8Array;
  dateCreated: number;
  published?: boolean;
  datePublished?: number;
  dataFormat: string;
};

export class CollectionsWrite extends Message implements Authorizable {
  protected message: CollectionsWriteSchema;

  constructor(message: CollectionsWriteSchema) {
    super(message);
  }

  static async create(options: CollectionsWriteOptions): Promise<CollectionsWrite> {
    const dataCid = await getDagCid(options.data);
    const descriptor: CollectionsWriteDescriptor = {
      target        : options.target,
      recipient     : options.recipient,
      method        : 'CollectionsWrite',
      protocol      : options.protocol,
      contextId     : options.contextId,
      schema        : options.schema,
      recordId      : options.recordId,
      parentId      : options.parentId,
      nonce         : options.nonce,
      dataCid       : dataCid.toString(),
      dateCreated   : options.dateCreated,
      published     : options.published,
      datePublished : options.datePublished,
      dataFormat    : options.dataFormat
    };

    // delete all descriptor properties that are `undefined` else the code will encounter the following IPLD issue when attempting to generate CID:
    // Error: `undefined` is not supported by the IPLD Data Model and cannot be encoded
    removeUndefinedProperties(descriptor);

    const messageType = descriptor.method;
    validate(messageType, { descriptor, authorization: {} });

    const encodedData = base64url.baseEncode(options.data);
    const authorization = await sign({ descriptor }, options.signatureInput);
    const message = { descriptor, authorization, encodedData };

    return new CollectionsWrite(message);
  }

  async verifyAuth(didResolver: DIDResolver, messageStore: MessageStore): Promise<AuthVerificationResult> {

    // TODO: Issue #75 - Add permission verification - https://github.com/TBD54566975/dwn-sdk-js/issues/75
    return await verifyAuth(this.message, didResolver, messageStore);
  }

  /**
   * Gets the cid of the given CollectionsWrite message.
   * NOTE: `encodedData` is ignored when computing the CID of message.
   */
  static async getCid(message: CollectionsWriteSchema): Promise<CID> {
    const messageCopy = { ...message };

    if (messageCopy['encodedData'] !== undefined) {
      delete messageCopy.encodedData;
    }

    const cid = await generateCid(messageCopy);
    return cid;
  }

  /**
   * @returns newest message in the array. `undefined` if given array is empty.
   */
  static async getNewestMessage(messages: CollectionsWriteSchema[]): Promise<CollectionsWriteSchema | undefined> {
    let currentNewestMessage: CollectionsWriteSchema | undefined = undefined;
    for (const message of messages) {
      if (currentNewestMessage === undefined || await CollectionsWrite.isNewer(message, currentNewestMessage)) {
        currentNewestMessage = message;
      }
    }

    return currentNewestMessage;
  }

  /**
   * Compares the age of two messages.
   * @returns `true` if `a` is newer than `b`; `false` otherwise
   */
  static async isNewer(a: CollectionsWriteSchema, b: CollectionsWriteSchema): Promise<boolean> {
    const aIsNewer = (await CollectionsWrite.compareCreationTime(a, b) > 0);
    return aIsNewer;
  }

  /**
   * Compares the `dateCreated` of the given records with a fallback to message CID according to the spec.
   * @returns 1 if `a` is larger/newer than `b`; -1 if `a` is smaller/older than `b`; 0 otherwise (same age)
   */
  static async compareCreationTime(a: CollectionsWriteSchema, b: CollectionsWriteSchema): Promise<number> {
    if (a.descriptor.dateCreated > b.descriptor.dateCreated) {
      return 1;
    } else if (a.descriptor.dateCreated < b.descriptor.dateCreated) {
      return -1;
    }

    // else `dateCreated` is the same between a and b
    // compare the `dataCid` instead, the < and > operators compare strings in lexicographical order
    const cidA = await CollectionsWrite.getCid(a);
    const cidB = await CollectionsWrite.getCid(b);
    if (cidA > cidB) {
      return 1;
    } else if (cidA < cidB) {
      return -1;
    } else {
      return 0;
    }
  }
}

