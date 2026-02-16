const User = require("../models/User");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { signToken } = require("../utils/jwt");
const { success } = require("../utils/response");
const {
  generateChallenge,
  parseClientDataJSON,
  parseAuthenticatorData,
  verifyRpIdHash,
  verifyAssertionSignature,
  normalizeOrigin,
  resolveRequestOrigin,
  resolveRpId,
  toBase64Url,
} = require("../utils/webauthn");
const {
  saveRegistrationChallenge,
  consumeRegistrationChallenge,
  saveLoginChallenge,
  consumeLoginChallenge,
} = require("../services/webauthnChallengeStore");

const toSafeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  vehicleNumber: user.vehicleNumber,
});

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const getAllowedOrigins = () => {
  return env.corsOrigins.map((origin) => normalizeOrigin(origin)).filter(Boolean);
};

const validateOrigin = (origin) => {
  const allowedOrigins = getAllowedOrigins();
  const normalized = normalizeOrigin(origin);

  if (!normalized || !allowedOrigins.includes(normalized)) {
    throw new ApiError(400, "Biometric authentication is not allowed from this origin");
  }

  return normalized;
};

const validateActiveUser = (user) => {
  if (user.status !== "active") {
    throw new ApiError(403, "User is inactive. Contact admin.");
  }

  if (user.isActive === false) {
    throw new ApiError(403, "Account removed by admin");
  }
};

const signup = asyncHandler(async (req, res) => {
  const { name, email, password, role, vehicleNumber } = req.body;

  const existingUser = await User.findOne({ email: normalizeEmail(email) });
  if (existingUser) {
    throw new ApiError(409, "Email already registered");
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    vehicleNumber: role === "driver" ? vehicleNumber || null : null,
  });

  const token = signToken({ sub: user._id.toString(), role: user.role });

  return success(
    res,
    {
      token,
      user: toSafeUser(user),
    },
    "Signup successful",
    201,
  );
});

const login = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;

  const user = await User.findOne({ email: normalizeEmail(email) }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (role && user.role !== role) {
    throw new ApiError(403, "Selected role does not match this account");
  }

  validateActiveUser(user);

  const token = signToken({ sub: user._id.toString(), role: user.role });

  return success(res, {
    token,
    user: toSafeUser(user),
  }, "Login successful");
});

const beginBiometricRegistration = asyncHandler(async (req, res) => {
  const origin = validateOrigin(resolveRequestOrigin(req));
  const rpId = resolveRpId(origin);
  const challenge = generateChallenge();

  const userId = req.user._id.toString();
  saveRegistrationChallenge(userId, {
    challenge,
    origin,
    rpId,
  });

  const publicKeyOptions = {
    challenge,
    rp: {
      name: process.env.WEBAUTHN_RP_NAME || "AutoMate",
      id: rpId,
    },
    user: {
      id: toBase64Url(Buffer.from(userId, "utf8")),
      name: req.user.email,
      displayName: req.user.name,
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60000,
    attestation: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    excludeCredentials: (req.user.biometricCredentials || []).map((credential) => ({
      id: credential.credentialId,
      type: "public-key",
      transports: credential.transports,
    })),
  };

  return success(
    res,
    {
      publicKey: publicKeyOptions,
    },
    "Biometric registration options generated",
  );
});

const completeBiometricRegistration = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  const userId = req.user._id.toString();

  const challengeState = consumeRegistrationChallenge(userId);
  if (!challengeState) {
    throw new ApiError(400, "Biometric registration session expired. Try again.");
  }

  let clientData;
  try {
    ({ clientData } = parseClientDataJSON(credential.response.clientDataJSON));
  } catch (_error) {
    throw new ApiError(400, "Invalid biometric registration payload");
  }

  if (clientData.type !== "webauthn.create") {
    throw new ApiError(400, "Invalid biometric registration type");
  }

  if (clientData.challenge !== challengeState.challenge) {
    throw new ApiError(400, "Biometric registration challenge mismatch");
  }

  if (normalizeOrigin(clientData.origin) !== challengeState.origin) {
    throw new ApiError(400, "Biometric registration origin mismatch");
  }

  const credentialId = credential.rawId || credential.id;
  const transports = Array.isArray(credential.response.transports)
    ? credential.response.transports.filter((transport) => typeof transport === "string")
    : [];

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!Array.isArray(user.biometricCredentials)) {
    user.biometricCredentials = [];
  }

  const existingCredential = user.biometricCredentials.find(
    (item) => item.credentialId === credentialId,
  );

  if (existingCredential) {
    existingCredential.publicKey = credential.response.publicKey;
    existingCredential.counter = 0;
    existingCredential.transports = transports;
    existingCredential.lastUsedAt = null;
  } else {
    user.biometricCredentials.push({
      credentialId,
      publicKey: credential.response.publicKey,
      counter: 0,
      transports,
    });
  }

  await user.save();

  return success(
    res,
    {
      credentialId,
      credentialCount: user.biometricCredentials.length,
    },
    "Fingerprint authentication enabled",
  );
});

