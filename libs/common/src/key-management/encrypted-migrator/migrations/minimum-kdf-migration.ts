import { assertNonNullish } from "@bitwarden/common/auth/utils";
import { UserId } from "@bitwarden/common/types/guid";
// eslint-disable-next-line no-restricted-imports
import {
  KdfConfigService,
  MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE,
  PBKDF2KdfConfig,
} from "@bitwarden/key-management";
import { LogService } from "@bitwarden/logging";

import { ChangeKdfServiceAbstraction } from "../../kdf/abstractions/change-kdf-service";

import { EncryptedMigration } from "./encrypted-migration";

/**
 * This migrator ensures the user's account has a minimum PBKDF2 iteration count.
 * It will update the entire account, logging out old clients if necessary.
 */
export class MinimumPbkdf2Migration implements EncryptedMigration {
  constructor(
    private readonly kdfConfigService: KdfConfigService,
    private readonly changeKdfService: ChangeKdfServiceAbstraction,
    private readonly logService: LogService,
  ) {}

  async runMigrations(userId: UserId, masterPassword?: string): Promise<void> {
    assertNonNullish(userId, "userId");
    await this.legacyKdfMigration(userId, masterPassword);
  }

  private async legacyKdfMigration(userId: UserId, masterPassword?: string): Promise<void> {
    const kdfConfig = await this.kdfConfigService.getKdfConfig(userId);
    assertNonNullish(kdfConfig, "kdfConfig");

    if (masterPassword == null) {
      this.logService.warning(
        `[Encrypted Migrator] No master password provided for user ${userId}, skipping KDF migration.`,
      );
      // User unlocked with biometrics / PIN
      // TODO: Prompt user
      return;
    }

    await this.changeKdfService.updateUserKdfParams(
      masterPassword,
      new PBKDF2KdfConfig(MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE),
      userId,
    );
  }

  async needsMigration(userId: UserId): Promise<boolean> {
    const kdfConfig = await this.kdfConfigService.getKdfConfig(userId);
    assertNonNullish(kdfConfig, "kdfConfig");

    // return kdfConfig.kdfType === KdfType.PBKDF2_SHA256 &&
    //     kdfConfig.iterations < MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE;
    return true;
  }
}
