import {
  Collection,
  CollectionData,
  CollectionDetailsResponse,
  CollectionView,
} from "@bitwarden/admin-console/common";
import { TreeNode } from "@bitwarden/common/vault/models/domain/tree-node";

import { getNestedCollectionTree, getFlatCollectionTree } from "./collection-utils";

describe("CollectionUtils Service", () => {
  describe("getNestedCollectionTree", () => {
    it("should return collections properly sorted if provided out of order", () => {
      // Arrange
      const collections: CollectionView[] = [];

      const parentName = "Parent";
      const parentCd = new CollectionData(
        new CollectionDetailsResponse({
          name: parentName,
          organizationId: "orgId",
        }),
      );
      const parentCollection = new CollectionView(new Collection(parentCd), parentName);

      const childName = "Parent/Child";
      const childCd = new CollectionData(
        new CollectionDetailsResponse({
          name: childName,
          organizationId: "orgId",
        }),
      );
      const childCollection = new CollectionView(new Collection(childCd), childName);

      collections.push(childCollection);
      collections.push(parentCollection);

      // Act
      const result = getNestedCollectionTree(collections);

      // Assert
      expect(result[0].node.name).toBe("Parent");
      expect(result[0].children[0].node.name).toBe("Child");
    });

    it("should return an empty array if no collections are provided", () => {
      // Arrange
      const collections: CollectionView[] = [];

      // Act
      const result = getNestedCollectionTree(collections);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("getFlatCollectionTree", () => {
    it("should flatten a tree node with no children", () => {
      // Arrange
      const name = "Test Collection";
      const cd = new CollectionData(
        new CollectionDetailsResponse({
          name,
          id: "test-id",
          organizationId: "orgId",
        }),
      );
      const collection = new CollectionView(new Collection(cd), name);

      const treeNodes: TreeNode<CollectionView>[] = [
        new TreeNode<CollectionView>(collection, {} as TreeNode<CollectionView>),
      ];

      // Act
      const result = getFlatCollectionTree(treeNodes);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0]).toBe(collection);
    });

    it("should flatten a tree node with children", () => {
      // Arrange
      const parentName = "Parent";
      const parentCd = new CollectionData(
        new CollectionDetailsResponse({
          name: parentName,
          id: "parent-id",
          organizationId: "orgId",
        }),
      );
      const parentCollection = new CollectionView(new Collection(parentCd), parentName);

      const child1Name = "Child 1";
      const child1Cd = new CollectionData(
        new CollectionDetailsResponse({
          name: child1Name,
          id: "child1-id",
          organizationId: "orgId",
        }),
      );
      const child1Collection = new CollectionView(new Collection(child1Cd), child1Name);

      const child2Name = "Child 2";
      const child2Cd = new CollectionData(
        new CollectionDetailsResponse({
          name: child2Name,
          id: "child2-id",
          organizationId: "orgId",
        }),
      );
      const child2Collection = new CollectionView(new Collection(child2Cd), child2Name);

      const grandChildName = "Grandchild";
      const grandChildCd = new CollectionData(
        new CollectionDetailsResponse({
          name: grandChildName,
          id: "grandchild-id",
          organizationId: "orgId",
        }),
      );
      const grandchildCollection = new CollectionView(new Collection(grandChildCd), grandChildName);

      const parentNode = new TreeNode<CollectionView>(
        parentCollection,
        {} as TreeNode<CollectionView>,
      );
      const child1Node = new TreeNode<CollectionView>(child1Collection, parentNode);
      const child2Node = new TreeNode<CollectionView>(child2Collection, parentNode);
      const grandchildNode = new TreeNode<CollectionView>(grandchildCollection, child1Node);

      parentNode.children = [child1Node, child2Node];
      child1Node.children = [grandchildNode];

      const treeNodes: TreeNode<CollectionView>[] = [parentNode];

      // Act
      const result = getFlatCollectionTree(treeNodes);

      // Assert
      expect(result.length).toBe(4);
      expect(result[0]).toBe(parentCollection);
      expect(result).toContain(child1Collection);
      expect(result).toContain(child2Collection);
      expect(result).toContain(grandchildCollection);
    });
  });
});
