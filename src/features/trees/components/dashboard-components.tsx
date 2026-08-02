import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { useI18n } from "@/shared/i18n";
import type { OwnershipTransfer } from "../pages/dashboard-types";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";

export function DashboardActionTooltip({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="space-y-0.5">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function OwnershipTransferPrompt({
  transfer,
  local,
  action,
  onAction,
}: {
  transfer: OwnershipTransfer;
  local: (en?: string | null, ar?: string | null) => string;
  action: "accept" | "reject" | "cancel" | "request" | "verify" | "resend" | undefined;
  onAction: (action: "accept" | "reject") => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>{t("ownership_transfer_request")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("ownership_transfer_request_desc", {
            owner: local(transfer.current_owner_name_en, transfer.current_owner_name_ar),
            tree: local(transfer.tree_name_en, transfer.tree_name_ar),
          })}
        </p>
        <div className="rounded-lg bg-muted p-3 text-sm">
          {t("ownership_transfer_branch_swap", {
            branch: local(transfer.branch_name_en, transfer.branch_name_ar),
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            loading={action === "accept"}
            disabled={Boolean(action)}
            onClick={() => void onAction("accept")}
          >
            {t("accept_ownership")}
          </Button>
          <Button
            variant="outline"
            loading={action === "reject"}
            disabled={Boolean(action)}
            onClick={() => void onAction("reject")}
          >
            {t("reject")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function OwnershipTransferStatus({
  transfer,
  controller,
  local,
}: {
  transfer: OwnershipTransfer;
  controller: OwnershipTransferController;
  local: (en?: string | null, ar?: string | null) => string;
}) {
  const { t } = useI18n();
  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{t("ownership_transfer_pending")}</p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {t(
                transfer.verified
                  ? "awaiting_contributor_acceptance"
                  : "verification_code_required",
              )}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("ownership_transfer_to", {
              name: local(transfer.proposed_owner_name_en, transfer.proposed_owner_name_ar),
              branch: local(transfer.branch_name_en, transfer.branch_name_ar),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!transfer.verified && (
            <Button variant="outline" onClick={() => controller.setOpen(true)}>
              {t("continue_ownership_transfer")}
            </Button>
          )}
          <Button
            variant="outline"
            loading={controller.action === "cancel"}
            disabled={Boolean(controller.action)}
            onClick={() => void controller.act("cancel")}
          >
            {t("cancel_transfer")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 border-b p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-e sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:border-e lg:last:border-e-0">
      <span className="text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function DashboardFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
