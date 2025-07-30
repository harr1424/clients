// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { catchError, EMPTY, firstValueFrom, map } from "rxjs";

import { assertNonNullish } from "@bitwarden/common/auth/utils";
import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { SymmetricCryptoKey } from "@bitwarden/common/platform/models/domain/symmetric-crypto-key";
// eslint-disable-next-line no-restricted-imports
import { KdfConfig, KdfConfigService, KeyService } from "@bitwarden/key-management";
import { PasswordProtectedKeyEnvelope } from "@bitwarden/sdk-internal";

import { AccountService } from "../../auth/abstractions/account.service";
import { CryptoFunctionService } from "../../key-management/crypto/abstractions/crypto-function.service";
import { EncryptService } from "../../key-management/crypto/abstractions/encrypt.service";
import { EncString, EncryptedString } from "../../key-management/crypto/models/enc-string";
import { KeyGenerationService } from "../../platform/abstractions/key-generation.service";
import { LogService } from "../../platform/abstractions/log.service";
import { PIN_DISK, PIN_MEMORY, StateProvider, UserKeyDefinition } from "../../platform/state";
import { UserId } from "../../types/guid";
import { PinKey, UserKey } from "../../types/key";
import { firstValueFromOrThrow } from "../utils";

import { PinServiceAbstraction } from "./pin.service.abstraction";

/**
 * - DISABLED   : No PIN set.
 * - PERSISTENT : PIN is set and persists through client reset.
 * - EPHEMERAL  : PIN is set, but does NOT persist through client reset. This means that
 *                after client reset the master password is required to unlock.
 */
export type PinLockType = "DISABLED" | "PERSISTENT" | "EPHEMERAL";

/**
 * The persistent (stored on disk) version of the UserKey, encrypted by the PinKey.
 *
 * @deprecated
 * @remarks Persists through a client reset. Used when `requireMasterPasswordOnClientRestart` is disabled.
 * @see SetPinComponent.setPinForm.requireMasterPasswordOnClientRestart
 */
export const PIN_KEY_ENCRYPTED_USER_KEY_PERSISTENT = new UserKeyDefinition<EncryptedString>(
  PIN_DISK,
  "pinKeyEncryptedUserKeyPersistent",
  {
    deserializer: (jsonValue) => jsonValue,
    clearOn: ["logout"],
  },
);

/**
 * The persistent (stored on disk) version of the UserKey, stored in a `PasswordProtectedKeyEnvelope`.
 *
 * @remarks Persists through a client reset. Used when `requireMasterPasswordOnClientRestart` is disabled.
 * @see SetPinComponent.setPinForm.requireMasterPasswordOnClientRestart
 */
export const PIN_PROTECTED_USER_KEY_ENVELOPE_PERSISTENT = new UserKeyDefinition<PasswordProtectedKeyEnvelope>(
  PIN_DISK,
  "pinProtectedUserKeyEnvelopePersistent",
  {
    deserializer: (jsonValue) => jsonValue,
    clearOn: ["logout"],
  },
);

/**
 * The ephemeral (stored in memory) version of the UserKey, encrypted by the PinKey.
 *
 * @deprecated
 * @remarks Does NOT persist through a client reset. Used when `requireMasterPasswordOnClientRestart` is enabled.
 * @see SetPinComponent.setPinForm.requireMasterPasswordOnClientRestart
 */
export const PIN_KEY_ENCRYPTED_USER_KEY_EPHEMERAL = new UserKeyDefinition<EncryptedString>(
  PIN_MEMORY,
  "pinKeyEncryptedUserKeyEphemeral",
  {
    deserializer: (jsonValue) => jsonValue,
    clearOn: ["logout"],
  },
);

/**
 * The ephemeral (stored in memory) version of the UserKey, stored in a `PasswordProtectedKeyEnvelope`.
 */
export const PIN_PROTECTED_USER_KEY_ENVELOPE_EPHEMERAL = new UserKeyDefinition<PasswordProtectedKeyEnvelope>(
  PIN_MEMORY,
  "pinProtectedUserKeyEnvelopeEphemeral",
  {
    deserializer: (jsonValue) => jsonValue,
    clearOn: ["logout"],
  },
);

