import { UserId } from "@bitwarden/common/types/guid";

export interface EncryptedMigration {
  /**
   * Runs the migration.
   * @throws If the migration fails, such as when no network is available.
   * @throws If the requirements for migration are not met (e.g. the user is locked)
   */
  runMigrations(userId: UserId, masterPassword?: string): Promise<void>;
  /**
   * Returns whether the migration needs to be run for the user, and if it does, whether the master password is required.
   */
  needsMigration(userId: UserId): Promise<MigrationRequirement>;
}

export type MigrationRequirement =
  | "needsMigration"
  | "needsMigrationWithMasterPassword"
  | "noMigrationNeeded";
