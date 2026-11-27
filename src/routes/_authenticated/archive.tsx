import { createFileRoute, redirect } from "@tanstack/react-router";

// The Archive feature was removed. Old links to /archive land on the dashboard.
// This file can be deleted; it only exists so bookmarks keep working.
export const Route = createFileRoute("/_authenticated/archive")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