/**
 * The PIN, encrypted by the UserKey.
 */
export const USER_KEY_ENCRYPTED_PIN = new UserKeyDefinition<EncryptedString>(
  PIN_DISK,
  "userKeyEncryptedPin",
  {
    deserializer: (jsonValue) => jsonValue,
    clearOn: ["logout"],
  },
);

export class PinService implements PinServiceAbstraction {
  constructor(
    private accountService: AccountService,
    private encryptService: EncryptService,
    private kdfConfigService: KdfConfigService,
    private keyGenerationService: KeyGenerationService,
    private logService: LogService,
    private stateProvider: StateProvider,
    private keyService: KeyService,
    private sdkService: SdkService,
  ) { }

  async getPin(userId: UserId): Promise<string> {
    assertNonNullish(userId, "userId");

    const userKey: UserKey = await firstValueFromOrThrow(this.keyService.userKey$(userId), "userKey");
    const userKeyEncryptedPin: EncryptedString = await firstValueFromOrThrow(this.stateProvider.getUserState$(USER_KEY_ENCRYPTED_PIN, userId), "userKeyEncryptedPin");
    return this.encryptService.decryptString(new EncString(userKeyEncryptedPin), userKey);
  }

  async setPin(pin: string, pinLockType: PinLockType, userId: UserId): Promise<void> {
    assertNonNullish(pin, "pin");
    assertNonNullish(pinLockType, "pinLockType");
    assertNonNullish(userId, "userId");

    // Use the sdk to create an enrollment, not yet persisting it to state
    const { pinProtectedUserKeyEnvelope, userKeyEncryptedPin } = await firstValueFrom(
      this.sdkService.userClient$(userId).pipe(
        map((sdk) => {
          if (!sdk) {
            throw new Error("SDK not available");
          }

          using ref = sdk.take();
          return ref.value.crypto().enroll_pin(pin);
        }),
        catchError((error: unknown) => {
          this.logService.error(`Failed to enroll pin: ${error}`);
          return EMPTY;
        }),
      ),
    );

    // NOTE: The type assertion should be replaced as soon as EncryptedString is just a type alias of the SDK's `EncString` type
    await this.setPinState(pinProtectedUserKeyEnvelope, userKeyEncryptedPin as string as EncryptedString, pinLockType, userId);
  }

  async unsetPin(userId: UserId): Promise<void> {
    assertNonNullish(userId, "userId");

    await this.stateProvider.setUserState(USER_KEY_ENCRYPTED_PIN, null, userId);
    await this.stateProvider.setUserState(PIN_PROTECTED_USER_KEY_ENVELOPE_EPHEMERAL, null, userId);
    await this.stateProvider.setUserState(PIN_PROTECTED_USER_KEY_ENVELOPE_PERSISTENT, null, userId);

    // Note: This can be deleted after sufficiently many PINs are migrated and the state is removed.
    await this.stateProvider.setUserState(PIN_KEY_ENCRYPTED_USER_KEY_EPHEMERAL, null, userId);
    await this.stateProvider.setUserState(PIN_KEY_ENCRYPTED_USER_KEY_PERSISTENT, null, userId);
  }

  async getPinLockType(userId: UserId): Promise<PinLockType> {
    assertNonNullish(userId, "userId");

    const isEphemeralPinSet =
      (await this.getPinProtectedUserKeyEphemeral(userId)) != null
      // Deprecated
      || (await this.getPinKeyEncryptedUserKeyEphemeral(userId)) != null;

    const isPersistentPinSet =
      (await this.getPinProtectedUserKeyPersistent(userId)) != null
      // Deprecated
      || (await this.getPinKeyEncryptedUserKeyPersistent(userId)) != null;

    if (isPersistentPinSet) {
      return "PERSISTENT";
    } else if (isEphemeralPinSet) {
      return "EPHEMERAL";
    } else {
      return "DISABLED";
    }
  }

