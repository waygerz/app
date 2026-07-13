'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Trash2, Check } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { imageToWebp } from '@/lib/imageToWebp';
import { mediaApi } from '@/lib/media';
import { UserAvatar } from '@/components/user-avatar';
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
  const [name, setName] = useState(user?.display_name ?? '');
  const [savingName, setSavingName] = useState(false);

  // The user's recent avatars, so they can re-select one without re-uploading.
  const recent = useQuery({
    queryKey: ['my-avatars'],
    queryFn: () => mediaApi.myUploads('avatar', 10),
    enabled: !!user,
  });

  if (!user) return null; // the (app) layout already guards auth

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
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
    <div className="container py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-foreground">Account</h1>

        {/* Avatar */}
        <Card className="gap-4 p-5">
          <h2 className="text-base font-semibold text-foreground">Avatar</h2>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          <div className="flex items-center gap-4">
            <UserAvatar
              userId={user.id}
              name={user.display_name}
              imageUrl={user.avatar_key}
              className="size-20"
              fallbackClassName="text-2xl"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-4" />
                {busy ? 'Uploading…' : 'Upload new'}
              </Button>
              {user.avatar_key && (
                <Button size="sm" variant="outline" disabled={busy} onClick={removeAvatar}>
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              )}
            </div>
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
                      <UserAvatar userId={user.id} name={user.display_name} imageUrl={a.s3_key} className="size-14" />
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
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                placeholder="Your name"
              />
            </div>
            <Button
              disabled={savingName || !name.trim() || name.trim() === user.display_name}
              onClick={saveName}
            >
              {savingName ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>

        {/* Phone (read-only — it's the sign-in identity) */}
        <Card className="gap-2 p-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={user.phone} readOnly disabled />
          </div>
          <p className="text-xs text-muted-foreground">
            Your phone number is how you sign in and can’t be changed here yet.
          </p>
        </Card>
      </div>
    </div>
  );
}
