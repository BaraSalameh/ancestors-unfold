import { Link } from "@tanstack/react-router";
import { Activity, House, LogOut, Settings, UserRound } from "lucide-react";
import { accountDisplayName } from "@/features/account";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type User = { email: string; fullNameEn: string; fullNameAr: string };
type Translate = (
  key: "user_profile" | "dashboard" | "profile_settings" | "activity_history" | "logout",
) => string;

export function HeaderAccountMenu({
  user,
  lang,
  logout,
  t,
}: {
  user: User;
  lang: "en" | "ar";
  logout: () => Promise<void>;
  t: Translate;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={t("user_profile")}>
          <UserRound className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-64">
        <DropdownMenuLabel>
          <span className="block truncate">{accountDisplayName(user, lang)}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/">
            <House className="h-4 w-4" />
            {t("dashboard")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <Settings className="h-4 w-4" />
            {t("profile_settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/activity">
            <Activity className="h-4 w-4" />
            {t("activity_history")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void logout().then(() => window.location.assign("/auth"))}
          className="text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
