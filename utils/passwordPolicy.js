const MIN_PASSWORD_LENGTH = 8;

function passwordLengthError(password) {
  if (!password || String(password).trim().length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  passwordLengthError,
};
