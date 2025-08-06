import { UserId } from "@bitwarden/common/types/guid";

export abstract class EncryptedMigratorAbstraction {
  /*
   * Runs migrations on a decrypted user, with the cryptographic state initialized.
   * If the user logged in or unlocked with a master password, it is provided too.
   * This needs to be run after the decrypted user key has been set to state.
   */
  abstract runMigrations(userId: UserId, masterPassword?: string): Promise<void>;
}
