'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Check, User, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { imageToWebp } from '@/lib/imageToWebp';
import { mediaApi } from '@/lib/media';
import { UserAvatar } from '@/components/user-avatar';
import { ColorPicker } from '@/components/theme/color-picker';
import { SurfacePicker } from '@/components/theme/surface-picker';
import { NotificationsCard, PromotionsCard } from '@/components/account/notifications-card';
import { FavoriteTeamsCard } from '@/components/account/favorite-teams-card';
import { LegalLink } from '@/components/legal/legal-dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export default function AccountPage() {
  const { user, setAvatar, updateProfile } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [name, setName] = useState(user?.display_name ?? '');
  const [savingName, setSavingName] = useState(false);

  // The user's recent avatars, so they can re-select one without re-uploading.
  const recent = useQuery({
    queryKey: ['my-avatars'],
    queryFn: () => mediaApi.myUploads('avatar', 5),
    enabled: !!user,
  });

  if (!user) return null; // the (app) layout already guards auth

  // Read-only signup consent record (null for accounts created before consent).
  const consentDate =
    user.tos_accepted_at && !Number.isNaN(new Date(user.tos_accepted_at).getTime())
      ? new Date(user.tos_accepted_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

  async function processFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG or JPG)');
      return;
    }
    setBusy(true);
    try {
      const webp = await imageToWebp(file, { size: 256, square: true });
      const asset = await mediaApi.upload('avatar', webp);
      await setAvatar(asset.s3_key);
      qc.invalidateQueries({ queryKey: ['my-avatars'] });
      toast.success('Avatar updated');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) processFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function selectAvatar(key: string) {
    if (!user || key === user.avatar_key) return;
    setBusy(true);
    try {
      await setAvatar(key);
      toast.success('Avatar updated');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    try {
      await setAvatar(null);
      toast.success('Avatar removed');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const next = name.trim();
    if (!next || next === user!.display_name) return;
    setSavingName(true);
    try {
      await updateProfile({ display_name: next });
      toast.success('Name updated');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div className="container py-5 sm:py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="hidden text-2xl font-bold text-foreground lg:block">Account</h1>

        {/* Avatar */}
        <Card className="gap-4 p-5">
          <h2 className="text-base font-semibold text-foreground">Avatar</h2>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />

          <div className="flex flex-col items-center gap-4">
            {/* Drop zone — click or drag an image onto the circle */}
            <div className="relative">
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload avatar"
                onClick={() => !busy && fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!busy) fileRef.current?.click();
                  }
                }}
                onDragEnter={(e) => { e.preventDefault(); if (!busy) setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className={cn(
                  'group relative flex size-48 cursor-pointer items-center justify-center overflow-hidden rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-dashed border-muted-foreground/25 hover:border-muted-foreground/40',
                  user.avatar_key && !isDragging && 'border-solid',
                  busy && 'pointer-events-none opacity-70',
                )}
              >
                {user.avatar_key ? (
                  <UserAvatar
                    userId={user.id}
                    name={user.display_name}
                    imageUrl={user.avatar_key}
                    className="size-48"
                    fallbackClassName="text-4xl"
                    clickable={false}
                  />
                ) : (
                  <User className="size-12 text-muted-foreground" />
                )}
              </div>

              {/* Remove — clears the current avatar */}
              {user.avatar_key && (
                <Button
                  size="icon"
                  variant="outline"
                  disabled={busy}
                  onClick={removeAvatar}
                  aria-label="Remove avatar"
                  className="absolute end-0 top-0 size-6 rounded-full"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>

            {/* Instructions */}
            <div className="space-y-0.5 text-center">
              <p className="text-sm font-medium text-foreground">
                {user.avatar_key ? 'Avatar set' : 'Upload avatar'}
              </p>
              <p className="text-xs text-muted-foreground">PNG or JPG — square images look best</p>
            </div>

            {/* Button underneath */}
            <Button size="lg" className="h-11" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" />
              {busy ? 'Uploading…' : user.avatar_key ? 'Upload new' : 'Choose image'}
            </Button>
          </div>

          {(recent.data?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-3 pt-2">
              <Label className="text-xs text-muted-foreground">Recent — tap to reuse</Label>
              <div className="flex flex-wrap gap-5 px-1 py-2">
                {recent.data!.map((a) => {
                  const active = a.s3_key === user.avatar_key;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={busy}
                      onClick={() => selectAvatar(a.s3_key)}
                      aria-label={active ? 'Current avatar' : 'Use this avatar'}
                      className={cn(
                        'relative rounded-full ring-2 ring-offset-2 ring-offset-background transition-colors disabled:opacity-60',
                        active ? 'ring-green-400' : 'ring-transparent hover:ring-input',
                      )}
                    >
                      <UserAvatar userId={user.id} name={user.display_name} imageUrl={a.s3_key} className="size-14" clickable={false} />
                      {active && (
                        <span className="absolute -right-1 -top-1 rounded-full bg-green-500 p-0.5 text-white">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Display name */}
        <Card className="gap-2 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                variant="lg"
                className="h-12 text-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                placeholder="Your name"
              />
            </div>
            <Button
              size="lg"
              className="h-12"
              disabled={savingName || !name.trim() || name.trim() === user.display_name}
              onClick={saveName}
            >
              {savingName ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>

        {/* Phone (read-only — it's the sign-in identity) */}
        <Card className="gap-2 p-5">
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" variant="lg" className="h-12 text-base" value={user.phone} readOnly disabled />
          </div>
          <p className="text-xs text-muted-foreground">
            Your phone number is how you sign in and can’t be changed here yet.
          </p>
        </Card>

        {/* Favorite teams — shown as brand pills on your profile */}
        <FavoriteTeamsCard />

        {/* Appearance — ROYGBIV primary + accent colors */}
        <Card className="gap-4 p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-foreground">Appearance</h2>
            <p className="text-xs text-muted-foreground">
              Colors and dark shade. Applies across the app on this device.
            </p>
          </div>
          <ColorPicker />
          <div className="border-t border-border pt-4">
            <SurfacePicker />
          </div>
        </Card>

        {/* Notifications + Promotions — two independent SMS consent cards */}
        <NotificationsCard />
        <PromotionsCard />

        {/* Agreements — read-only consent record */}
        <Card className="gap-2 p-5">
          <h2 className="text-base font-semibold text-foreground">Agreements</h2>
          {consentDate ? (
            <p className="text-xs text-muted-foreground">
              You agreed to the <LegalLink doc="terms">Terms of Service</LegalLink> and{' '}
              <LegalLink doc="privacy">Privacy Policy</LegalLink> on {consentDate}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Review our <LegalLink doc="terms">Terms of Service</LegalLink> and{' '}
              <LegalLink doc="privacy">Privacy Policy</LegalLink>.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