  async isPinSet(userId: UserId): Promise<boolean> {
    assertNonNullish(userId, "userId");

    return (await this.getPinLockType(userId)) !== "DISABLED";
  }

  async isPinDecryptionAvailable(userId: UserId): Promise<boolean> {
    assertNonNullish(userId, "userId");

    const pinLockType = await this.getPinLockType(userId);

    switch (pinLockType) {
      case "DISABLED":
        return false;
      case "PERSISTENT":
        // The above getPinLockType call ensures that we have either a PinKeyEncryptedUserKey  set.
        return true;
      case "EPHEMERAL": {
        // The above getPinLockType call ensures that we have a UserKeyEncryptedPin set.
        // However, we must additively check to ensure that we have a set PinKeyEncryptedUserKeyEphemeral b/c otherwise
        // we cannot take a PIN, derive a PIN key, and decrypt the ephemeral UserKey.
        const pinKeyEncryptedUserKeyEphemeral =
          await this.getPinKeyEncryptedUserKeyEphemeral(userId);
        return Boolean(pinKeyEncryptedUserKeyEphemeral);
      }

      default: {
        // Compile-time check for exhaustive switch
        const _exhaustiveCheck: never = pinLockType;
        throw new Error(`Unexpected pinLockType: ${_exhaustiveCheck}`);
      }
    }
  }

  async decryptUserKeyWithPin(pin: string, userId: UserId): Promise<UserKey | null> {
    assertNonNullish(pin, "pin");
    assertNonNullish(userId, "userId");

    const hasPinProtectedKeyEnvelopeSet = (await this.getPinProtectedUserKeyEphemeral(userId)) != null ||
      (await this.getPinProtectedUserKeyPersistent(userId)) != null;
    if (hasPinProtectedKeyEnvelopeSet) {
      const pinLockType = await this.getPinLockType(userId);
      const envelope = pinLockType === "EPHEMERAL"
        ? await this.getPinProtectedUserKeyEphemeral(userId)
        : await this.getPinProtectedUserKeyPersistent(userId);

      try {
        // Use the sdk to create an enrollment, not yet persisting it to state
        const userKeyBytes = await firstValueFrom(
          this.sdkService.userClient$(userId).pipe(
            map((sdk) => {
              if (!sdk) {
                throw new Error("SDK not available");
              }

              using ref = sdk.take();
              return ref.value.crypto().unseal_password_protected_key_envelope(pin, envelope);
            }),
            catchError((error: unknown) => {
              this.logService.error(`Failed to enroll pin: ${error}`);
              return EMPTY;
            }),
          ),
        );

        return new SymmetricCryptoKey(userKeyBytes) as UserKey;
      } catch (error) {
        this.logService.error(`Failed to unseal pin: ${error}`);
        return null;
      }
    } else {
      // This branch is deprecated and will be removed in the future, but is kept for migration.
      try {
        const pinLockType = await this.getPinLockType(userId);

        const pinKeyEncryptedUserKey = await this.getPinKeyEncryptedKeys(pinLockType, userId);

        const email = await firstValueFrom(
          this.accountService.accounts$.pipe(map((accounts) => accounts[userId].email)),
        );
        const kdfConfig = await this.kdfConfigService.getKdfConfig(userId);

        const userKey: UserKey = await this.decryptUserKey(
          pin,
          email,
          kdfConfig,
          pinKeyEncryptedUserKey,
        );
        if (!userKey) {
          this.logService.warning(`User key null after pin key decryption.`);
          return null;
        }
        return userKey;
      } catch (error) {
        this.logService.error(`Error decrypting user key with pin: ${error}`);
        return null;
      }
    }
  }

  private async getPinProtectedUserKeyEphemeral(userId: UserId): Promise<PasswordProtectedKeyEnvelope | null> {
    assertNonNullish(userId, "userId");

    return await firstValueFrom(
      this.stateProvider.getUserState$(PIN_PROTECTED_USER_KEY_ENVELOPE_EPHEMERAL, userId),
    );
  }

