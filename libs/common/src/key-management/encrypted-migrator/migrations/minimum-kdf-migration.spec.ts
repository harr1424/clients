import { mock } from "jest-mock-extended";

import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { UserId } from "@bitwarden/common/types/guid";
// eslint-disable-next-line no-restricted-imports
import {
  KdfConfigService,
  KdfType,
  MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE,
  PBKDF2KdfConfig,
} from "@bitwarden/key-management";
import { LogService } from "@bitwarden/logging";

import { ChangeKdfServiceAbstraction } from "../../kdf/abstractions/change-kdf-service";

import { MinimumKdfMigration } from "./minimum-kdf-migration";

describe("MinimumKdfMigration", () => {
  const mockKdfConfigService = mock<KdfConfigService>();
  const mockChangeKdfService = mock<ChangeKdfServiceAbstraction>();
  const mockLogService = mock<LogService>();
  const mockConfigService = mock<ConfigService>();

  let sut: MinimumKdfMigration;

  const mockUserId = "00000000-0000-0000-0000-000000000000" as UserId;
  const mockMasterPassword = "masterPassword";

  beforeEach(() => {
    jest.clearAllMocks();

    sut = new MinimumKdfMigration(
      mockKdfConfigService,
      mockChangeKdfService,
      mockLogService,
      mockConfigService,
    );
  });

  describe("runMigrations", () => {
    it("should throw error when userId is null", async () => {
      await expect(sut.runMigrations(null as any)).rejects.toThrow("userId");
    });

    it("should throw error when userId is undefined", async () => {
      await expect(sut.runMigrations(undefined as any)).rejects.toThrow("userId");
    });

    it("should call legacyKdfMigration with correct parameters", async () => {
      const mockKdfConfig = new PBKDF2KdfConfig(50000);
      mockKdfConfigService.getKdfConfig.mockResolvedValue(mockKdfConfig);

      const legacyKdfMigrationSpy = jest
        .spyOn(sut as any, "legacyKdfMigration")
        .mockResolvedValue(undefined);

      await sut.runMigrations(mockUserId, mockMasterPassword);

      expect(legacyKdfMigrationSpy).toHaveBeenCalledWith(mockUserId, mockMasterPassword);
    });

    it("should update KDF when master password is provided", async () => {
      const mockKdfConfig = new PBKDF2KdfConfig(50000);
      mockKdfConfigService.getKdfConfig.mockResolvedValue(mockKdfConfig);

      await sut.runMigrations(mockUserId, mockMasterPassword);

      expect(mockChangeKdfService.updateUserKdfParams).toHaveBeenCalledWith(
        mockMasterPassword,
        new PBKDF2KdfConfig(MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE),
        mockUserId,
      );
    });

    it("should log warning and skip migration when master password is not provided", async () => {
      const mockKdfConfig = new PBKDF2KdfConfig(50000);
      mockKdfConfigService.getKdfConfig.mockResolvedValue(mockKdfConfig);

      await sut.runMigrations(mockUserId);

      expect(mockLogService.warning).toHaveBeenCalledWith(
        `[Encrypted Migrator] No master password provided for user ${mockUserId}, skipping KDF migration.`,
      );
      expect(mockChangeKdfService.updateUserKdfParams).not.toHaveBeenCalled();
    });

    it("should throw error when kdfConfig is null", async () => {
      mockKdfConfigService.getKdfConfig.mockResolvedValue(null);

      await expect(sut.runMigrations(mockUserId, mockMasterPassword)).rejects.toThrow("kdfConfig");
    });
  });

  describe("needsMigration", () => {
    it("should throw error when userId is null", async () => {
      await expect(sut.needsMigration(null as any)).rejects.toThrow("userId");
    });

    it("should throw error when userId is undefined", async () => {
      await expect(sut.needsMigration(undefined as any)).rejects.toThrow("userId");
    });

    it("should throw error when kdfConfig is null", async () => {
      mockKdfConfigService.getKdfConfig.mockResolvedValue(null);

      await expect(sut.needsMigration(mockUserId)).rejects.toThrow("kdfConfig");
    });

    it("should return false when KDF type is not PBKDF2", async () => {
      const mockKdfConfig = {
        kdfType: KdfType.Argon2id,
        iterations: 3,
        memory: 64,
        parallelism: 4,
      } as any;
      mockKdfConfigService.getKdfConfig.mockResolvedValue(mockKdfConfig);

      const result = await sut.needsMigration(mockUserId);

      expect(result).toBe(false);
    });

    it("should return false when PBKDF2 iterations are already at or above minimum", async () => {
      const mockKdfConfig = new PBKDF2KdfConfig(MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE);
      mockKdfConfigService.getKdfConfig.mockResolvedValue(mockKdfConfig);

      const result = await sut.needsMigration(mockUserId);

      expect(result).toBe(false);
    });

    it("should return false when feature flag is disabled", async () => {
      const mockKdfConfig = new PBKDF2KdfConfig(100000); // Below minimum
      mockKdfConfigService.getKdfConfig.mockResolvedValue(mockKdfConfig);
      mockConfigService.getFeatureFlag.mockResolvedValue(false);

      const result = await sut.needsMigration(mockUserId);

      expect(result).toBe(false);
      expect(mockConfigService.getFeatureFlag).toHaveBeenCalledWith(
        FeatureFlag.ForceUpdateKDFSettings,
      );
    });

    it("should return true when PBKDF2 iterations are below minimum and feature flag is enabled", async () => {
      const mockKdfConfig = new PBKDF2KdfConfig(100000); // Below minimum
      mockKdfConfigService.getKdfConfig.mockResolvedValue(mockKdfConfig);
      mockConfigService.getFeatureFlag.mockResolvedValue(true);

      const result = await sut.needsMigration(mockUserId);

      expect(result).toBe(true);
      expect(mockConfigService.getFeatureFlag).toHaveBeenCalledWith(
        FeatureFlag.ForceUpdateKDFSettings,
      );
    });

    it("should check feature flag only when other conditions are met", async () => {
      const mockKdfConfig = new PBKDF2KdfConfig(MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE);
      mockKdfConfigService.getKdfConfig.mockResolvedValue(mockKdfConfig);

      await sut.needsMigration(mockUserId);

      expect(mockConfigService.getFeatureFlag).not.toHaveBeenCalled();
    });
  });
});
