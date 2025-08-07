import { assertNonNullish } from "@bitwarden/common/auth/utils";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { UserId } from "@bitwarden/common/types/guid";
// eslint-disable-next-line no-restricted-imports
import { KdfConfigService } from "@bitwarden/key-management";
import { LogService } from "@bitwarden/logging";

import { ChangeKdfServiceAbstraction } from "../kdf/abstractions/change-kdf-service";

import { EncryptedMigrator } from "./encrypted-migrator.abstraction";
import { EncryptedMigration, MigrationRequirement } from "./migrations/encrypted-migration";
import { MinimumKdfMigration } from "./migrations/minimum-kdf-migration";

export class DefaultEncryptedMigrator implements EncryptedMigrator {
  private migrations: { name: string; migration: EncryptedMigration }[] = [];

  constructor(
    readonly kdfConfigService: KdfConfigService,
    readonly changeKdfService: ChangeKdfServiceAbstraction,
    private readonly logService: LogService,
    readonly configService: ConfigService,
  ) {
    // Register migrations here
    this.migrations.push({
      name: "Minimum PBKDF2 Iteration Count Migration",
      migration: new MinimumKdfMigration(
        kdfConfigService,
        changeKdfService,
        logService,
        configService,
      ),
    });
  }

  async runMigrations(userId: UserId, masterPassword: string | null = null): Promise<void> {
    assertNonNullish(userId, "userId");

    // Ensure that the requirements for running all migrations are met
    const needsMigration = await this.needsMigrations(userId);
    if (needsMigration === "noMigrationNeeded") {
      return;
    } else if (needsMigration === "needsMigrationWithMasterPassword" && !masterPassword) {
      throw new Error("Master password is required to run migrations");
    }

    // Run all migrations sequentially in the order they were registered
    this.logService.mark("[Encrypted Migrator] Start");
    this.logService.info(`[Encrypted Migrator] Starting migrations for user: ${userId}`);
    for (const { name, migration } of this.migrations) {
      if ((await migration.needsMigration(userId)) !== "noMigrationNeeded") {
        this.logService.info(`[Encrypted Migrator] Running migration: ${name}`);
        const start = performance.now();
        await migration.runMigrations(userId, masterPassword);
        this.logService.measure(start, "[Encrypted Migrator]", name, "ExecutionTime");
      }
    }
    this.logService.mark("[Encrypted Migrator] Finish");
    this.logService.info(`[Encrypted Migrator] Completed migrations for user: ${userId}`);
  }

  async needsMigrations(userId: UserId): Promise<MigrationRequirement> {
    assertNonNullish(userId, "userId");

    const migrationRequirements = await Promise.all(
      this.migrations.map(async ({ migration }) => migration.needsMigration(userId)),
    );

    if (migrationRequirements.includes("needsMigrationWithMasterPassword")) {
      return "needsMigrationWithMasterPassword";
    } else if (migrationRequirements.includes("needsMigration")) {
      return "needsMigration";
    } else {
      return "noMigrationNeeded";
    }
  }
}
