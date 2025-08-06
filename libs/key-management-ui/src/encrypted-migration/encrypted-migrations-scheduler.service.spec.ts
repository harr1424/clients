import { TestBed } from "@angular/core/testing";
import { of, Subject } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { EncryptedMigratorAbstraction } from "@bitwarden/common/key-management/encrypted-migrator/encrypted-migrator.abstraction";
import { StateProvider } from "@bitwarden/common/platform/state";
import { SyncService } from "@bitwarden/common/platform/sync";
import { UserId } from "@bitwarden/common/types/guid";
import { DialogService } from "@bitwarden/components";
import { PromptMigrationPasswordComponent } from "@bitwarden/key-management-ui";
import { LogService } from "@bitwarden/logging";

import { EncryptedMigrationsSchedulerService, ENCRYPTED_MIGRATION_DISMISSED } from "./encrypted-migrations-scheduler.service";

describe("EncryptedMigrationsSchedulerService", () => {
    let service: EncryptedMigrationsSchedulerService;
    let mockAuthService: mock<AuthService>();
    let mockEncryptedMigrator: jest.Mocked<EncryptedMigratorAbstraction>;
    let mockStateProvider: jest.Mocked<StateProvider>;
    let mockDialogService: jest.Mocked<DialogService>;
    let mockLogService: jest.Mocked<LogService>;
    let mockAccountService:
        let mockSyncService: jest.Mocked<SyncService>;

    const mockUserId = "test-user-id" as UserId;
    const mockMasterPassword = "test-master-password";

    beforeEach(() => {
        const mockUserState = {
            state$: of(null),
        };

        mockAuthService = {
            authStatusFor$: jest.fn().mockReturnValue(of(AuthenticationStatus.Unlocked)),
        } as any;

        mockEncryptedMigrator = {
            needsMigrations: jest.fn().mockResolvedValue(true),
            runMigrations: jest.fn().mockResolvedValue(undefined),
        } as any;

        mockStateProvider = {
            getUser: jest.fn().mockReturnValue(mockUserState),
            setUserState: jest.fn().mockResolvedValue(undefined),
        } as any;

        const mockDialogRef = {
            closed: of(mockMasterPassword),
        };

        mockDialogService = {
            open: jest.fn().mockReturnValue(mockDialogRef),
        } as any;

        mockLogService = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        mockAccountService = {
            accounts$: of({}),
        } as any;

        mockSyncService = {
            lastSync$: jest.fn().mockReturnValue(of(new Date())),
        } as any;

        // Mock the static open method
        jest.spyOn(PromptMigrationPasswordComponent, 'open').mockReturnValue(mockDialogRef as any);

        TestBed.configureTestingModule({
            providers: [
                EncryptedMigrationsSchedulerService,
                { provide: AuthService, useValue: mockAuthService },
                { provide: EncryptedMigratorAbstraction, useValue: mockEncryptedMigrator },
                { provide: StateProvider, useValue: mockStateProvider },
                { provide: DialogService, useValue: mockDialogService },
                { provide: LogService, useValue: mockLogService },
                { provide: AccountService, useValue: mockAccountService },
                { provide: SyncService, useValue: mockSyncService },
            ],
        });

        service = TestBed.inject(EncryptedMigrationsSchedulerService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("promptMigrationIfNeeded", () => {
        it("should return early if user is not unlocked", async () => {
            // Arrange
            mockAuthService.authStatusFor$.mockReturnValue(of(AuthenticationStatus.Locked));

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(mockEncryptedMigrator.needsMigrations).not.toHaveBeenCalled();
            expect(mockStateProvider.getUser).not.toHaveBeenCalled();
            expect(PromptMigrationPasswordComponent.open).not.toHaveBeenCalled();
        });

        it("should return early if no migrations are needed", async () => {
            // Arrange
            mockEncryptedMigrator.needsMigrations.mockResolvedValue(false);

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(mockAuthService.authStatusFor$).toHaveBeenCalledWith(mockUserId);
            expect(mockEncryptedMigrator.needsMigrations).toHaveBeenCalledWith(mockUserId);
            expect(mockStateProvider.getUser).not.toHaveBeenCalled();
            expect(PromptMigrationPasswordComponent.open).not.toHaveBeenCalled();
        });

        it("should return early if migration was dismissed recently (within 24 hours)", async () => {
            // Arrange
            const recentDismissDate = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
            const mockUserState = {
                state$: of(recentDismissDate),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(mockAuthService.authStatusFor$).toHaveBeenCalledWith(mockUserId);
            expect(mockEncryptedMigrator.needsMigrations).toHaveBeenCalledWith(mockUserId);
            expect(mockStateProvider.getUser).toHaveBeenCalledWith(mockUserId, ENCRYPTED_MIGRATION_DISMISSED);
            expect(mockLogService.info).toHaveBeenCalledWith("[EncryptedMigrationsInitiator] Migration prompt dismissed recently, skipping for now.");
            expect(PromptMigrationPasswordComponent.open).not.toHaveBeenCalled();
        });

        it("should prompt for migration if dismissed date is older than 24 hours", async () => {
            // Arrange
            const oldDismissDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
            const mockUserState = {
                state$: of(oldDismissDate),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(mockAuthService.authStatusFor$).toHaveBeenCalledWith(mockUserId);
            expect(mockEncryptedMigrator.needsMigrations).toHaveBeenCalledWith(mockUserId);
            expect(mockStateProvider.getUser).toHaveBeenCalledWith(mockUserId, ENCRYPTED_MIGRATION_DISMISSED);
            expect(PromptMigrationPasswordComponent.open).toHaveBeenCalledWith(mockDialogService);
            expect(mockEncryptedMigrator.runMigrations).toHaveBeenCalledWith(mockUserId, mockMasterPassword);
        });

        it("should prompt for migration if no dismiss date exists", async () => {
            // Arrange
            const mockUserState = {
                state$: of(null),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(mockAuthService.authStatusFor$).toHaveBeenCalledWith(mockUserId);
            expect(mockEncryptedMigrator.needsMigrations).toHaveBeenCalledWith(mockUserId);
            expect(mockStateProvider.getUser).toHaveBeenCalledWith(mockUserId, ENCRYPTED_MIGRATION_DISMISSED);
            expect(PromptMigrationPasswordComponent.open).toHaveBeenCalledWith(mockDialogService);
            expect(mockEncryptedMigrator.runMigrations).toHaveBeenCalledWith(mockUserId, mockMasterPassword);
        });

        it("should run migrations with provided master password", async () => {
            // Arrange
            const mockUserState = {
                state$: of(null),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(PromptMigrationPasswordComponent.open).toHaveBeenCalledWith(mockDialogService);
            expect(mockEncryptedMigrator.runMigrations).toHaveBeenCalledWith(mockUserId, mockMasterPassword);
            expect(mockStateProvider.setUserState).not.toHaveBeenCalled();
        });

        it("should set dismiss date if empty password is provided", async () => {
            // Arrange
            const mockUserState = {
                state$: of(null),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            const mockDialogRef = {
                closed: of(""), // Empty password
            };
            jest.spyOn(PromptMigrationPasswordComponent, 'open').mockReturnValue(mockDialogRef as any);

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(PromptMigrationPasswordComponent.open).toHaveBeenCalledWith(mockDialogService);
            expect(mockEncryptedMigrator.runMigrations).not.toHaveBeenCalled();
            expect(mockStateProvider.setUserState).toHaveBeenCalledWith(
                ENCRYPTED_MIGRATION_DISMISSED,
                expect.any(Date),
                mockUserId
            );
        });

        it("should handle errors during migration process", async () => {
            // Arrange
            const mockUserState = {
                state$: of(null),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            const mockError = new Error("Migration failed");
            mockEncryptedMigrator.runMigrations.mockRejectedValue(mockError);

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(PromptMigrationPasswordComponent.open).toHaveBeenCalledWith(mockDialogService);
            expect(mockEncryptedMigrator.runMigrations).toHaveBeenCalledWith(mockUserId, mockMasterPassword);
            expect(mockLogService.error).toHaveBeenCalledWith("Failed to run encrypted migrations:", mockError);
        });

        it("should handle errors during dialog operation", async () => {
            // Arrange
            const mockUserState = {
                state$: of(null),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            const mockError = new Error("Dialog failed");
            const mockDialogRef = {
                closed: Promise.reject(mockError),
            };
            jest.spyOn(PromptMigrationPasswordComponent, 'open').mockReturnValue(mockDialogRef as any);

            // Act
            await service.promptMigrationIfNeeded(mockUserId);

            // Assert
            expect(PromptMigrationPasswordComponent.open).toHaveBeenCalledWith(mockDialogService);
            expect(mockLogService.error).toHaveBeenCalledWith("Failed to run encrypted migrations:", mockError);
            expect(mockEncryptedMigrator.runMigrations).not.toHaveBeenCalled();
        });

        it("should handle multiple auth status values correctly", async () => {
            // Test LoggedOut status
            mockAuthService.authStatusFor$.mockReturnValue(of(AuthenticationStatus.LoggedOut));
            await service.promptMigrationIfNeeded(mockUserId);
            expect(mockEncryptedMigrator.needsMigrations).not.toHaveBeenCalled();

            // Reset mocks
            jest.clearAllMocks();
            mockAuthService.authStatusFor$.mockReturnValue(of(AuthenticationStatus.Unlocked));

            // Test Unlocked status (should proceed)
            await service.promptMigrationIfNeeded(mockUserId);
            expect(mockEncryptedMigrator.needsMigrations).toHaveBeenCalledWith(mockUserId);
        });

        it("should handle time calculation correctly for dismiss logic", async () => {
            // Test exactly 24 hours ago (should still be dismissed)
            const exactlyDismissTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
            let mockUserState = {
                state$: of(exactlyDismissTime),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            await service.promptMigrationIfNeeded(mockUserId);
            expect(mockLogService.info).toHaveBeenCalledWith("[EncryptedMigrationsInitiator] Migration prompt dismissed recently, skipping for now.");
            expect(PromptMigrationPasswordComponent.open).not.toHaveBeenCalled();

            // Reset mocks
            jest.clearAllMocks();

            // Test just over 24 hours ago (should prompt)
            const justOverDismissTime = new Date(Date.now() - 24.1 * 60 * 60 * 1000);
            mockUserState = {
                state$: of(justOverDismissTime),
            };
            mockStateProvider.getUser.mockReturnValue(mockUserState);

            await service.promptMigrationIfNeeded(mockUserId);
            expect(mockLogService.info).not.toHaveBeenCalledWith("[EncryptedMigrationsInitiator] Migration prompt dismissed recently, skipping for now.");
            expect(PromptMigrationPasswordComponent.open).toHaveBeenCalled();
        });
    });
});
