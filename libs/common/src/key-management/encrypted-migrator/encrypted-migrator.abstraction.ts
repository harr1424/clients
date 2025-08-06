import { UserId } from "@bitwarden/common/types/guid";

export abstract class EncryptedMigratorAbstraction {
  /*
   * Runs migrations on a decrypted user, with the cryptographic state initialized.
   * This only runs the migrations that are needed for the user.
   * This needs to be run after the decrypted user key has been set to state.
   */
  abstract runMigrations(userId: UserId, masterPassword: string): Promise<void>;
  /*
   * Checks if the user needs to run any migrations.
   * This is used to determine if the user should be prompted to run migrations.
   */
  abstract needsMigrations(userId: UserId): Promise<boolean>;
}
