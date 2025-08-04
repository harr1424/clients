import { SelectionReadOnlyRequest } from "@bitwarden/common/admin-console/models/request/selection-read-only.request";
import { EncString } from "@bitwarden/common/key-management/crypto/models/enc-string";

export class CollectionRequest {
  name: string;
  externalId: string | undefined;
  groups: SelectionReadOnlyRequest[] = [];
  users: SelectionReadOnlyRequest[] = [];

  constructor(c: { name: EncString; externalId?: string }) {
    if (!c.name || !c.name.encryptedString) {
      throw new Error("Name not provided for CollectionRequest.");
    }

    this.name = c.name.encryptedString;
    this.externalId = c.externalId;
  }
}
