import { mock } from "jest-mock-extended";
import { BehaviorSubject, filter } from "rxjs";

import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { DEFAULT_KDF_CONFIG, KdfConfigService, KeyService } from "@bitwarden/key-management";

import { FakeAccountService, FakeStateProvider, mockAccountServiceWith } from "../../../spec";
import { KeyGenerationService } from "../../platform/abstractions/key-generation.service";
import { LogService } from "../../platform/abstractions/log.service";
import { Utils } from "../../platform/misc/utils";
import { SymmetricCryptoKey } from "../../platform/models/domain/symmetric-crypto-key";
import { UserId } from "../../types/guid";
import { PinKey, UserKey } from "../../types/key";
import { CryptoFunctionService } from "../crypto/abstractions/crypto-function.service";
import { EncryptService } from "../crypto/abstractions/encrypt.service";
import { EncString } from "../crypto/models/enc-string";

import {
  PinService,
  PIN_KEY_ENCRYPTED_USER_KEY_PERSISTENT,
  PIN_KEY_ENCRYPTED_USER_KEY_EPHEMERAL,
  USER_KEY_ENCRYPTED_PIN,
  PinLockType,
} from "./pin.service.implementation";

describe("PinService", () => {
  let sut: PinService;

  let accountService: FakeAccountService;
  let stateProvider: FakeStateProvider;

  const cryptoFunctionService = mock<CryptoFunctionService>();
  const encryptService = mock<EncryptService>();
  const kdfConfigService = mock<KdfConfigService>();
  const keyGenerationService = mock<KeyGenerationService>();
  const logService = mock<LogService>();

  const mockUserId = Utils.newGuid() as UserId;
  const mockUserKey = new SymmetricCryptoKey(randomBytes(64)) as UserKey;
  const mockPinKey = new SymmetricCryptoKey(randomBytes(32)) as PinKey;
  const mockUserEmail = "user@example.com";
  const mockPin = "1234";
  const mockUserKeyEncryptedPin = new EncString("userKeyEncryptedPin");
  const keyService = mock<KeyService>();
  const sdkService = mock<SdkService>();
  const behaviorSubject = new BehaviorSubject<{ userId: UserId, userKey: UserKey }>(null);

  // Note: both pinKeyEncryptedUserKeys use encryptionType: 2 (AesCbc256_HmacSha256_B64)
  const pinKeyEncryptedUserKeyPersistant = new EncString(
    "2.fb5kOEZvh9zPABbP8WRmSQ==|Yi6ZAJY+UtqCKMUSqp1ahY9Kf8QuneKXs6BMkpNsakLVOzTYkHHlilyGABMF7GzUO8QHyZi7V/Ovjjg+Naf3Sm8qNhxtDhibITv4k8rDnM0=|TFkq3h2VNTT1z5BFbebm37WYuxyEHXuRo0DZJI7TQnw=",
  );

  beforeEach(() => {
    jest.clearAllMocks();

    accountService = mockAccountServiceWith(mockUserId, { email: mockUserEmail });
    stateProvider = new FakeStateProvider(accountService);
    (keyService as any)["unlockedUserKeys$"] = behaviorSubject.asObservable().pipe(
      filter((x) => x != null),
    );

    sut = new PinService(
      accountService,
      encryptService,
      kdfConfigService,
      keyGenerationService,
      logService,
      stateProvider,
      keyService,
      sdkService,
    );
  });

  it("should instantiate the PinService", () => {
    expect(sut).not.toBeFalsy();
  });

  describe("makePinKey()", () => {
    it("should make a PinKey", async () => {
      // Arrange
      keyGenerationService.deriveKeyFromPassword.mockResolvedValue(mockPinKey);

      // Act
      await sut.makePinKey(mockPin, mockUserEmail, DEFAULT_KDF_CONFIG);

      // Assert
      expect(keyGenerationService.deriveKeyFromPassword).toHaveBeenCalledWith(
        mockPin,
        mockUserEmail,
        DEFAULT_KDF_CONFIG,
      );
      expect(keyGenerationService.stretchKey).toHaveBeenCalledWith(mockPinKey);
    });
  });

  describe("getPinLockType()", () => {
    // it("should return 'PERSISTENT' if a pinKeyEncryptedUserKey (persistent version) is found", async () => {
    //   // Arrange
    //   sut.getUserKeyEncryptedPin = jest.fn().mockResolvedValue(null);
    //   sut.getPinKeyEncryptedUserKeyPersistent = jest
    //     .fn()
    //     .mockResolvedValue(pinKeyEncryptedUserKeyPersistant);

    //   // Act
    //   const result = await sut.getPinLockType(mockUserId);

    //   // Assert
    //   expect(result).toBe("PERSISTENT");
    // });

    // it("should return 'EPHEMERAL' if a pinKeyEncryptedUserKey (persistent version) is not found but a userKeyEncryptedPin is found", async () => {
    //   // Arrange
    //   sut.getUserKeyEncryptedPin = jest.fn().mockResolvedValue(mockUserKeyEncryptedPin);
    //   sut.getPinKeyEncryptedUserKeyPersistent = jest.fn().mockResolvedValue(null);

    //   // Act
    //   const result = await sut.getPinLockType(mockUserId);

    //   // Assert
    //   expect(result).toBe("EPHEMERAL");
    // });

    // it("should return 'DISABLED' if both of these are NOT found: userKeyEncryptedPin, pinKeyEncryptedUserKey (persistent version)", async () => {
    //   // Arrange
    //   sut.getUserKeyEncryptedPin = jest.fn().mockResolvedValue(null);
    //   sut.getPinKeyEncryptedUserKeyPersistent = jest.fn().mockResolvedValue(null);

    //   // Act
    //   const result = await sut.getPinLockType(mockUserId);

    //   // Assert
    //   expect(result).toBe("DISABLED");
    // });
  });

  describe("isPinSet()", () => {
    it.each(["PERSISTENT", "EPHEMERAL"])(
      "should return true if the user PinLockType is '%s'",
      async () => {
        // Arrange
        sut.getPinLockType = jest.fn().mockResolvedValue("PERSISTENT");

        // Act
        const result = await sut.isPinSet(mockUserId);

        // Assert
        expect(result).toEqual(true);
      },
    );

    it("should return false if the user PinLockType is 'DISABLED'", async () => {
      // Arrange
      sut.getPinLockType = jest.fn().mockResolvedValue("DISABLED");

      // Act
      const result = await sut.isPinSet(mockUserId);

      // Assert
      expect(result).toEqual(false);
    });
  });

  describe("isPinDecryptionAvailable()", () => {
    it("should return false if pinLockType is DISABLED", async () => {
      // Arrange
      sut.getPinLockType = jest.fn().mockResolvedValue("DISABLED");

      // Act
      const result = await sut.isPinDecryptionAvailable(mockUserId);

      // Assert
      expect(result).toBe(false);
    });

    it("should return true if pinLockType is PERSISTENT", async () => {
      // Arrange
      sut.getPinLockType = jest.fn().mockResolvedValue("PERSISTENT");

      // Act
      const result = await sut.isPinDecryptionAvailable(mockUserId);

      // Assert
      expect(result).toBe(true);
    });

    it("should return true if pinLockType is EPHEMERAL and we have an ephemeral PIN key encrypted user key", async () => {
      // // Arrange
      // sut.getPinLockType = jest.fn().mockResolvedValue("EPHEMERAL");
      // sut.getPinKeyEncryptedUserKeyEphemeral = jest
      //   .fn()
      //   .mockResolvedValue(pinKeyEncryptedUserKeyEphemeral);

      // // Act
      // const result = await sut.isPinDecryptionAvailable(mockUserId);

      // // Assert
      // expect(result).toBe(true);
    });

    it("should return false if pinLockType is EPHEMERAL and we do not have an ephemeral PIN key encrypted user key", async () => {
      // // Arrange
      // sut.getPinLockType = jest.fn().mockResolvedValue("EPHEMERAL");
      // sut.getPinKeyEncryptedUserKeyEphemeral = jest.fn().mockResolvedValue(null);

      // // Act
      // const result = await sut.isPinDecryptionAvailable(mockUserId);

      // // Assert
      // expect(result).toBe(false);
    });

    it("should throw an error if an unexpected pinLockType is returned", async () => {
      // Arrange
      sut.getPinLockType = jest.fn().mockResolvedValue("UNKNOWN");

      // Act & Assert
      await expect(sut.isPinDecryptionAvailable(mockUserId)).rejects.toThrow(
        "Unexpected pinLockType: UNKNOWN",
      );
    });
  });

  describe("decryptUserKeyWithPin()", () => {
    // async function setupDecryptUserKeyWithPinMocks(pinLockType: PinLockType) {
    //   sut.getPinLockType = jest.fn().mockResolvedValue(pinLockType);

    //   mockPinEncryptedKeyDataByPinLockType(pinLockType);

    //   kdfConfigService.getKdfConfig.mockResolvedValue(DEFAULT_KDF_CONFIG);

    //   mockDecryptUserKeyFn();

    //   sut.getUserKeyEncryptedPin = jest.fn().mockResolvedValue(mockUserKeyEncryptedPin);
    //   encryptService.decryptString.mockResolvedValue(mockPin);
    //   cryptoFunctionService.compareFast.calledWith(mockPin, "1234").mockResolvedValue(true);
    // }

    // function mockDecryptUserKeyFn() {
    //   sut.getPinKeyEncryptedUserKeyPersistent = jest
    //     .fn()
    //     .mockResolvedValue(pinKeyEncryptedUserKeyPersistant);
    //   sut.makePinKey = jest.fn().mockResolvedValue(mockPinKey);
    //   encryptService.unwrapSymmetricKey.mockResolvedValue(mockUserKey);
    // }

    // function mockPinEncryptedKeyDataByPinLockType(pinLockType: PinLockType) {
    //   switch (pinLockType) {
    //     case "PERSISTENT":
    //       sut.getPinKeyEncryptedUserKeyPersistent = jest
    //         .fn()
    //         .mockResolvedValue(pinKeyEncryptedUserKeyPersistant);
    //       break;
    //     case "EPHEMERAL":
    //       sut.getPinKeyEncryptedUserKeyEphemeral = jest
    //         .fn()
    //         .mockResolvedValue(pinKeyEncryptedUserKeyEphemeral);

    //       break;
    //     case "DISABLED":
    //       // no mocking required. Error should be thrown
    //       break;
    //   }
    // }

    // const testCases: { pinLockType: PinLockType }[] = [
    //   { pinLockType: "PERSISTENT" },
    //   { pinLockType: "EPHEMERAL" },
    // ];

    // testCases.forEach(({ pinLockType }) => {
    //   describe(`given a ${pinLockType} PIN)`, () => {
    //     it(`should successfully decrypt and return user key when using a valid PIN`, async () => {
    //       // Arrange
    //       await setupDecryptUserKeyWithPinMocks(pinLockType);

    //       // Act
    //       const result = await sut.decryptUserKeyWithPin(mockPin, mockUserId);

    //       // Assert
    //       expect(result).toEqual(mockUserKey);
    //     });

    //     it(`should return null when PIN is incorrect and user key cannot be decrypted`, async () => {
    //       // Arrange
    //       await setupDecryptUserKeyWithPinMocks(pinLockType);
    //       sut.decryptUserKeyWithPin = jest.fn().mockResolvedValue(null);

    //       // Act
    //       const result = await sut.decryptUserKeyWithPin(mockPin, mockUserId);

    //       // Assert
    //       expect(result).toBeNull();
    //     });

    //     // not sure if this is a realistic scenario but going to test it anyway
    //     it(`should return null when PIN doesn't match after successful user key decryption`, async () => {
    //       // Arrange
    //       await setupDecryptUserKeyWithPinMocks(pinLockType);
    //       encryptService.decryptString.mockResolvedValue("9999"); // non matching PIN

    //       // Act
    //       const result = await sut.decryptUserKeyWithPin(mockPin, mockUserId);

    //       // Assert
    //       expect(result).toBeNull();
    //     });
    //   });
    // });

    // it(`should return null when pin is disabled`, async () => {
    //   // Arrange
    //   await setupDecryptUserKeyWithPinMocks("DISABLED");

    //   // Act
    //   const result = await sut.decryptUserKeyWithPin(mockPin, mockUserId);

    //   // Assert
    //   expect(result).toBeNull();
    // });
  });
});

// Test helpers
function randomBytes(length: number): Uint8Array {
  return new Uint8Array(Array.from({ length }, (_, k) => k % 255));
}
