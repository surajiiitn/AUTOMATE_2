const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const registrationChallenges = new Map();
const loginChallenges = new Map();

const setChallenge = (store, key, payload) => {
  store.set(key, {
    ...payload,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
};

const consumeChallenge = (store, key) => {
  const challenge = store.get(key);
  store.delete(key);

  if (!challenge) {
    return null;
  }

  if (challenge.expiresAt < Date.now()) {
    return null;
  }

  return challenge;
};

const pruneExpired = () => {
  const now = Date.now();

  for (const [key, value] of registrationChallenges.entries()) {
    if (value.expiresAt < now) {
      registrationChallenges.delete(key);
    }
  }

  for (const [key, value] of loginChallenges.entries()) {
    if (value.expiresAt < now) {
      loginChallenges.delete(key);
    }
  }
};

const pruneInterval = setInterval(pruneExpired, CHALLENGE_TTL_MS);
if (typeof pruneInterval.unref === "function") {
  pruneInterval.unref();
}

const saveRegistrationChallenge = (userId, payload) => {
  setChallenge(registrationChallenges, userId, payload);
};

const consumeRegistrationChallenge = (userId) => {
  return consumeChallenge(registrationChallenges, userId);
};

const saveLoginChallenge = (email, payload) => {
  setChallenge(loginChallenges, email, payload);
};

const consumeLoginChallenge = (email) => {
  return consumeChallenge(loginChallenges, email);
};

module.exports = {
  saveRegistrationChallenge,
  consumeRegistrationChallenge,
  saveLoginChallenge,
  consumeLoginChallenge,
};
