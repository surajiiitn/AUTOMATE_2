export interface ServerCredentialDescriptor {
  id: string;
  type: "public-key";
  transports?: AuthenticatorTransport[];
}

export interface ServerBiometricRegistrationOptions {
  challenge: string;
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: "public-key";
    alg: number;
  }>;
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: ServerCredentialDescriptor[];
}

export interface ServerBiometricLoginOptions {
  challenge: string;
  rpId: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
  allowCredentials: ServerCredentialDescriptor[];
}

export interface BiometricRegistrationCredentialPayload {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    attestationObject: string;
    publicKey: string;
    publicKeyAlgorithm: number | null;
    transports: AuthenticatorTransport[];
  };
}

export interface BiometricLoginCredentialPayload {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string | null;
  };
}

type AttestationResponseWithHelpers = AuthenticatorAttestationResponse & {
  getPublicKey?: () => ArrayBuffer | null;
  getPublicKeyAlgorithm?: () => number;
  getTransports?: () => AuthenticatorTransport[];
};

const base64UrlToArrayBuffer = (value: string): ArrayBuffer => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = window.atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
};

const arrayBufferToBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window.btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const toCreationOptions = (
  options: ServerBiometricRegistrationOptions,
): PublicKeyCredentialCreationOptions => {
  return {
    ...options,
    challenge: base64UrlToArrayBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64UrlToArrayBuffer(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
};

const toRequestOptions = (options: ServerBiometricLoginOptions): PublicKeyCredentialRequestOptions => {
  return {
    ...options,
    challenge: base64UrlToArrayBuffer(options.challenge),
    allowCredentials: options.allowCredentials.map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
};

export const isWebAuthnSupported = () => {
  return (
    typeof window !== "undefined"
    && typeof window.PublicKeyCredential !== "undefined"
    && !!navigator.credentials
  );
};

export const createBiometricCredential = async (
  options: ServerBiometricRegistrationOptions,
): Promise<BiometricRegistrationCredentialPayload> => {
  if (!isWebAuthnSupported()) {
    throw new Error("Fingerprint authentication is not supported on this device");
  }

  const credential = await navigator.credentials.create({
    publicKey: toCreationOptions(options),
  });

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("Fingerprint registration was cancelled");
  }

  const response = credential.response as AttestationResponseWithHelpers;
  const publicKey = response.getPublicKey?.();
  if (!publicKey) {
    throw new Error("This browser does not support fingerprint key export");
  }

  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      publicKey: arrayBufferToBase64Url(publicKey),
      publicKeyAlgorithm: typeof response.getPublicKeyAlgorithm === "function"
        ? response.getPublicKeyAlgorithm()
        : null,
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
  };
};

export const getBiometricAssertion = async (
  options: ServerBiometricLoginOptions,
): Promise<BiometricLoginCredentialPayload> => {
  if (!isWebAuthnSupported()) {
    throw new Error("Fingerprint authentication is not supported on this device");
  }

  const credential = await navigator.credentials.get({
    publicKey: toRequestOptions(options),
  });

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("Fingerprint verification was cancelled");
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : null,
    },
  };
};
