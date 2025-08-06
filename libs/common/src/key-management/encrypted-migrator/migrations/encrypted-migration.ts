import { UserId } from "@bitwarden/common/types/guid";

export abstract class EncryptedMigration {
  abstract runMigrations(userId: UserId, masterPassword?: string): Promise<void>;
  abstract needsMigration(userId: UserId): Promise<boolean>;
}