const beginBiometricLogin = asyncHandler(async (req, res) => {
  const { email, role } = req.body;
  const normalizedEmail = normalizeEmail(email);

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError(404, "No account found for this email");
  }

  if (role && user.role !== role) {
    throw new ApiError(403, "Selected role does not match this account");
  }

  validateActiveUser(user);

  if (!user.biometricCredentials || user.biometricCredentials.length === 0) {
    throw new ApiError(400, "Fingerprint is not enabled. Login with password and enable it first.");
  }

  const origin = validateOrigin(resolveRequestOrigin(req));
  const rpId = resolveRpId(origin);
  const challenge = generateChallenge();

  saveLoginChallenge(normalizedEmail, {
    challenge,
    origin,
    rpId,
    userId: user._id.toString(),
  });

  return success(
    res,
    {
      publicKey: {
        challenge,
        rpId,
        timeout: 60000,
        userVerification: "required",
        allowCredentials: user.biometricCredentials.map((credential) => ({
          id: credential.credentialId,
          type: "public-key",
          transports: credential.transports,
        })),
      },
    },
    "Biometric login options generated",
  );
});

const completeBiometricLogin = asyncHandler(async (req, res) => {
  const { email, role, credential } = req.body;
  const normalizedEmail = normalizeEmail(email);

  const challengeState = consumeLoginChallenge(normalizedEmail);
  if (!challengeState) {
    throw new ApiError(400, "Biometric login session expired. Try again.");
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user || user._id.toString() !== challengeState.userId) {
    throw new ApiError(401, "Invalid biometric login request");
  }

  if (role && user.role !== role) {
    throw new ApiError(403, "Selected role does not match this account");
  }

  validateActiveUser(user);

  const credentialId = credential.rawId || credential.id;
  const savedCredential = (user.biometricCredentials || []).find(
    (item) => item.credentialId === credentialId,
  );

  if (!savedCredential) {
    throw new ApiError(401, "Biometric credential not recognized");
  }

  let clientData;
  try {
    ({ clientData } = parseClientDataJSON(credential.response.clientDataJSON));
  } catch (_error) {
    throw new ApiError(400, "Invalid biometric login payload");
  }

  if (clientData.type !== "webauthn.get") {
    throw new ApiError(400, "Invalid biometric assertion type");
  }

  if (clientData.challenge !== challengeState.challenge) {
    throw new ApiError(400, "Biometric login challenge mismatch");
  }

  if (normalizeOrigin(clientData.origin) !== challengeState.origin) {
    throw new ApiError(400, "Biometric login origin mismatch");
  }

  let authenticatorData;
  try {
    authenticatorData = parseAuthenticatorData(credential.response.authenticatorData);
  } catch (_error) {
    throw new ApiError(400, "Invalid authenticator data");
  }

  if (!authenticatorData.userPresent || !authenticatorData.userVerified) {
    throw new ApiError(401, "Fingerprint verification was not completed");
  }

  const rpIdHashValid = verifyRpIdHash(authenticatorData.rpIdHash, challengeState.rpId);
  if (!rpIdHashValid) {
    throw new ApiError(401, "Biometric credential does not match this domain");
  }

  const signatureValid = verifyAssertionSignature({
    publicKey: savedCredential.publicKey,
    authenticatorData: credential.response.authenticatorData,
    clientDataJSON: credential.response.clientDataJSON,
    signature: credential.response.signature,
  });

  if (!signatureValid) {
    throw new ApiError(401, "Biometric signature verification failed");
  }

  if (
    savedCredential.counter > 0
    && authenticatorData.counter > 0
    && authenticatorData.counter <= savedCredential.counter
  ) {
    throw new ApiError(401, "Biometric credential counter check failed");
  }

  if (authenticatorData.counter > 0) {
    savedCredential.counter = authenticatorData.counter;
  }

  savedCredential.lastUsedAt = new Date();
  await user.save();

  const token = signToken({ sub: user._id.toString(), role: user.role });

  return success(res, {
    token,
    user: toSafeUser(user),
  }, "Biometric login successful");
});

const me = asyncHandler(async (req, res) => {
  return success(res, {
    user: toSafeUser(req.user),
  });
});

module.exports = {
  signup,
  login,
  beginBiometricRegistration,
  completeBiometricRegistration,
  beginBiometricLogin,
  completeBiometricLogin,
  me,
};
