import { Users } from "lucide-react";

// Small corner badge overlaid on an avatar to mark it as a group at a
// glance — pair with a `relative` wrapper around the <Avatar>. Reuses the
// same Users icon already used for "Novo grupo" elsewhere in the app, so
// the group concept reads consistently everywhere.
export default function GroupAvatarBadge() {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary ring-2 ring-background">
      <Users className="h-2.5 w-2.5 text-primary-foreground" />
    </span>
  );
}
