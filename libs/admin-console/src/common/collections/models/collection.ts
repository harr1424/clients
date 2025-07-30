import { EncString } from "@bitwarden/common/key-management/crypto/models/enc-string";
import Domain from "@bitwarden/common/platform/models/domain/domain-base";
import { CollectionId } from "@bitwarden/common/types/guid";
import { OrgKey } from "@bitwarden/common/types/key";

import { CollectionData } from "./collection.data";
import { CollectionView } from "./collection.view";

export const CollectionTypes = {
  SharedCollection: 0,
  DefaultUserCollection: 1,
} as const;

export type CollectionType = (typeof CollectionTypes)[keyof typeof CollectionTypes];

export class Collection extends Domain {
  id: CollectionId | undefined;
  organizationId: string;
  name: EncString;
  externalId: string | undefined;
  readOnly: boolean = false;
  hidePasswords: boolean = false;
  manage: boolean = false;
  type: CollectionType = CollectionTypes.SharedCollection;

  constructor(obj: CollectionData) {
    super();
    if (obj == null || obj.name == null || obj.organizationId == null) {
      throw new Error("CollectionData must contain name and organizationId.");
    }

    this.id = obj.id;
    this.organizationId = obj.organizationId;
    this.name = new EncString(obj.name);
    this.externalId = obj.externalId;
    this.readOnly = obj.readOnly;
    this.hidePasswords = obj.hidePasswords;
    this.manage = obj.manage;
    this.type = obj.type;
  }

  decrypt(orgKey: OrgKey): Promise<CollectionView> {
    return this.decryptObj<Collection, CollectionView>(
      this,
      new CollectionView(this, ""),
      ["name"],
      this.organizationId ?? null,
      orgKey,
    );
  }
}
