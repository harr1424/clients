import { makeSymmetricCryptoKey, mockEnc } from "@bitwarden/common/spec";
import { CollectionId, OrganizationId } from "@bitwarden/common/types/guid";
import { OrgKey } from "@bitwarden/common/types/key";

import { Collection, CollectionTypes } from "./collection";
import { CollectionData } from "./collection.data";
import { CollectionDetailsResponse } from "./collection.response";

describe("Collection", () => {
  let data: CollectionData;

  beforeEach(() => {
    data = new CollectionData(
      new CollectionDetailsResponse({
        id: "id" as CollectionId,
        organizationId: "orgId" as OrganizationId,
        name: "encName",
        externalId: "extId",
        readOnly: true,
        manage: true,
        hidePasswords: true,
        type: CollectionTypes.DefaultUserCollection,
      }),
    );
  });

  it("Throws when not provided name and organizationId", () => {
    const cd = new CollectionData(new CollectionDetailsResponse({}));
    expect(() => new Collection(cd)).toThrow();
  });

  it("Convert from partial", () => {
    const cd = new CollectionData(
      new CollectionDetailsResponse({
        name: "name",
        organizationId: "orgId" as OrganizationId,
        id: "id" as CollectionId,
      }),
    );
    const card = new Collection(cd);
    expect(() => card).not.toThrow();

    expect(card.name).not.toBe(null);
    expect(card.organizationId).not.toBe(null);
    expect(card.id).not.toBe(null);
    expect(card.externalId).toBe(undefined);
    expect(card.readOnly).toBe(false);
    expect(card.manage).toBe(false);
    expect(card.hidePasswords).toBe(false);
    expect(card.type).toEqual(CollectionTypes.SharedCollection);
  });

  it("Convert", () => {
    const collection = new Collection(data);

    expect(collection).toEqual({
      id: "id",
      organizationId: "orgId",
      name: { encryptedString: "encName", encryptionType: 0 },
      externalId: "extId",
      readOnly: true,
      manage: true,
      hidePasswords: true,
      type: CollectionTypes.DefaultUserCollection,
    });
  });

  it("Decrypt", async () => {
    const collectionData = new CollectionData(
      new CollectionDetailsResponse({
        name: "encName",
        organizationId: "orgId" as OrganizationId,
        id: "id" as CollectionId,
      }),
    );
    const collection = new Collection(collectionData);
    collection.name = mockEnc(collectionData.name);
    collection.externalId = "extId";
    collection.readOnly = false;
    collection.hidePasswords = false;
    collection.manage = true;
    collection.type = CollectionTypes.DefaultUserCollection;

    const key = makeSymmetricCryptoKey<OrgKey>();

    const view = await collection.decrypt(key);

    expect(view).toEqual({
      externalId: "extId",
      hidePasswords: false,
      id: "id",
      name: "encName",
      organizationId: "orgId",
      readOnly: false,
      manage: true,
      assigned: true,
      type: CollectionTypes.DefaultUserCollection,
    });
  });
});
