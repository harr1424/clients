import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { KdfRequest } from "@bitwarden/common/models/request/kdf.request";

import {
  MasterPasswordAuthenticationData,
  MasterPasswordUnlockData,
} from "../master-password/types/master-password.types";

export class ChangeKdfApiService {
  constructor(private apiService: ApiService) {}

  /**
   * Sends a request to update the user's KDF parameters.
   * @param authenticationData The authentication data for the master password with the new KDF parameters.
   * @param unlockData The unlock data for the master password with the new KDF parameters.
   * @param oldAuthenticationData The old authentication, prior to the KDF change
   */
  async updateUserKdfParams(
    authenticationData: MasterPasswordAuthenticationData,
    unlockData: MasterPasswordUnlockData,
    oldAuthenticationData: MasterPasswordAuthenticationData,
  ): Promise<void> {
    const request = new KdfRequest(authenticationData, unlockData).authenticateWith(
      oldAuthenticationData,
    );
    return this.apiService.send("POST", "/accounts/kdf", request, true, false);
  }
}
