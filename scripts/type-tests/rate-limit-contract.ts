import {
  rateLimitResponse,
  type RateLimitExceededResult,
  type RateLimitUnavailableResult,
} from "@/lib/security/rateLimit";

function assertRateLimitResponseTypeSafety(
  exceeded: RateLimitExceededResult,
  unavailable: RateLimitUnavailableResult,
) {
  rateLimitResponse(exceeded);
  // @ts-expect-error unavailable must never be accepted by the 429 response helper
  rateLimitResponse(unavailable);
}

void assertRateLimitResponseTypeSafety;
