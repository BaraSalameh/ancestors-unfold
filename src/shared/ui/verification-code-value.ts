export const normalizeVerificationCode = (value: string) => value.replace(/\D/g, "").slice(0, 6);