  private async getPinProtectedUserKeyPersistent(userId: UserId): Promise<PasswordProtectedKeyEnvelope | null> {
    assertNonNullish(userId, "userId");

    return await firstValueFrom(
      this.stateProvider.getUserState$(PIN_PROTECTED_USER_KEY_ENVELOPE_PERSISTENT, userId),
    );
  }

  // Clears the set pin for the user, and then sets the PIN-protected user key and the user key encrypted pin to state.
  // The user key protected PIN is persisted, while the PIN-protected user key is set to ephemeral / persistent state depending on the lock type.
  private async setPinState(pinProtectedUserKeyEnvelope: PasswordProtectedKeyEnvelope, userKeyEncryptedPin: EncryptedString, pinLockType: PinLockType, userId: UserId): Promise<void> {
    // First un-enroll the user from pin-unlock
    await this.unsetPin(userId);

    // Then, persist the enrollment to state
    if (pinLockType === "EPHEMERAL") {
      await this.stateProvider.setUserState(
        PIN_PROTECTED_USER_KEY_ENVELOPE_EPHEMERAL,
        pinProtectedUserKeyEnvelope,
        userId,
      );
    } else if (pinLockType === "PERSISTENT") {
      await this.stateProvider.setUserState(
        PIN_PROTECTED_USER_KEY_ENVELOPE_PERSISTENT,
        pinProtectedUserKeyEnvelope,
        userId,
      );
    } else {
      throw new Error(`Cannot set up PIN with pin lock type ${pinLockType}`);
    }
    await this.stateProvider.setUserState(
      USER_KEY_ENCRYPTED_PIN,
      /// TODO: This should be updated once EncryptedString is a type alias of SDK's EncString
      userKeyEncryptedPin as string as EncryptedString,
      userId,
    );
  }

  /// Anything below here is deprecated and will be removed subsequently

  async makePinKey(pin: string, salt: string, kdfConfig: KdfConfig): Promise<PinKey> {
    const start = Date.now();
    const pinKey = await this.keyGenerationService.deriveKeyFromPassword(pin, salt, kdfConfig);
    this.logService.info(`[Pin Service] deriving pin key took ${Date.now() - start}ms`);

    return (await this.keyGenerationService.stretchKey(pinKey)) as PinKey;
  }

  private async getPinKeyEncryptedUserKeyEphemeral(userId: UserId): Promise<EncryptedString | null> {
    assertNonNullish(userId, "userId");

    return await firstValueFrom(
      this.stateProvider.getUserState$(PIN_KEY_ENCRYPTED_USER_KEY_EPHEMERAL, userId),
    );
  }

  private async getPinKeyEncryptedUserKeyPersistent(userId: UserId): Promise<EncryptedString | null> {
    assertNonNullish(userId, "userId");

    return await firstValueFrom(
      this.stateProvider.getUserState$(PIN_KEY_ENCRYPTED_USER_KEY_PERSISTENT, userId),
    );
  }

  /**
   * Decrypts the UserKey with the provided PIN.
   * @deprecated
   * @throws If the PIN does not match the PIN that was used to encrypt the user key 
   * @throws If the salt, or KDF don't match the salt / KDF used to encrypt the user key
   */
  private async decryptUserKey(
    pin: string,
    salt: string,
    kdfConfig: KdfConfig,
    pinKeyEncryptedUserKey: EncString,
    userId: UserId,
  ): Promise<UserKey> {
    assertNonNullish(userId, "userId");
    assertNonNullish(pin, "pin");
    assertNonNullish(salt, "salt");
    assertNonNullish(kdfConfig, "kdfConfig");
    assertNonNullish(pinKeyEncryptedUserKey, "pinKeyEncryptedUserKey");
    const pinKey = await this.makePinKey(pin, salt, kdfConfig);
    const userKey = await this.encryptService.unwrapSymmetricKey(pinKeyEncryptedUserKey, pinKey);
    return userKey as UserKey;
  }
}
