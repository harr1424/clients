import { inject, Injectable } from "@angular/core";
import { combineLatest, map, switchMap, of, firstValueFrom, filter, debounceTime, tap } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { EncryptedMigratorAbstraction } from "@bitwarden/common/key-management/encrypted-migrator/encrypted-migrator.abstraction";
import { UserKeyDefinition, ENCRYPTED_MIGRATION_DISK, StateProvider } from "@bitwarden/common/platform/state";
import { SyncService } from "@bitwarden/common/platform/sync";
import { UserId } from "@bitwarden/common/types/guid";
import { DialogService } from "@bitwarden/components";
import { PromptMigrationPasswordComponent } from "@bitwarden/key-management-ui";
import { LogService } from "@bitwarden/logging";

export const ENCRYPTED_MIGRATION_DISMISSED = new UserKeyDefinition<Date>(
  ENCRYPTED_MIGRATION_DISK,
  "encryptedMigrationDismissed",
  {
    deserializer: (obj: any) => obj != null ? new Date(obj) : null,
    clearOn: [],
  },
);
const DISMISS_TIME_HOURS = 24;

type UserSyncData = {
  userId: UserId;
  lastSync: Date | null;
};

@Injectable({
  providedIn: "root",
})
export class EncryptedMigrationsSchedulerService {
  private syncService = inject(SyncService);
  private accountService = inject(AccountService);
  private stateProvider = inject(StateProvider);
  private encryptedMigrator = inject(EncryptedMigratorAbstraction);
  private authService = inject(AuthService);
  private logService = inject(LogService);
  private dialogService = inject(DialogService);

  constructor() {
    // For all accounts, if the auth status changes to unlocked or a sync happens, prompt for migration
    this.accountService.accounts$.pipe(
      switchMap((accounts) => {
        const userIds = Object.keys(accounts) as UserId[];

        if (userIds.length === 0) {
          return of([]);
        }

        return combineLatest(
          userIds.map(userId =>
            combineLatest([
              this.authService.authStatusFor$(userId),
              this.syncService.lastSync$(userId)
            ]).pipe(
              debounceTime(2000),
              filter(([authStatus]) => authStatus === AuthenticationStatus.Unlocked),
              map(([, lastSync]) => ({ userId, lastSync } as UserSyncData)),
              tap(({ userId }) => this.promptMigrationIfNeeded(userId))
            )
          )
        );
      }),
    ).subscribe();
  }

  async promptMigrationIfNeeded(userId: UserId): Promise<void> {
    const authStatus = await firstValueFrom(this.authService.authStatusFor$(userId));
    if (authStatus !== AuthenticationStatus.Unlocked) {
      return;
    }

    if (!await this.encryptedMigrator.needsMigrations(userId)) {
      return;
    }

    const dismissedDate = await firstValueFrom(this.stateProvider.getUser(userId, ENCRYPTED_MIGRATION_DISMISSED).state$);
    if (dismissedDate != null) {
      const now = new Date();
      const timeDiff = now.getTime() - dismissedDate.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff < DISMISS_TIME_HOURS) {
        this.logService.info("[EncryptedMigrationsInitiator] Migration prompt dismissed recently, skipping for now.");
        return;
      }
    }

    try {
      const dialog = PromptMigrationPasswordComponent.open(this.dialogService);
      const masterPassword = await firstValueFrom(dialog.closed);
      if (masterPassword == "") {
        await this.stateProvider.setUserState(ENCRYPTED_MIGRATION_DISMISSED, new Date(), userId);
      } else {
        await this.encryptedMigrator.runMigrations(userId, masterPassword);
      }
    } catch (error) {
      this.logService.error("Failed to run encrypted migrations:", error);
    }
  }
}
