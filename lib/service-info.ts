export const operatorName =
  process.env.NEXT_PUBLIC_OPERATOR_NAME || "DubbingNow";
const address = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
export const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
  ? address
  : "";
