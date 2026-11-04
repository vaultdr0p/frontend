import { Badge, Card } from "@stellar/design-system";

/**
 * The claim deadline, shown prominently.
 *
 * The deadline is the single most consequential fact about a vault: strictly
 * before it, recipients can claim and the admin cannot cancel; at or after it,
 * the reverse. Getting this wrong means either cancelling allocations people
 * could still have claimed, or waiting on a claim that can no longer happen.
 *
 * So it gets its own card with the absolute time, the remaining time, and an
 * explicit statement of what is currently permitted — rather than a timestamp
 * in a table that a reader has to interpret.
 */

export const formatRemaining = (deadline: Date, now: Date): string => {
  const ms = deadline.getTime() - now.getTime();

  if (ms <= 0) {
    return "The deadline has passed";
  }
  const minutes = Math.floor(ms / 60_000);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} left to claim`;
  }
  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours} hour${hours === 1 ? "" : "s"} left to claim`;
  }
  return `${Math.floor(hours / 24)} days left to claim`;
};

export const ClaimDeadline = ({
  deadline,
  isExpired,
  now = new Date(),
}: {
  deadline: Date;
  isExpired: boolean;
  /** Injected so the rendered output is deterministic in tests. */
  now?: Date;
}) => (
  <Card>
    <div className="VaultDeadline">
      <div className="VaultDeadline__header">
        <h3 className="VaultDeadline__title">Claim deadline</h3>
        <Badge variant={isExpired ? "warning" : "success"} size="md" isStatus>
          {isExpired ? "Passed" : "Open for claims"}
        </Badge>
      </div>

      <p className="VaultDeadline__date">
        <time dateTime={deadline.toISOString()}>
          {deadline.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
        </time>
      </p>

      <p className="VaultDeadline__remaining">{formatRemaining(deadline, now)}</p>

      <p className="VaultDeadline__meaning">
        {isExpired
          ? "Recipients can no longer claim. Unclaimed allocations can now be cancelled, which releases the funds back to the vault's withdrawable balance."
          : "Recipients can claim their allocations until this moment. Allocations cannot be cancelled before it."}
      </p>
    </div>
  </Card>
);
