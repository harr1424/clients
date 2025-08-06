import { mock } from "jest-mock-extended";

import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { UserId } from "@bitwarden/common/types/guid";
// eslint-disable-next-line no-restricted-imports
import { KdfConfigService } from "@bitwarden/key-management";
import { LogService } from "@bitwarden/logging";

import { ChangeKdfServiceAbstraction } from "../kdf/abstractions/change-kdf-service";

import { EncryptedMigrator } from "./encrypted-migrator.service";
import { EncryptedMigration } from "./migrations/encrypted-migration";
import { MinimumKdfMigration } from "./migrations/minimum-kdf-migration";

jest.mock("./migrations/minimum-kdf-migration");

describe("EncryptedMigrator", () => {
  const mockKdfConfigService = mock<KdfConfigService>();
  const mockChangeKdfService = mock<ChangeKdfServiceAbstraction>();
  const mockLogService = mock<LogService>();
  const configService = mock<ConfigService>();

  let sut: EncryptedMigrator;
  let mockMigration: jest.Mocked<MinimumKdfMigration>;

  const mockUserId = "00000000-0000-0000-0000-000000000000" as UserId;
  const mockMasterPassword = "masterPassword123";

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock instance of MinimumKdfMigration
    mockMigration = {
      needsMigration: jest.fn(),
      runMigrations: jest.fn(),
    } as unknown as jest.Mocked<MinimumKdfMigration>;

    // Mock the constructor of MinimumKdfMigration to return our mock
    (MinimumKdfMigration as jest.MockedClass<typeof MinimumKdfMigration>).mockImplementation(
      () => mockMigration,
    );

    sut = new EncryptedMigrator(
      mockKdfConfigService,
      mockChangeKdfService,
      mockLogService,
      configService,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("runMigrations", () => {
    it("should throw error when userId is null", async () => {
      await expect(sut.runMigrations(null as any)).rejects.toThrow("userId");
    });

    it("should throw error when userId is undefined", async () => {
      await expect(sut.runMigrations(undefined as any)).rejects.toThrow("userId");
    });

    it("should not run migration when needsMigration returns false", async () => {
      mockMigration.needsMigration.mockResolvedValue(false);

      await sut.runMigrations(mockUserId);

      expect(mockMigration.needsMigration).toHaveBeenCalledWith(mockUserId);
      expect(mockMigration.runMigrations).not.toHaveBeenCalled();
    });

    it("should run migration when needsMigration returns true", async () => {
      mockMigration.needsMigration.mockResolvedValue(true);

      await sut.runMigrations(mockUserId, mockMasterPassword);

      expect(mockMigration.needsMigration).toHaveBeenCalledWith(mockUserId);
      expect(mockMigration.runMigrations).toHaveBeenCalledWith(mockUserId, mockMasterPassword);
    });

    it("should run multiple migrations", async () => {
      // Create a second mock migration
      const mockSecondMigration = mock<EncryptedMigration>();
      mockSecondMigration.needsMigration.mockResolvedValue(true);

      // Add a second migration manually to test multiple migrations
      (sut as any).migrations.push({
        name: "Test Second Migration",
        migration: mockSecondMigration,
      });

      mockMigration.needsMigration.mockResolvedValue(true);

      await sut.runMigrations(mockUserId, mockMasterPassword);

      // Verify both migrations were checked and run
      expect(mockMigration.needsMigration).toHaveBeenCalledWith(mockUserId);
      expect(mockSecondMigration.needsMigration).toHaveBeenCalledWith(mockUserId);
      expect(mockMigration.runMigrations).toHaveBeenCalledWith(mockUserId, mockMasterPassword);
      expect(mockSecondMigration.runMigrations).toHaveBeenCalledWith(
        mockUserId,
        mockMasterPassword,
      );
    });
  });
});
