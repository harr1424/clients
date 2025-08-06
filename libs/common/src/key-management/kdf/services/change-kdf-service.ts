import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { KdfRequest } from "@bitwarden/common/models/request/kdf.request";
import { UserId } from "@bitwarden/common/types/guid";
// eslint-disable-next-line no-restricted-imports
import { KdfConfig, KdfConfigService, KeyService } from "@bitwarden/key-management";
import { LogService } from "@bitwarden/logging";

import { EncString } from "../../crypto/models/enc-string";
import { InternalMasterPasswordServiceAbstraction } from "../../master-password/abstractions/master-password.service.abstraction";
import { firstValueFromOrThrow } from "../../utils";
import { ChangeKdfServiceAbstraction } from "../abstractions/change-kdf-service";

export class ChangeKdfService implements ChangeKdfServiceAbstraction {
  constructor(
    private apiService: ApiService,
    private masterPasswordService: InternalMasterPasswordServiceAbstraction,
    private keyService: KeyService,
    private kdfConfigService: KdfConfigService,
    private logService: LogService,
  ) {}

  async updateUserKdfParams(masterPassword: string, kdf: KdfConfig, userId: UserId): Promise<void> {
    const userKey = await firstValueFromOrThrow(this.keyService.userKey$(userId), "userKey");
    const salt = await firstValueFromOrThrow(
      this.masterPasswordService.saltForUser$(userId),
      "salt",
    );
    const oldKdfConfig = await firstValueFromOrThrow(
      this.kdfConfigService.getKdfConfig$(userId),
      "oldKdfConfig",
    );

    const oldAuthenticationData =
      await this.masterPasswordService.makeMasterPasswordAuthenticationData(
        masterPassword,
        oldKdfConfig,
        salt,
      );
    const authenticationData =
      await this.masterPasswordService.makeMasterPasswordAuthenticationData(
        masterPassword,
        kdf,
        salt,
      );
    const unlockData = await this.masterPasswordService.makeMasterPasswordUnlockData(
      masterPassword,
      kdf,
      salt,
      userKey,
    );
    const request = new KdfRequest(authenticationData, unlockData).authenticateWith(
      oldAuthenticationData,
    );
    await this.apiService.send("POST", "/accounts/kdf", request, true, false);
    this.logService.info(
      `[Change KDF Service] Successfully updated KDF parameters for user ${userId}`,
    );
    await this.kdfConfigService.setKdfConfig(userId, unlockData.kdf);
    await this.masterPasswordService.setMasterKeyEncryptedUserKey(
      new EncString(unlockData.masterKeyWrappedUserKey),
      userId,
    );
  }
}
