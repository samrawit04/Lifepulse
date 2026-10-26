import React, { useState, useEffect, useRef } from "react";
import { LogOut, Pencil, Camera, Check, Sparkles, X, User as UserIcon, SlidersHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrentUser } from "@/hooks/use-lifeos";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PROFILE_STORAGE_KEY = "lifepulse.user_profile.v1";

interface UserProfileData {
  displayName: string;
  avatarUrl: string;
  statusMessage: string;
}

const PRESET_AVATARS = [
  { label: "Plant", url: "https://images.unsplash.com/photo-1545241047-6083a3684587?w=150&auto=format&fit=crop&q=80" },
  { label: "Coffee", url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=150&auto=format&fit=crop&q=80" },
  { label: "Night Sky", url: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=150&auto=format&fit=crop&q=80" },
  { label: "Nature", url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=150&auto=format&fit=crop&q=80" },
  { label: "Cozy Cat", url: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=150&auto=format&fit=crop&q=80" },
  { label: "Art", url: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80" },
];

function deriveDefaultName(email?: string): string {
  if (!email) return "User";
  const prefix = email.split("@")[0] || "User";
  // remove numbers and special characters for a clean first name
  const clean = prefix.replace(/[0-9._-]+/g, " ").trim();
  if (!clean) return "User";
  // capitalize words
  return clean
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "U";
}

interface SidebarUserProfileProps {
  onSignOut: () => void;
  onCustomize?: () => void;
}

export function SidebarUserProfile({ onSignOut, onCustomize }: SidebarUserProfileProps) {
  const { data: user } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfileData>(() => {
    if (typeof window === "undefined") {
      return { displayName: "", avatarUrl: "", statusMessage: "" };
    }
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : { displayName: "", avatarUrl: "", statusMessage: "" };
    } catch {
      return { displayName: "", avatarUrl: "", statusMessage: "" };
    }
  });

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Sync default name if profile displayName is empty
  const defaultName = deriveDefaultName(user?.email);
  const displayName = profile.displayName.trim() || defaultName;
  const initials = deriveInitials(displayName);

  const handleOpenEdit = () => {
    setEditName(profile.displayName || defaultName);
    setEditAvatar(profile.avatarUrl || "");
    setEditStatus(profile.statusMessage || "");
    setIsEditOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfileData = {
      displayName: editName.trim(),
      avatarUrl: editAvatar.trim(),
      statusMessage: editStatus.trim(),
    };
    setProfile(updated);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("lifepulse:profile-updated", { detail: updated }));
      toast.success("Profile updated");
    } catch (err) {
      console.error(err);
    }
    setIsEditOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    try {
      setIsUploading(true);
      const url = await uploadToCloudinary(file, "lifepulse_avatars");
      setEditAvatar(url);
      toast.success("Avatar uploaded");
    } catch (err) {
      console.error("Avatar upload failed", err);
      toast.error("Failed to upload avatar");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="relative border-t border-sidebar-border p-3 space-y-1.5">
        {onCustomize && (
          <button
            type="button"
            onClick={onCustomize}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-white/[0.04] hover:text-foreground"
            title="Customize sidebar navigation"
          >
            <SlidersHorizontal
              className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground"
              strokeWidth={1.75}
            />
            <span className="flex-1 text-left">Customize</span>
          </button>
        )}

        <div className="group/user flex items-center gap-2.5 rounded-2xl p-2 transition-all duration-200 border border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05]">
          {/* User Info clickable button to open profile customization */}
          <button
            type="button"
            onClick={handleOpenEdit}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer focus-visible:outline-none"
            title="Click to customize your profile"
          >
            <div className="relative shrink-0">
              <Avatar className="h-9 w-9 rounded-xl border border-white/10 bg-gradient-to-br from-primary/30 via-accent/20 to-primary/10 shadow-sm">
                {profile.avatarUrl ? (
                  <AvatarImage src={profile.avatarUrl} alt={displayName} className="object-cover rounded-xl" />
                ) : null}
                <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate text-xs font-semibold text-foreground group-hover/user:text-primary transition-colors">
                  {displayName}
                </p>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground/40 opacity-0 group-hover/user:opacity-100 transition-opacity shrink-0" />
              </div>
              <p
                className="truncate text-[10px] text-muted-foreground/80 leading-tight mt-0.5"
                title={profile.statusMessage || "Personal Workspace"}
              >
                {profile.statusMessage || "Personal Workspace"}
              </p>
            </div>
          </button>

          {/* Quick Sign Out Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmSignOutOpen(true)}
            title="Sign out"
            className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md border-white/10 bg-card/95 text-foreground backdrop-blur-2xl shadow-2xl rounded-3xl p-6 sm:p-7">
          <form onSubmit={handleSave} className="space-y-5">
            <DialogHeader className="space-y-1.5 text-left">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="font-display text-lg sm:text-xl font-bold tracking-tight text-foreground">
                    Personal Profile
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Customize your display name, avatar, and workspace identity.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-3 py-2 border-y border-white/5">
              <div className="relative group">
                <Avatar className="h-20 w-20 rounded-2xl border-2 border-white/10 shadow-lg bg-gradient-to-br from-primary/30 via-accent/20 to-primary/10">
                  {editAvatar ? (
                    <AvatarImage src={editAvatar} alt={editName || displayName} className="object-cover rounded-2xl" />
                  ) : null}
                  <AvatarFallback className="rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold text-xl">
                    {deriveInitials(editName || displayName)}
                  </AvatarFallback>
                </Avatar>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="absolute inset-0 grid place-items-center rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium cursor-pointer backdrop-blur-xs"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Camera className="h-5 w-5" />
                    <span>Change</span>
                  </div>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Preset avatars selection */}
              <div className="w-full">
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5 text-center">Or pick a preset avatar:</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {PRESET_AVATARS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setEditAvatar(p.url)}
                      className={cn(
                        "relative h-8 w-8 rounded-xl overflow-hidden border transition-all cursor-pointer",
                        editAvatar === p.url
                          ? "border-primary ring-2 ring-primary/40 scale-105"
                          : "border-white/10 hover:border-white/30 opacity-70 hover:opacity-100"
                      )}
                      title={p.label}
                    >
                      <img src={p.url} alt={p.label} className="h-full w-full object-cover" />
                    </button>
                  ))}
                  {editAvatar && (
                    <button
                      type="button"
                      onClick={() => setEditAvatar("")}
                      className="h-8 px-2 rounded-xl border border-white/10 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition flex items-center gap-1 cursor-pointer"
                      title="Clear custom avatar to use initials"
                    >
                      <X className="h-3 w-3" />
                      <span>Initials</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-xs font-medium text-foreground">
                  Display Name
                </Label>
                <Input
                  id="displayName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={defaultName}
                  className="h-9 rounded-xl border-white/10 bg-white/[0.03] text-sm focus-visible:border-primary/50"
                  maxLength={40}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="statusMessage" className="text-xs font-medium text-foreground">
                  Status or Motto (optional)
                </Label>
                <Input
                  id="statusMessage"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  placeholder="e.g. In the flow · Making progress"
                  className="h-9 rounded-xl border-white/10 bg-white/[0.03] text-sm focus-visible:border-primary/50"
                  maxLength={60}
                />
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Account Email</span>
                <span className="font-medium text-foreground truncate max-w-[200px]">{user?.email || "Signed In"}</span>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditOpen(false)}
                className="rounded-xl h-9 text-xs border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="rounded-xl h-9 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 px-4"
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Save Profile
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sign Out Confirmation Dialog */}
      <AlertDialog open={confirmSignOutOpen} onOpenChange={setConfirmSignOutOpen}>
        <AlertDialogContent className="border border-white/10 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-2xl rounded-3xl max-w-sm p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-base font-bold text-foreground flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-destructive/15 text-destructive shrink-0">
                <LogOut className="h-4 w-4" />
              </span>
              Sign out?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-medium text-muted-foreground leading-relaxed pt-1.5">
              Are you sure you want to sign out? You will need to log back in to access your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="h-9 rounded-xl border border-white/10 bg-white/[0.04] text-foreground hover:bg-white/10 text-xs font-semibold">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSignOutOpen(false);
                onSignOut();
              }}
              className="h-9 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-semibold shadow-sm px-4"
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
