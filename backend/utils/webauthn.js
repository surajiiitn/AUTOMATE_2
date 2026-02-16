const crypto = require("crypto");

const toBase64Url = (value) => {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const fromBase64Url = (value) => {
  if (typeof value !== "string" || !value) {
    throw new Error("Value must be a non-empty base64url string");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
};

const generateChallenge = (size = 32) => {
  return toBase64Url(crypto.randomBytes(size));
};

const parseClientDataJSON = (clientDataBase64Url) => {
  const rawClientData = fromBase64Url(clientDataBase64Url);

  let clientData;
  try {
    clientData = JSON.parse(rawClientData.toString("utf8"));
  } catch (_error) {
    throw new Error("Invalid clientDataJSON payload");
  }

  return {
    rawClientData,
    clientData,
  };
};

const parseAuthenticatorData = (authenticatorDataBase64Url) => {
  const rawAuthenticatorData = fromBase64Url(authenticatorDataBase64Url);

  if (rawAuthenticatorData.length < 37) {
    throw new Error("Invalid authenticatorData length");
  }

  const flags = rawAuthenticatorData[32];

  return {
    rawAuthenticatorData,
    rpIdHash: rawAuthenticatorData.subarray(0, 32),
    flags,
    counter: rawAuthenticatorData.readUInt32BE(33),
    userPresent: Boolean(flags & 0x01),
    userVerified: Boolean(flags & 0x04),
  };
};

const verifyRpIdHash = (rpIdHash, rpId) => {
  const expectedHash = crypto.createHash("sha256").update(rpId, "utf8").digest();

  if (rpIdHash.length !== expectedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(rpIdHash, expectedHash);
};

const verifyAssertionSignature = ({
  publicKey,
  authenticatorData,
  clientDataJSON,
  signature,
}) => {
  try {
    const publicKeyObject = crypto.createPublicKey({
      key: fromBase64Url(publicKey),
      format: "der",
      type: "spki",
    });

    const authenticatorDataBuffer = fromBase64Url(authenticatorData);
    const clientDataJSONBuffer = fromBase64Url(clientDataJSON);
    const signatureBuffer = fromBase64Url(signature);
    const clientDataHash = crypto.createHash("sha256").update(clientDataJSONBuffer).digest();
    const payload = Buffer.concat([authenticatorDataBuffer, clientDataHash]);

    return crypto.verify("sha256", payload, publicKeyObject, signatureBuffer);
  } catch (_error) {
    return false;
  }
};

const normalizeOrigin = (origin) => {
  if (typeof origin !== "string") {
    return null;
  }

  return origin.trim().replace(/\/$/, "");
};

const resolveRequestOrigin = (req) => {
  const directOrigin = normalizeOrigin(req.headers.origin);
  if (directOrigin) {
    return directOrigin;
  }

  const host = req.get("host");
  if (!host) {
    return null;
  }

  const protocol = req.secure ? "https" : "http";
  return normalizeOrigin(`${protocol}://${host}`);
};

const resolveRpId = (origin) => {
  const customRpId = process.env.WEBAUTHN_RP_ID;
  if (typeof customRpId === "string" && customRpId.trim()) {
    return customRpId.trim();
  }

  if (!origin) {
    return "localhost";
  }

  try {
    return new URL(origin).hostname;
  } catch (_error) {
    return "localhost";
  }
};

module.exports = {
  toBase64Url,
  fromBase64Url,
  generateChallenge,
  parseClientDataJSON,
  parseAuthenticatorData,
  verifyRpIdHash,
  verifyAssertionSignature,
  normalizeOrigin,
  resolveRequestOrigin,
  resolveRpId,
};
