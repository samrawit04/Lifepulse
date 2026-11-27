import { createFileRoute, redirect } from "@tanstack/react-router";

// The Pinterest page was removed. Old links land on the dashboard.
// This file can be deleted; it only exists so bookmarks keep working.
export const Route = createFileRoute("/_authenticated/pinterest")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
