import { UserId } from "@bitwarden/common/types/guid";

import { MigrationRequirement } from "./migrations/encrypted-migration";

export abstract class EncryptedMigrator {
  /**
   * Runs migrations on a decrypted user, with the cryptographic state initialized.
   * This only runs the migrations that are needed for the user.
   * This needs to be run after the decrypted user key has been set to state.
   * @param userId The ID of the user to run migrations for.
   * @param masterPassword The user's current master password. This is mandatory in case @link{needsMigration} returns "needsMigrationWithMasterPassword".
   * @throws If the user does not exist
   * @throws If the user is locked or logged out
   * @throws If migrations are already running
   */
  abstract runMigrations(userId: UserId, masterPassword?: string): Promise<void>;
  /**
   * Checks if the user needs to run any migrations.
   * This is used to determine if the user should be prompted to run migrations.
   * @param userId The ID of the user to check migrations for.
   */
  abstract needsMigrations(userId: UserId): Promise<MigrationRequirement>;
}
