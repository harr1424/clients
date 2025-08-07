import { assertNonNullish } from "@bitwarden/common/auth/utils";
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

import { EncryptedMigration, MigrationRequirement } from "./encrypted-migration";

/**
 * This migrator ensures the user's account has a minimum PBKDF2 iteration count.
 * It will update the entire account, logging out old clients if necessary.
 */
export class MinimumKdfMigration implements EncryptedMigration {
  constructor(
    private readonly kdfConfigService: KdfConfigService,
    private readonly changeKdfService: ChangeKdfServiceAbstraction,
    private readonly logService: LogService,
    private readonly configService: ConfigService,
  ) {}

  async runMigrations(userId: UserId, masterPassword?: string): Promise<void> {
    assertNonNullish(userId, "userId");
    assertNonNullish(masterPassword, "masterPassword");

    this.logService.info(
      `[MinimumKdfMigration] Updating user ${userId} to minimum PBKDF2 iteration count ${MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE}`,
    );
    await this.changeKdfService.updateUserKdfParams(
      masterPassword,
      new PBKDF2KdfConfig(MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE),
      userId,
    );
  }

  async needsMigration(userId: UserId): Promise<MigrationRequirement> {
    assertNonNullish(userId, "userId");

    const kdfConfig = await this.kdfConfigService.getKdfConfig(userId);
    // Only PBKDF2 users below the minimum iteration count need migration
    if (
      kdfConfig.kdfType !== KdfType.PBKDF2_SHA256 ||
      kdfConfig.iterations >= MINIMUM_PBKDF2_ITERATIONS_FOR_UPGRADE
    ) {
      return "noMigrationNeeded";
    }

    if (!(await this.configService.getFeatureFlag(FeatureFlag.ForceUpdateKDFSettings))) {
      return "noMigrationNeeded";
    }

    return "needsMigrationWithMasterPassword";
  }
}
